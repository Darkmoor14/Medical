// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { isSaved, readingList, recordSearch, searchHistory, setNote, toggleSaved } from "../../src/search/store";
import { EMPTY_FILTERS } from "../../src/search/query";
import type { Article } from "../../src/pubmed";

beforeEach(() => localStorage.clear());

describe("reading list", () => {
  it("stars, annotates and unstars papers", () => {
    const art = { pmid: "1", title: "T" } as Article;
    expect(toggleSaved(art)).toBe(true);
    expect(isSaved("1")).toBe(true);
    setNote("1", "useful");
    expect(readingList()[0].note).toBe("useful");
    expect(toggleSaved(art)).toBe(false);
    expect(readingList()).toEqual([]);
  });
});

describe("search history", () => {
  it("returns the previous run of the same search and keeps one entry per search", () => {
    const st = { query: "asthma", count: 50, sort: "relevance" as const, filters: EMPTY_FILTERS };
    expect(recordSearch(st, 10, ["1", "2"])).toBeNull();
    const prev = recordSearch({ ...st, count: 100 }, 12, ["3", "1", "2"]);
    expect(prev?.pmids).toEqual(["1", "2"]);
    recordSearch({ ...st, query: "copd" }, 5, ["9"]);
    expect(searchHistory().map((h) => h.state.query)).toEqual(["copd", "asthma"]);
  });
});
