import { describe, expect, it } from "vitest";
import {
  chunkText,
  groupTerms,
  normalizeTerm,
  removePiiOverlaps,
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

describe("removePiiOverlaps", () => {
  it("drops entities that touch identifier spans", () => {
    const ents = [
      { start: 0, end: 5 },
      { start: 10, end: 20 },
    ];
    expect(removePiiOverlaps(ents, [{ start: 3, end: 8 }])).toEqual([{ start: 10, end: 20 }]);
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
