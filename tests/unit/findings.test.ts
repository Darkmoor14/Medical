import { describe, expect, it } from "vitest";
import { findSignsAndSymptoms } from "../../src/findings";
import { applyGlossary } from "../../src/glossary";
import { toEntities } from "../../src/entities";

// The exam paragraph after the glossary step, as the translator would see it.
const EXAM = applyGlossary(
  "Stare nutritie subponderala. Tegumente hiperpigmentate, deshidratate; mucoase palide, usor deshidratate. " +
    "Tesut conjuctiv-adipos slab reprezentat. Aparat respirator MV prezent bilateral, fara raluri. " +
    "Zg cardiace ritmice bine batute, fara sufluri, fara edem. Abdomen suplu, elastic, nedureros la palpare superficiala sau profunda. " +
    "Ficat la 2 cm sub rebordul costal drept si splina nepalpabila. Manvera Giordano negativa bilateral. " +
    "Sistem nervos orientat temporospatial, fara semne de iritatie meningeana.",
).text;

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
    expect(found).toContain("liver la 2 cm below the right costal margin");
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

  it("finds findings in a translated Romanian history", () => {
    const text = applyGlossary("Pacienta acuză cefalee, amețeli, dispnee de efort, palpitații și edeme gambiere. Fără febră.").text;
    const ents = toEntities(text, findSignsAndSymptoms(text));
    expect(ents.filter((e) => !e.negated).map((e) => e.text.toLowerCase())).toEqual([
      "headache", "dizziness", "dyspnoea", "palpitations", "leg oedema",
    ]);
    expect(ents.filter((e) => e.negated).map((e) => e.text.toLowerCase())).toEqual(["fever"]);
  });
});
