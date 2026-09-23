import { DETECTORS, detectorModelId, PII_MODEL, type ModelSize } from "./models";
import type { EngineSettings } from "./worker-protocol";

export interface Settings extends EngineSettings {
  detectors: string[];
  size: ModelSize;
  threshold: number;
  piiThreshold: number;
  apiKey: string;
  translationModel: string;
}

// Multilingual NLLB model converted for Transformers.js; covers Romanian → English.
export const DEFAULT_TRANSLATION_MODEL = "Xenova/nllb-200-distilled-600M";

const KEY = "openmed-pubmed-settings-v1";

export const DEFAULT_SETTINGS: Settings = {
  detectors: DETECTORS.filter((d) => d.defaultOn).map((d) => d.key),
  size: "fast",
  threshold: 0.5,
  piiThreshold: 0.3,
  apiKey: "",
  translationModel: DEFAULT_TRANSLATION_MODEL,
  device: "wasm",
  source: "hub",
  localPath: "/models/",
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    // Storage may be unavailable (private mode); fall back to defaults.
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Non-fatal: settings just won't persist.
  }
}

export function nerModels(s: Settings): string[] {
  return DETECTORS.filter((d) => s.detectors.includes(d.key)).map((d) => detectorModelId(d, s.size));
}

export function allModels(s: Settings): string[] {
  return [PII_MODEL, ...nerModels(s)];
}

export function engineSettings(s: Settings): EngineSettings {
  return { device: s.device, source: s.source, localPath: s.localPath };
}
