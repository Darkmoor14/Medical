import { describe, expect, it } from "vitest";
import { extractPii } from "openmed";

// The worker relies on extractPii decoding raw BIO token output into spans
// with plain labels and character offsets. Lock that contract in.
describe("openmed extractPii contract", () => {
  it("decodes BIO tokens into labelled character spans", async () => {
    const text = "Has type 2 diabetes.";
    const tokens = [
      { entity: "O", score: 0.99, index: 1, word: "has", start: 0, end: 3 },
      { entity: "B-DISEASE", score: 0.97, index: 2, word: "type", start: 4, end: 8 },
      { entity: "I-DISEASE", score: 0.96, index: 3, word: "2", start: 9, end: 10 },
      { entity: "I-DISEASE", score: 0.95, index: 4, word: "diabetes", start: 11, end: 19 },
      { entity: "O", score: 0.99, index: 5, word: ".", start: 19, end: 20 },
    ];
    const spans = await extractPii(text, { pipeline: async () => tokens as never, threshold: 0.5 });
    expect(spans).toHaveLength(1);
    expect(spans[0].entity_type).toBe("DISEASE");
    expect(text.slice(spans[0].start, spans[0].end)).toBe("type 2 diabetes");
    expect(spans[0].score).toBeGreaterThan(0.9);
  });
});
