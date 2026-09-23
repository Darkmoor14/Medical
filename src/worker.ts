/// <reference lib="webworker" />
// Runs OpenMed models off the main thread. Text sent here never leaves the
// browser: the only network traffic is the one-time model download.

import * as transformers from "@huggingface/transformers";
import { extractPii, loadOnnxModel, type LoadOnnxModelOptions } from "openmed";
import { chunkText, type Span } from "./entities";
import type { WorkerRequest, WorkerResponse, EngineSettings } from "./worker-protocol";

type Pipeline = Awaited<ReturnType<typeof loadOnnxModel>>;

const pipelines = new Map<string, Promise<Pipeline>>();
type Translator = (text: string, options: Record<string, unknown>) => Promise<{ translation_text: string }[]>;
const translators = new Map<string, Promise<Translator>>();
let settings: EngineSettings = { device: "wasm", source: "hub", localPath: "/models/" };

function post(msg: WorkerResponse) {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);
}

function configure(next: EngineSettings) {
  const changed =
    next.device !== settings.device ||
    next.source !== settings.source ||
    next.localPath !== settings.localPath;
  settings = next;
  const env = transformers.env as unknown as Record<string, unknown>;
  env.localModelPath = settings.localPath;
  env.allowLocalModels = settings.source === "local";
  env.allowRemoteModels = settings.source === "hub";
  if (changed) {
    for (const p of pipelines.values()) {
      p.then((pipe) => (pipe as unknown as { dispose?: () => void }).dispose?.()).catch(() => {});
    }
    pipelines.clear();
    translators.clear();
  }
}

function downloadProgress(model: string, requestId: number) {
  return (info: { status: string; file?: string; progress?: number }) => {
    if (info.status === "progress" || info.status === "done" || info.status === "ready") {
      post({
        id: requestId,
        type: "progress",
        stage: "download",
        model,
        file: info.file ?? "",
        progress: info.status === "progress" ? (info.progress ?? 0) : 100,
      });
    }
  };
}

function getTranslator(model: string, requestId: number): Promise<Translator> {
  let p = translators.get(model);
  if (!p) {
    // Seq2seq translation runs on the CPU backend with 8-bit weights: it is
    // the most widely supported combination for these models.
    p = transformers.pipeline("translation", model, {
      device: "wasm",
      dtype: "q8",
      local_files_only: settings.source === "local",
      progress_callback: downloadProgress(model, requestId),
    } as never) as unknown as Promise<Translator>;
    p.catch(() => translators.delete(model));
    translators.set(model, p);
  }
  return p;
}

async function translate(
  segments: string[],
  model: string,
  srcLang: string,
  tgtLang: string,
  requestId: number,
): Promise<string[]> {
  const translator = await getTranslator(model, requestId);
  const out: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const lead = seg.match(/^\s*/)![0];
    const trail = seg.match(/\s*$/)![0];
    const body = seg.trim();
    if (!body) {
      out.push(seg);
      continue;
    }
    const [result] = await translator(body, { src_lang: srcLang, tgt_lang: tgtLang, max_new_tokens: 512 });
    out.push(lead + (result?.translation_text ?? body) + trail);
    post({
      id: requestId,
      type: "progress",
      stage: "translate",
      model,
      file: "",
      progress: ((i + 1) / segments.length) * 100,
    });
  }
  return out;
}

function getPipeline(model: string, requestId: number): Promise<Pipeline> {
  let p = pipelines.get(model);
  if (!p) {
    const local = settings.source === "local";
    const options: LoadOnnxModelOptions = {
      runtime: transformers as never,
      device: settings.device,
      // The file suffix comes from `variant`, so pin dtype to fp32 to stop
      // transformers.js from appending its own "_quantized" suffix.
      dtype: "fp32",
      variant: settings.device === "webgpu" ? "fp16" : "int8",
      localFilesOnly: local,
      allowRemoteModels: !local,
      pipelineOptions: {
        progress_callback: downloadProgress(model, requestId),
      },
    };
    p = loadOnnxModel(model, options);
    p.catch(() => pipelines.delete(model));
    pipelines.set(model, p);
  }
  return p;
}

async function detect(model: string, text: string, threshold: number, requestId: number) {
  const pipeline = await getPipeline(model, requestId);
  const spans: Span[] = [];
  for (const chunk of chunkText(text)) {
    const found = await extractPii(chunk.text, { pipeline: pipeline as never, threshold });
    for (const s of found) {
      spans.push({
        start: s.start + chunk.offset,
        end: s.end + chunk.offset,
        label: s.entity_type,
        score: s.score,
      });
    }
  }
  return spans;
}

async function handle(req: WorkerRequest) {
  switch (req.type) {
    case "configure":
      configure(req.settings);
      post({ id: req.id, type: "result", result: null });
      return;
    case "preload":
      for (const model of req.models) await getPipeline(model, req.id);
      post({ id: req.id, type: "result", result: null });
      return;
    case "analyzeNote": {
      const pii = await detect(req.piiModel, req.text, req.piiThreshold, req.id);
      const clinical: Span[] = [];
      for (const model of req.nerModels) {
        post({ id: req.id, type: "progress", stage: "analyze", model, file: "", progress: 0 });
        clinical.push(...(await detect(model, req.text, req.threshold, req.id)));
      }
      post({ id: req.id, type: "result", result: { pii, clinical } });
      return;
    }
    case "translate": {
      const result = await translate(req.segments, req.model, req.srcLang, req.tgtLang, req.id);
      post({ id: req.id, type: "result", result });
      return;
    }
    case "extractMany": {
      const out: { id: string; spans: Span[] }[] = [];
      for (let i = 0; i < req.docs.length; i++) {
        const doc = req.docs[i];
        const spans: Span[] = [];
        for (const model of req.nerModels) {
          spans.push(...(await detect(model, doc.text, req.threshold, req.id)));
        }
        out.push({ id: doc.id, spans });
        post({
          id: req.id,
          type: "progress",
          stage: "analyze",
          model: "",
          file: "",
          progress: ((i + 1) / req.docs.length) * 100,
        });
      }
      post({ id: req.id, type: "result", result: out });
      return;
    }
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  handle(event.data).catch((err: unknown) => {
    post({
      id: event.data.id,
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  });
};
