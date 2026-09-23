import type { Span, TermGroup } from "../entities";
import { extractPatient, extractSections, splitDiagnoses } from "./extract";
import { emptyDraft, sexFromCnp, type DraftData } from "./model";

// Build the initial form from the analysed note. The note's own sections are
// preferred; detected condition terms are the fallback for diagnoses.
export function prefillDraft(text: string, pii: Span[], groups: TermGroup[]): DraftData {
  const d = emptyDraft();
  const sections = extractSections(text);
  const patient = extractPatient(text, pii);
  d.patientName = patient.name;
  d.cnp = patient.cnp;
  d.sex = sexFromCnp(patient.cnp);
  d.age = patient.age;
  d.address = patient.address;
  d.admitted = patient.admitted;
  d.discharged = patient.discharged;
  d.fo = patient.fo;
  d.doctor = patient.doctor;
  d.unit = patient.unit;
  const fromNote = sections.diagnoses ? splitDiagnoses(sections.diagnoses) : [];
  const fromTerms = groups.filter((g) => g.category === "condition").map((g) => g.display);
  d.diagnoses = (fromNote.length ? fromNote : fromTerms).map((text) => ({ text, icd: "" }));
  d.history = sections.history ?? "";
  d.exam = sections.exam ?? "";
  d.investigations = [sections.investigations, sections.consults].filter(Boolean).join("\n\n");
  d.hospitalTreatment = sections.hospitalTreatment ?? "";
  d.homeTreatment = sections.homeTreatment ?? "";
  d.recommendations = sections.recommendations ?? "";
  return d;
}
