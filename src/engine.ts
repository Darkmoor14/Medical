// Main-thread client for the model worker.

import type { Span } from "./entities";
import type {
  EngineSettings,
  NoteAnalysis,
  ProgressEvent,
  WorkerRequest,
  WorkerResponse,
} from "./worker-protocol";

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  onProgress?: (p: ProgressEvent) => void;
};

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

export class Engine {
  private worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor() {
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      const p = this.pending.get(msg.id);
      if (!p) return;
      if (msg.type === "progress") p.onProgress?.(msg);
      else {
        this.pending.delete(msg.id);
        if (msg.type === "result") p.resolve(msg.result);
        else p.reject(new Error(msg.message));
      }
    };
  }

  private call<T>(
    req: DistributiveOmit<WorkerRequest, "id">,
    onProgress?: (p: ProgressEvent) => void,
  ): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
      this.worker.postMessage({ ...req, id } as WorkerRequest);
    });
  }

  configure(settings: EngineSettings) {
    return this.call<null>({ type: "configure", settings });
  }

  preload(models: string[], onProgress?: (p: ProgressEvent) => void) {
    return this.call<null>({ type: "preload", models }, onProgress);
  }

  analyzeNote(
    args: { text: string; piiModel: string; piiThreshold: number; nerModels: string[]; threshold: number },
    onProgress?: (p: ProgressEvent) => void,
  ) {
    return this.call<NoteAnalysis>({ type: "analyzeNote", ...args }, onProgress);
  }

  extractMany(
    args: { docs: { id: string; text: string }[]; nerModels: string[]; threshold: number },
    onProgress?: (p: ProgressEvent) => void,
  ) {
    return this.call<{ id: string; spans: Span[] }[]>({ type: "extractMany", ...args }, onProgress);
  }
}
