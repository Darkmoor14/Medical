import { describe, expect, it } from "vitest";
import {
  chunkText,
  isNegated,
  groupTerms,
  normalizeTerm,
  tallyByDocument,
  toEntities,
} from "../../src/entities";
import { categoryFor, detectorModelId, DETECTORS } from "../../src/models";

describe("chunkText", () => {
  it("returns one chunk for short text", () => {
    expect(chunkText("short note")).toEqual([{ text: "short note", offset: 0 }]);
  });

  it("splits long text at sentence boundaries and keeps offsets exact", () => {
    const text = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const chunks = chunkText(text, 200);
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) {
      expect(text.slice(c.offset, c.offset + c.text.length)).toBe(c.text);
      expect(c.text.length).toBeLessThanOrEqual(200);
    }
    expect(chunks.map((c) => c.text).join("")).toBe(text);
    expect(chunks[0].text.trimEnd().endsWith(".")).toBe(true);
  });
});

describe("toEntities", () => {
  const text = "Started (metformin), for type 2 diabetes.";

  it("trims punctuation and assigns categories", () => {
    const ents = toEntities(text, [
      { start: 8, end: 20, label: "CHEM", score: 0.9 },
      { start: 25, end: 41, label: "DISEASE", score: 0.95 },
    ]);
    expect(ents.map((e) => [e.text, e.category])).toEqual([
      ["metformin", "drug"],
      ["type 2 diabetes", "condition"],
    ]);
  });

  it("keeps the higher-scoring span when detectors overlap", () => {
    const ents = toEntities(text, [
      { start: 25, end: 40, label: "DISEASE", score: 0.95 },
      { start: 32, end: 40, label: "CHEM", score: 0.4 },
    ]);
    expect(ents).toHaveLength(1);
    expect(ents[0].label).toBe("DISEASE");
  });
});

describe("grouping and tallies", () => {
  it("groups repeated mentions case-insensitively", () => {
    const text = "Asthma. asthma. Salbutamol.";
    const groups = groupTerms(
      toEntities(text, [
        { start: 0, end: 6, label: "DISEASE", score: 1 },
        { start: 8, end: 14, label: "DISEASE", score: 1 },
        { start: 16, end: 26, label: "CHEM", score: 1 },
      ]),
    );
    expect(groups.map((g) => [g.category, normalizeTerm(g.display), g.count])).toEqual([
      ["condition", "asthma", 2],
      ["drug", "salbutamol", 1],
    ]);
  });

  it("counts document frequency, not raw mentions, for ranking", () => {
    const mk = (t: string, label = "DISEASE") => ({
      start: 0,
      end: t.length,
      label,
      score: 1,
      text: t,
      category: categoryFor(label),
      negated: false,
    });
    const stats = tallyByDocument([
      { id: "1", entities: [mk("COPD"), mk("COPD"), mk("COPD")] },
      { id: "2", entities: [mk("Asthma")] },
      { id: "3", entities: [mk("asthma")] },
    ]);
    expect(stats[0].term.toLowerCase()).toBe("asthma");
    expect(stats[0].docs.size).toBe(2);
    expect(stats[1].mentions).toBe(3);
  });
});

describe("models", () => {
  it("builds OpenMed repo ids", () => {
    const disease = DETECTORS.find((d) => d.key === "disease")!;
    expect(detectorModelId(disease, "fast")).toBe(
      "OpenMed/OpenMed-NER-DiseaseDetect-ElectraMed-33M-v1-onnx-android",
    );
    expect(detectorModelId(disease, "accurate")).toBe(
      "OpenMed/OpenMed-NER-DiseaseDetect-PubMed-v2-109M-onnx-android",
    );
  });

  it("maps labels to categories", () => {
    expect(categoryFor("SIMPLE_CHEMICAL")).toBe("drug");
    expect(categoryFor("GENE_OR_GENE_PRODUCT")).toBe("gene");
    expect(categoryFor("ORGANISM")).toBe("organism");
    expect(categoryFor("ORGAN")).toBe("anatomy");
    expect(categoryFor("CANCER")).toBe("condition");
  });
});

describe("word snapping, fragment merging and negation", () => {
  it("grows sub-word pieces to whole words and joins them", () => {
    const text = "Examination: no signs of meningeal irritation.";
    const start = text.indexOf("meningeal");
    const ents = toEntities(text, [
      { start, end: start + 3, label: "DISEASE", score: 0.8 }, // "men"
      { start: start + 8, end: start + 20, label: "DISEASE", score: 0.7 }, // "l irritation"
    ]);
    expect(ents.map((e) => e.text)).toEqual(["meningeal irritation"]);
    expect(ents[0].negated).toBe(true);
  });

  it("does not join different categories or distant words", () => {
    const text = "metformin, asthma";
    const ents = toEntities(text, [
      { start: 0, end: 9, label: "CHEM", score: 1 },
      { start: 11, end: 17, label: "DISEASE", score: 1 },
    ]);
    expect(ents.map((e) => e.text)).toEqual(["metformin", "asthma"]);
  });

  it("detects common negation cues in English and Romanian", () => {
    const neg = (text: string, term: string) => {
      const start = text.indexOf(term);
      return isNegated(text, { start, end: start + term.length });
    };
    expect(neg("Patient denies chest pain.", "chest pain")).toBe(true);
    expect(neg("Negative for C. difficile toxin.", "difficile")).toBe(true);
    expect(neg("Pulmonary embolism was ruled out.", "Pulmonary embolism")).toBe(true);
    expect(neg("Fără semne de iritație meningeană.", "iritație meningeană")).toBe(true);
    expect(neg("Known type 2 diabetes. No fever.", "type 2 diabetes")).toBe(false);
    expect(neg("Pneumonia, improved without complications.", "Pneumonia")).toBe(false);
  });
});
