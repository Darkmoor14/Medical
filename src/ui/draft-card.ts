import { h, replace } from "./dom";
import { showError } from "./status";
import type { Span, TermGroup } from "../entities";
import { prefillDraft } from "../draft/prefill";
import { buildDocument, DOC_TYPES, type CheckState, type DocType, type DraftData } from "../draft/model";
import { renderDocx, renderPreview } from "../draft/render";

type TextKey = {
  [K in keyof DraftData]: DraftData[K] extends string ? K : never;
}[keyof DraftData];

// Which form fields each document uses.
const FIELDS: Record<DocType, Set<TextKey | "diagnoses" | "checks">> = {
  discharge: new Set([
    "unit", "ward", "patientName", "sex", "cnp", "age", "address", "admitted", "discharged", "fo",
    "diagnoses", "history", "exam", "investigations", "hospitalTreatment", "recommendations",
    "homeTreatment", "checks", "doctor", "doctorTitle", "date",
  ]),
  summary: new Set([
    "unit", "ward", "patientName", "sex", "cnp", "age", "admitted", "discharged", "fo",
    "diagnoses", "history", "doctor", "doctorTitle", "date",
  ]),
  referral: new Set([
    "unit", "ward", "patientName", "sex", "cnp", "age", "address", "referralTo", "referralUnit",
    "referralReason", "diagnoses", "history", "investigations", "homeTreatment", "doctor", "doctorTitle", "date",
  ]),
};

const LABELS: Partial<Record<TextKey, string>> = {
  unit: "Hospital / unit",
  ward: "Ward / department",
  patientName: "Patient name",
  cnp: "CNP",
  age: "Age (years)",
  address: "Address",
  admitted: "Admitted",
  discharged: "Discharged",
  fo: "FO number",
  history: "Epicriză / history",
  exam: "Examination on admission",
  investigations: "Investigations and consults",
  hospitalTreatment: "Treatment in hospital",
  recommendations: "Recommendations",
  homeTreatment: "Treatment at home",
  referralTo: "Refer to (specialty)",
  referralUnit: "Refer to (clinic / hospital)",
  referralReason: "Reason for referral",
  doctor: "Doctor",
  doctorTitle: "Doctor's title (e.g. Medic specialist medicină internă)",
  date: "Date",
};

const LONG: Set<TextKey> = new Set([
  "history", "exam", "investigations", "hospitalTreatment", "recommendations", "homeTreatment", "referralReason",
]);

export function draftCard(text: string, pii: Span[], groups: TermGroup[], language: "en" | "ro" = "en"): HTMLElement {
  const data = prefillDraft(text, pii, groups);
  const form = h("div", { className: "draft-form" });
  const preview = h("div", { className: "draft-preview" });
  const status = h("p", { className: "status", role: "status" });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refreshPreview = () => {
    clearTimeout(timer);
    timer = setTimeout(() => replace(preview, renderPreview(buildDocument(data))), 150);
  };

  const downloadBtn = h("button", { className: "primary", type: "button" }, "Download .docx");
  downloadBtn.addEventListener("click", async () => {
    downloadBtn.disabled = true;
    try {
      const blob = await renderDocx(buildDocument(data));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.docType === "discharge" ? "scrisoare-medicala" : data.docType === "summary" ? "rezumat-diagnostic" : "scrisoare-trimitere"}-PROIECT.docx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = "Saved. The file was created on this device and includes the patient's details, so store it like any medical record.";
    } catch (err) {
      showError(status, err);
    } finally {
      downloadBtn.disabled = false;
    }
  });

  function textField(key: TextKey) {
    const attrs = {
      value: data[key],
      oninput: (e: Event) => {
        (data[key] as string) = (e.target as HTMLInputElement).value;
        refreshPreview();
      },
    };
    return h(
      "label",
      { className: LONG.has(key) ? "field wide" : "field" },
      LABELS[key] ?? key,
      LONG.has(key) ? h("textarea", { rows: 4, ...attrs }) : h("input", { type: "text", ...attrs }),
    );
  }

  function diagnosesEditor() {
    const list = h("div", { className: "dx-list" });
    const renderRows = () => {
      replace(
        list,
        ...data.diagnoses.map((dx, i) =>
          h(
            "div",
            { className: "dx-row" },
            h("span", { className: "dx-num" }, `${i + 1}.`),
            h("input", {
              type: "text",
              value: dx.text,
              "aria-label": `Diagnosis ${i + 1}`,
              oninput: (e: Event) => {
                dx.text = (e.target as HTMLInputElement).value;
                refreshPreview();
              },
            }),
            h("input", {
              type: "text",
              className: "icd",
              value: dx.icd,
              placeholder: "ICD-10",
              "aria-label": `ICD-10 code for diagnosis ${i + 1}`,
              oninput: (e: Event) => {
                dx.icd = (e.target as HTMLInputElement).value;
                refreshPreview();
              },
            }),
            h(
              "button",
              {
                type: "button",
                "aria-label": `Remove diagnosis ${i + 1}`,
                onclick: () => {
                  data.diagnoses.splice(i, 1);
                  renderRows();
                  refreshPreview();
                },
              },
              "✕",
            ),
          ),
        ),
      );
    };
    renderRows();
    // Detected terms are English for translated notes, so they are only
    // offered as shortcuts when the note itself is in English.
    const conditions = language === "en" ? groups.filter((g) => g.category === "condition" && !g.negated) : [];
    return h(
      "fieldset",
      { className: "field wide" },
      h("legend", {}, "Diagnoses"),
      list,
      h(
        "div",
        { className: "actions" },
        h(
          "button",
          {
            type: "button",
            onclick: () => {
              data.diagnoses.push({ text: "", icd: "" });
              renderRows();
              (list.querySelector(".dx-row:last-child input") as HTMLInputElement | null)?.focus();
            },
          },
          "+ Add diagnosis",
        ),
        ...conditions.map((g) =>
          h(
            "button",
            {
              type: "button",
              className: "chip cat-condition",
              title: "Add this detected term",
              onclick: () => {
                data.diagnoses.push({ text: g.display, icd: "" });
                renderRows();
                refreshPreview();
              },
            },
            `+ ${g.display}`,
          ),
        ),
      ),
    );
  }

  function checksEditor() {
    const groupsDef: { key: keyof DraftData["checks"]; label: string; hasNo: boolean }[] = [
      { key: "prescription", label: "Prescription (prescripție medicală)", hasNo: true },
      { key: "leave", label: "Medical leave (concediu medical)", hasNo: true },
      { key: "homeCare", label: "Home / palliative care", hasNo: false },
      { key: "devices", label: "Medical devices prescription", hasNo: false },
    ];
    const opts: [CheckState, string][] = [
      ["yes", "Issued"],
      ["not-needed", "Not needed"],
      ["no", "Not issued"],
    ];
    return h(
      "fieldset",
      { className: "field wide" },
      h("legend", {}, "Required statements"),
      ...groupsDef.map((g) =>
        h(
          "div",
          { className: "check-row" },
          h("span", {}, g.label),
          ...opts
            .filter(([v]) => g.hasNo || v !== "no")
            .map(([value, label]) =>
              h(
                "label",
                { className: "toggle" },
                h("input", {
                  type: "radio",
                  name: `check-${g.key}`,
                  checked: data.checks[g.key] === value,
                  onchange: () => {
                    data.checks[g.key] = value;
                    refreshPreview();
                  },
                }),
                label,
              ),
            ),
        ),
      ),
    );
  }

  function sexField() {
    return h(
      "label",
      { className: "field" },
      "Sex",
      h(
        "select",
        {
          onchange: (e: Event) => {
            data.sex = (e.target as HTMLSelectElement).value as DraftData["sex"];
            refreshPreview();
          },
        },
        ...[
          ["", "—"],
          ["F", "F"],
          ["M", "M"],
        ].map(([v, l]) => h("option", { value: v, selected: data.sex === v }, l)),
      ),
    );
  }

  function renderForm() {
    const fields = FIELDS[data.docType];
    const order: (TextKey | "diagnoses" | "checks" | "sex")[] = [
      "unit", "ward", "patientName", "sex", "cnp", "age", "address", "admitted", "discharged", "fo",
      "referralTo", "referralUnit", "referralReason", "diagnoses", "history", "exam", "investigations",
      "hospitalTreatment", "recommendations", "homeTreatment", "checks", "doctor", "doctorTitle", "date",
    ];
    replace(
      form,
      ...order
        .filter((k) => fields.has(k as never))
        .map((k) =>
          k === "diagnoses" ? diagnosesEditor() : k === "checks" ? checksEditor() : k === "sex" ? sexField() : textField(k),
        ),
    );
    refreshPreview();
  }

  const typeSelect = h(
    "select",
    {
      "aria-label": "Document type",
      onchange: (e: Event) => {
        data.docType = (e.target as HTMLSelectElement).value as DocType;
        renderForm();
      },
    },
    ...DOC_TYPES.map((t) => h("option", { value: t.value }, t.label)),
  );
  renderForm();

  return h(
    "section",
    { className: "card", "aria-labelledby": "draft-title" },
    h("div", { className: "card-head" }, h("h2", { id: "draft-title" }, "Draft a document"), typeSelect),
    h(
      "p",
      { className: "muted small" },
      "Pre-filled from your note. Nothing new is invented: check every field, fill the gaps, then download. The document is written in Romanian and stays on this device.",
    ),
    h("div", { className: "draft-layout" }, form, h("div", {}, h("h3", { className: "muted small" }, "Preview"), preview)),
    h("div", { className: "actions" }, downloadBtn),
    status,
  );
}
