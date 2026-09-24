import { describe, expect, it } from "vitest";
import { cooccurring, journalCounts, yearCounts } from "../../src/search/trends";
import type { Article } from "../../src/pubmed";
import type { TermStat } from "../../src/entities";

const art = (year: string, journal: string) => ({ year, journal }) as Article;

describe("trends", () => {
  it("counts papers per year with gaps filled", () => {
    expect(yearCounts([art("2020", "A"), art("2022", "A"), art("2022", "B"), art("", "B")])).toEqual([
      { label: "2020", count: 1 },
      { label: "2021", count: 0 },
      { label: "2022", count: 2 },
    ]);
  });

  it("ranks journals", () => {
    expect(journalCounts([art("2020", "B"), art("2020", "A"), art("2021", "A")])).toEqual([
      { label: "A", count: 2 },
      { label: "B", count: 1 },
    ]);
  });

  it("finds terms mentioned in the same papers", () => {
    const stat = (key: string, docs: string[]) => ({ key, term: key, category: "condition", docs: new Set(docs), mentions: docs.length }) as TermStat;
    const target = stat("ckd", ["1", "2", "3"]);
    const res = cooccurring([target, stat("diabetes", ["1", "2"]), stat("asthma", ["9"]), stat("hta", ["3"])], target);
    expect(res.map((r) => [r.stat.key, r.shared])).toEqual([
      ["diabetes", 2],
      ["hta", 1],
    ]);
  });
});
