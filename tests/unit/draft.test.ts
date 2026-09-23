import { describe, expect, it } from "vitest";
import { extractPatient, extractSections, splitDiagnoses } from "../../src/draft/extract";
import { buildDocument, emptyDraft, sexFromCnp } from "../../src/draft/model";
import { findRomanianPii, mergePii } from "../../src/ro-pii";

// Synthetic letter with the same layout as a real discharge letter.
const LETTER = `SPITALUL CLINIC JUDEŢEAN DE URGENŢĂ PLOIEŞTI

BILET DE EXTERNARE/SCRISOARE MEDICALA

Stimate(ă) coleg(ă), vă informăm că pacienta POP ANA in varsta de 51 ani, domiciliata in localitatea Exemplu, judetul Prahova, identificat cu CNP: 2730101290012 a fost internat în serviciul nostru in perioada de 03.02.2026 – 07.02.2026, nr. FO. 1234/2026.

DIAGNOSTICE:

ANEMIE FERIPRIVĂ. HIPERTENSIUNE ARTERIALĂ GRAD II. DIABET ZAHARAT TIP 2.

EPICRIZA:

Pacientă în vârstă de 51 de ani se prezintă pentru astenie.

Evoluție favorabilă sub tratament.

EXAMENUL OBIECTIV LA INTERNARE:

Stare generală bună.

Tratament pe parcursul internarii in Clinica Medicala:

Fier i.v., hidratare.

ANALIZE DE LABORATOR:

Hb 8,1 g/dl.

RECOMANDARI:

Regim alimentar echilibrat.

Recomandari de tratament:

Sorbifer 1 cp/zi.

Medic curant

Dr. Rus Ioana`;

describe("extractSections", () => {
  it("finds the standard discharge-letter sections", () => {
    const s = extractSections(LETTER);
    expect(splitDiagnoses(s.diagnoses!)).toEqual([
      "ANEMIE FERIPRIVĂ",
      "HIPERTENSIUNE ARTERIALĂ GRAD II",
      "DIABET ZAHARAT TIP 2",
    ]);
    expect(s.history).toBe("Pacientă în vârstă de 51 de ani se prezintă pentru astenie.\n\nEvoluție favorabilă sub tratament.");
    expect(s.exam).toBe("Stare generală bună.");
    expect(s.hospitalTreatment).toBe("Fier i.v., hidratare.");
    expect(s.investigations).toBe("Hb 8,1 g/dl.");
    expect(s.recommendations).toBe("Regim alimentar echilibrat.");
    expect(s.homeTreatment).toBe("Sorbifer 1 cp/zi.");
  });

  it("reads inline headings", () => {
    const s = extractSections("Diagnostic: Pneumonie comunitară. Fibrilație atrială.\nRecomandări: control peste 2 săptămâni.");
    expect(splitDiagnoses(s.diagnoses!)).toEqual(["Pneumonie comunitară", "Fibrilație atrială"]);
    expect(s.recommendations).toBe("control peste 2 săptămâni.");
  });
});

describe("extractPatient", () => {
  it("fills patient details from the note and detected identifiers", () => {
    const p = extractPatient(LETTER, mergePii(findRomanianPii(LETTER)));
    expect(p).toMatchObject({
      name: "POP ANA",
      cnp: "2730101290012",
      age: "51",
      admitted: "03.02.2026",
      discharged: "07.02.2026",
      fo: "1234/2026",
      doctor: "Rus Ioana",
      unit: "SPITALUL CLINIC JUDEŢEAN DE URGENŢĂ PLOIEŞTI",
    });
    expect(p.address).toContain("Exemplu");
  });
});

describe("buildDocument", () => {
  it("builds a discharge letter with grammatical gender from the CNP", () => {
    const d = { ...emptyDraft(), patientName: "Pop Ana", cnp: "2730101290012", sex: sexFromCnp("2730101290012") };
    d.diagnoses = [{ text: "Anemie feriprivă", icd: "D50.9" }];
    d.checks.prescription = "not-needed";
    const blocks = buildDocument(d);
    const para = blocks.find((b) => b.kind === "para");
    expect(para && "text" in para && para.text).toContain("pacienta Pop Ana");
    expect(para && "text" in para && para.text).toContain("domiciliată");
    expect(blocks).toContainEqual({ kind: "list", items: ["Anemie feriprivă (D50.9)"] });
    expect(blocks[0].kind).toBe("draftNote");
  });

  it("builds a referral and a diagnosis summary", () => {
    const d = { ...emptyDraft(), docType: "referral" as const, referralTo: "gastroenterologie" };
    expect(buildDocument(d).some((b) => b.kind === "title" && b.text === "SCRISOARE DE TRIMITERE")).toBe(true);
    const s = { ...emptyDraft(), docType: "summary" as const, diagnoses: [{ text: "HTA", icd: "I10" }] };
    expect(buildDocument(s)).toContainEqual({
      kind: "table",
      header: ["Nr.", "Diagnostic", "Cod ICD-10"],
      rows: [["1", "HTA", "I10"]],
    });
  });
});
