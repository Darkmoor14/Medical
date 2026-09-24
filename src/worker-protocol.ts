export interface EngineSettings {
  device: "wasm" | "webgpu";
  source: "hub" | "local";
  localPath: string;
}

export type WorkerRequest =
  | { id: number; type: "configure"; settings: EngineSettings }
  | { id: number; type: "preload"; models: string[] }
  | {
      id: number;
      type: "extractMany";
      docs: { id: string; text: string }[];
      nerModels: string[];
      threshold: number;
    };

export interface ProgressEvent {
  stage: "download" | "analyze";
  model: string;
  file: string;
  progress: number;
}

export type WorkerResponse =
  | ({ id: number; type: "progress" } & ProgressEvent)
  | { id: number; type: "result"; result: unknown }
  | { id: number; type: "error"; message: string };
