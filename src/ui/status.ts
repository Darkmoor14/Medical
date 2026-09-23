import type { ProgressEvent } from "../worker-protocol";

export function shortModel(id: string): string {
  return id.replace(/^OpenMed\/OpenMed-/, "").replace(/-onnx-android$/, "");
}

export function progressText(p: ProgressEvent): string {
  if (p.stage === "download") {
    const file = p.file ? ` (${p.file})` : "";
    return `Downloading ${shortModel(p.model)}${file}… ${Math.round(p.progress)}%`;
  }
  if (p.stage === "translate") return `Translating to English on this device… ${Math.round(p.progress)}%`;
  if (p.model) return `Running ${shortModel(p.model)}…`;
  return `Analyzing… ${Math.round(p.progress)}%`;
}

// Errors render as a styled child so the next textContent update clears them.
export function showError(el: HTMLElement, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  const span = document.createElement("span");
  span.className = "error";
  span.textContent = `Error: ${msg}`;
  el.replaceChildren(span);
}
