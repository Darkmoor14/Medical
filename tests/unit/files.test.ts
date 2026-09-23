// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { htmlToText } from "../../src/files";
import { extractSections, splitDiagnoses } from "../../src/draft/extract";

describe("htmlToText", () => {
  it("keeps table rows and separates paragraphs inside a cell", () => {
    const html =
      "<p>Recomandari de tratament:</p>" +
      "<table><tr><td><p>MEDICAMENT</p></td><td><p>DIMINEATA</p></td></tr>" +
      "<tr><td><p>Sorbifer</p></td><td><p>1</p></td></tr></table>" +
      "<table><tr><td><p>Medic curant</p><p>Dr. Rus Ioana</p></td></tr></table>";
    expect(htmlToText(html)).toBe(
      "Recomandari de tratament:\n\nMEDICAMENT | DIMINEATA\nSorbifer | 1\n\nMedic curant / Dr. Rus Ioana\n",
    );
  });
});

describe("consult sections", () => {
  it("keeps a consult's own Dg/Recomandări lines inside the consult", () => {
    const text = [
      "DIAGNOSTICE:",
      "ANEMIE. HTA.",
      "Tratament pe parcursul internarii in Clinica Medicina Interna si Gastroenterologie:",
      "Fier i.v.",
      "CONSULTURI:",
      "Consult chirurgie (03.02.2026 - Dr Pop Ana):",
      "Dg: Hernie ombilicală.",
      "Recomandari: reevaluare la nevoie.",
      "RECOMANDARI:",
      "Regim alimentar.",
    ].join("\n");
    const s = extractSections(text);
    expect(splitDiagnoses(s.diagnoses!)).toEqual(["ANEMIE", "HTA"]);
    expect(s.hospitalTreatment).toBe("Fier i.v.");
    expect(s.consults).toContain("Dg: Hernie ombilicală.");
    expect(s.consults).toContain("Recomandari: reevaluare la nevoie.");
    expect(s.recommendations).toBe("Regim alimentar.");
  });
});
