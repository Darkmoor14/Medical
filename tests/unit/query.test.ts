import { describe, expect, it } from "vitest";
import { buildQuery, findPhiInQuery } from "../../src/query";

describe("buildQuery", () => {
  it("ORs within a category and ANDs across categories", () => {
    const q = buildQuery([
      { text: "empagliflozin", category: "drug" },
      { text: "chronic kidney disease", category: "condition" },
      { text: "type 2 diabetes", category: "condition" },
    ]);
    expect(q).toBe(
      '("chronic kidney disease"[tiab] OR "type 2 diabetes"[tiab]) AND "empagliflozin"[tiab]',
    );
  });

  it("adds filters and strips characters that would break the query", () => {
    const q = buildQuery([{ text: 'foo "bar" [x]', category: "condition" }], {
      years: 5,
      reviewsOnly: true,
      humansOnly: true,
    });
    expect(q).toBe(
      '"foo bar x"[tiab] AND (review[pt] OR systematic review[pt] OR meta-analysis[pt]) AND humans[mh] AND "last 5 years"[dp]',
    );
  });

  it("dedupes repeated terms", () => {
    expect(
      buildQuery([
        { text: "asthma", category: "condition" },
        { text: "asthma", category: "condition" },
      ]),
    ).toBe('"asthma"[tiab]');
  });
});

describe("findPhiInQuery", () => {
  it("flags identifiers typed into the query", () => {
    expect(findPhiInQuery('"asthma"[tiab] AND Jordan Avery', ["Jordan Avery", "04/12/1961"])).toEqual([
      "Jordan Avery",
    ]);
  });

  it("matches whole words only and ignores very short values", () => {
    expect(findPhiInQuery('"metformin"[tiab]', ["form", "63"])).toEqual([]);
    expect(findPhiInQuery("MRN 00482913 asthma", ["00482913"])).toEqual(["00482913"]);
  });
});
