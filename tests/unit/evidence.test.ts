import { describe, expect, it } from "vitest";
import { evidenceLevel, evidenceMix, orderArticles } from "../../src/search/evidence";
import type { Article } from "../../src/pubmed";

const art = (pmid: string, pubTypes: string[], year = "2020") => ({ pmid, pubTypes, year }) as Article;

describe("evidenceLevel", () => {
  it("picks the strongest publication type", () => {
    expect(evidenceLevel(["Journal Article", "Randomized Controlled Trial"]).key).toBe("rct");
    expect(evidenceLevel(["Review", "Systematic Review", "Meta-Analysis"]).key).toBe("synthesis");
    expect(evidenceLevel(["Practice Guideline"]).key).toBe("guideline");
    expect(evidenceLevel(["Case Reports"]).key).toBe("case");
    expect(evidenceLevel(["Journal Article"]).key).toBe("other");
  });
});

describe("orderArticles", () => {
  const list = [art("1", ["Case Reports"], "2024"), art("2", ["Meta-Analysis"], "2018"), art("3", ["Randomized Controlled Trial"], "2021")];

  it("sorts by evidence, citations or date and keeps PubMed order for ties", () => {
    expect(orderArticles(list, "evidence").map((a) => a.pmid)).toEqual(["2", "3", "1"]);
    expect(orderArticles(list, "newest").map((a) => a.pmid)).toEqual(["1", "3", "2"]);
    const cites = new Map([["3", { citations: 90 }], ["1", { citations: 5 }]]);
    expect(orderArticles(list, "citations", cites).map((a) => a.pmid)).toEqual(["3", "1", "2"]);
    expect(orderArticles(list, "pubmed").map((a) => a.pmid)).toEqual(["1", "2", "3"]);
  });

  it("summarises the evidence mix", () => {
    expect(evidenceMix(list).map((m) => [m.level.key, m.count])).toEqual([
      ["synthesis", 1],
      ["rct", 1],
      ["case", 1],
    ]);
  });
});
