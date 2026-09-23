/// <reference lib="webworker" />
// Runs OpenMed models off the main thread. Text sent here never leaves the
// browser: the only network traffic is the one-time model download.

import * as transformers from "@huggingface/transformers";
import { extractPii, loadOnnxModel, type LoadOnnxModelOptions } from "openmed";
import { chunkText, type Span } from "./entities";
import type { WorkerRequest, WorkerResponse, EngineSettings } from "./worker-protocol";

type Pipeline = Awaited<ReturnType<typeof loadOnnxModel>>;

const pipelines = new Map<string, Promise<Pipeline>>();
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
  }
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
        progress_callback: (info: { status: string; file?: string; progress?: number }) => {
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
        },
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
