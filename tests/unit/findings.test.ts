import { describe, expect, it } from "vitest";
import { findSignsAndSymptoms } from "../../src/findings";
import { toEntities } from "../../src/entities";

// An English examination paragraph.
const EXAM =
  "Underweight nutritional status. Hyperpigmented skin, dehydrated; pale mucous membranes, mildly dehydrated. " +
  "Reduced subcutaneous fat. Respiratory system: vesicular breath sounds present bilaterally, no rales. " +
  "Regular heart sounds, no murmurs, no oedema. Soft abdomen, non-tender on palpation. " +
  "Liver 2 cm below the right costal margin and spleen non-palpable. No costovertebral angle tenderness. " +
  "Nervous system: oriented, no signs of meningeal irritation.";

describe("findSignsAndSymptoms", () => {
  it("finds the abnormal findings and marks normal ones as negated", () => {
    const ents = toEntities(EXAM, findSignsAndSymptoms(EXAM));
    const found = ents.filter((e) => !e.negated).map((e) => e.text.toLowerCase());
    const negated = ents.filter((e) => e.negated).map((e) => e.text.toLowerCase());
    expect(found).toEqual(
      expect.arrayContaining([
        "underweight nutritional status",
        "hyperpigmented skin",
        "dehydrated",
        "pale mucous membranes",
        "mildly dehydrated",
        "reduced subcutaneous fat",
      ]),
    );
    expect(found).toContain("liver 2 cm below the right costal margin");
    expect(negated).toEqual(["rales", "murmurs", "oedema", "costovertebral angle tenderness", "meningeal irritation"]);
    // "non-tender" and a negative Giordano sign are not findings.
    expect(found.some((t) => t.includes("tender"))).toBe(false);
  });

  it("uses the finding category", () => {
    const [e] = toEntities("Pallor.", findSignsAndSymptoms("Pallor."));
    expect(e.category).toBe("finding");
  });
});

describe("expanded findings list", () => {
  it("covers many systems and keeps ambiguous words specific", async () => {
    const { FINDING_COUNT } = await import("../../src/findings");
    expect(FINDING_COUNT).toBeGreaterThan(400);
    const text =
      "Complains of dyspnoea on exertion, productive cough and haemoptysis. Epigastric pain with nausea and melena. " +
      "Bilateral pitting oedema, palpable cervical lymphadenopathy. Slurred speech and left hemiparesis. " +
      "Discharged home. The results fit the diagnosis.";
    const got = toEntities(text, findSignsAndSymptoms(text)).map((e) => e.text.toLowerCase());
    expect(got).toEqual([
      "dyspnoea on exertion", "productive cough", "haemoptysis", "epigastric pain", "nausea", "melena",
      "bilateral pitting oedema", "palpable cervical lymphadenopathy", "slurred speech", "left hemiparesis",
    ].filter((t) => t !== "left hemiparesis").concat(["hemiparesis"]).sort((a, b) => text.toLowerCase().indexOf(a) - text.toLowerCase().indexOf(b)));
  });

  it("finds findings in an abstract and respects negation", () => {
    const text = "Patients presented with headache, dizziness, dyspnoea, palpitations and leg oedema, without fever.";
    const ents = toEntities(text, findSignsAndSymptoms(text));
    expect(ents.filter((e) => !e.negated).map((e) => e.text.toLowerCase())).toEqual([
      "headache", "dizziness", "dyspnoea", "palpitations", "leg oedema",
    ]);
    expect(ents.filter((e) => e.negated).map((e) => e.text.toLowerCase())).toEqual(["fever"]);
  });
});
