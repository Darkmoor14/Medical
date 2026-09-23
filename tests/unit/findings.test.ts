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
