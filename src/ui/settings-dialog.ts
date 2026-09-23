import { h } from "./dom";
import { progressText, shortModel, showError } from "./status";
import type { Engine } from "../engine";
import { DETECTORS, detectorModelId } from "../models";
import {
  allModels,
  DEFAULT_TRANSLATION_MODEL,
  engineSettings,
  saveSettings,
  type Settings,
} from "../settings";

export function settingsDialog(
  engine: Engine,
  getSettings: () => Settings,
  setSettings: (s: Settings) => void,
): HTMLDialogElement {
  const dialog = h("dialog", { className: "settings", "aria-labelledby": "settings-title" });

  function render() {
    const s = { ...getSettings(), detectors: [...getSettings().detectors] };
    const status = h("p", { className: "status", role: "status" });
    const downloadBtn = h("button", { type: "button" }, "Download models now");
    downloadBtn.addEventListener("click", async () => {
      downloadBtn.disabled = true;
      try {
        await apply();
        await engine.preload(allModels(s), (p) => (status.textContent = progressText(p)));
        status.textContent = "Models are ready and cached in this browser.";
      } catch (err) {
        showError(status, err);
      } finally {
        downloadBtn.disabled = false;
      }
    });

    async function apply() {
      setSettings(s);
      saveSettings(s);
      await engine.configure(engineSettings(s));
    }

    const radio = <K extends keyof Settings>(name: K, value: Settings[K], label: string, hint?: string) =>
      h(
        "label",
        { className: "radio" },
        h("input", {
          type: "radio",
          name,
          checked: s[name] === value,
          onchange: () => {
            s[name] = value;
          },
        }),
        h("span", {}, label, hint && h("small", {}, hint)),
      );

    dialog.replaceChildren(
      h(
        "form",
        {
          method: "dialog",
          onsubmit: async () => {
            await apply();
          },
        },
        h("h2", { id: "settings-title" }, "Settings"),
        h(
          "fieldset",
          {},
          h("legend", {}, "Detectors"),
          ...DETECTORS.map((d) =>
            h(
              "label",
              { className: "check" },
              h("input", {
                type: "checkbox",
                checked: s.detectors.includes(d.key),
                onchange: (e: Event) => {
                  const on = (e.target as HTMLInputElement).checked;
                  s.detectors = on ? [...s.detectors, d.key] : s.detectors.filter((k) => k !== d.key);
                },
              }),
              h("span", {}, d.label, h("small", {}, shortModel(detectorModelId(d, s.size)))),
            ),
          ),
          h(
            "label",
            { className: "check" },
            h("input", {
              type: "checkbox",
              checked: s.findings,
              onchange: (e: Event) => (s.findings = (e.target as HTMLInputElement).checked),
            }),
            h("span", {}, "Signs & symptoms", h("small", {}, "Rule-based list (pallor, oedema, murmurs…), no download")),
          ),
          h("p", { className: "muted small" }, "Each detector is a separate model. More detectors means more to download and slower analysis."),
        ),
        h(
          "fieldset",
          {},
          h("legend", {}, "Model size"),
          radio("size", "fast", "Fast", "About 33M parameters. Smaller download."),
          radio("size", "accurate", "Accurate", "About 109M parameters, trained on PubMed text."),
        ),
        h(
          "fieldset",
          {},
          h("legend", {}, "Confidence"),
          h(
            "label",
            { className: "range" },
            "Minimum score for clinical terms ",
            h("input", {
              type: "range",
              min: 0,
              max: 0.95,
              step: 0.05,
              value: s.threshold,
              oninput: (e: Event) => {
                s.threshold = Number((e.target as HTMLInputElement).value);
                (e.target as HTMLInputElement).nextElementSibling!.textContent = s.threshold.toFixed(2);
              },
            }),
            h("output", {}, s.threshold.toFixed(2)),
          ),
          h(
            "label",
            { className: "range" },
            "Minimum score for identifiers ",
            h("input", {
              type: "range",
              min: 0,
              max: 0.95,
              step: 0.05,
              value: s.piiThreshold,
              oninput: (e: Event) => {
                s.piiThreshold = Number((e.target as HTMLInputElement).value);
                (e.target as HTMLInputElement).nextElementSibling!.textContent = s.piiThreshold.toFixed(2);
              },
            }),
            h("output", {}, s.piiThreshold.toFixed(2)),
          ),
          h("p", { className: "muted small" }, "Keep the identifier threshold low. Removing too much is safer than leaving an identifier in."),
        ),
        h(
          "fieldset",
          {},
          h("legend", {}, "Where models load from"),
          radio("source", "hub", "Hugging Face", "Downloaded once, then cached by the browser."),
          radio("source", "local", "Local folder", "Fully offline. See scripts/download-models.mjs."),
          h(
            "label",
            { className: "text" },
            "Local folder path ",
            h("input", {
              type: "text",
              value: s.localPath,
              oninput: (e: Event) => (s.localPath = (e.target as HTMLInputElement).value),
            }),
          ),
        ),
        h(
          "fieldset",
          {},
          h("legend", {}, "Compute"),
          radio("device", "wasm", "CPU (WebAssembly)", "Works everywhere."),
          radio("device", "webgpu", "GPU (WebGPU)", "Faster in recent Chrome and Edge."),
        ),
        h(
          "fieldset",
          {},
          h("legend", {}, "Romanian notes"),
          h(
            "label",
            { className: "text" },
            "Translation model (Romanian → English) ",
            h("input", {
              type: "text",
              value: s.translationModel,
              spellcheck: false,
              oninput: (e: Event) =>
                (s.translationModel = (e.target as HTMLInputElement).value.trim() || DEFAULT_TRANSLATION_MODEL),
            }),
          ),
          h(
            "p",
            { className: "muted small" },
            "Romanian notes are de-identified, translated on this device, and then analysed by the English clinical models. The default model is a one-time download of several hundred MB.",
          ),
          h(
            "label",
            { className: "text" },
            "Your medical glossary (one per line: romanian = english) ",
            h("textarea", {
              rows: 4,
              spellcheck: false,
              placeholder: "nepalpabil = non-palpable\nsuflu sistolic = systolic murmur",
              value: s.userGlossary,
              oninput: (e: Event) => (s.userGlossary = (e.target as HTMLTextAreaElement).value),
            }),
          ),
          h(
            "p",
            { className: "muted small" },
            "Terms are replaced with the English before translation, and your entries take priority over the built-in list of about 100 clinical terms and abbreviations.",
          ),
        ),
        h(
          "fieldset",
          {},
          h("legend", {}, "PubMed"),
          h(
            "label",
            { className: "text" },
            "NCBI API key (optional) ",
            h("input", {
              type: "password",
              autocomplete: "off",
              value: s.apiKey,
              oninput: (e: Event) => (s.apiKey = (e.target as HTMLInputElement).value.trim()),
            }),
          ),
          h("p", { className: "muted small" }, "A free key from your NCBI account raises the rate limit from 3 to 10 requests per second."),
        ),
        h("div", { className: "actions" }, downloadBtn, h("button", { className: "primary", value: "save" }, "Save")),
        status,
      ),
    );
  }

  const show = dialog.showModal.bind(dialog);
  dialog.showModal = () => {
    render();
    show();
  };
  return dialog;
}
