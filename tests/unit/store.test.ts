// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { activeList, copyToList, createList, deleteList, isSaved, listKey, readingList, readingLists, recordSearch, renameList, searchHistory, setActiveList, setNote, toggleSaved } from "../../src/search/store";
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

describe("several reading lists", () => {
  const art = (pmid: string) => ({ pmid, title: `T${pmid}` }) as Article;
  it("migrates the single list of older versions into a default list", () => {
    localStorage.setItem("opm-reading-list-v1", JSON.stringify([{ article: art("5"), note: "old", addedAt: "2025-01-01" }]));
    expect(readingLists()).toEqual([{ id: "default", name: "My reading list", count: 1 }]);
    expect(readingList()[0].note).toBe("old");
  });
  it("keeps papers and notes separate per list", () => {
    toggleSaved(art("1"));
    const second = createList("Heart failure");
    expect(activeList()).toEqual({ id: second, name: "Heart failure" });
    expect(readingList()).toEqual([]);
    expect(isSaved("1")).toBe(false);
    toggleSaved(art("2"));
    setNote("2", "hf");
    setActiveList("default");
    expect(readingList().map((p) => p.article.pmid)).toEqual(["1"]);
    expect(readingLists().map((l) => l.count)).toEqual([1, 1]);
  });
  it("de-duplicates names, renames, and ignores blank names", () => {
    createList("Asthma");
    createList("asthma");
    expect(readingLists().map((l) => l.name)).toEqual(["My reading list", "Asthma", "asthma (2)"]);
    renameList(activeList().id, "COPD");
    renameList(activeList().id, "   ");
    expect(activeList().name).toBe("COPD");
  });
  it("copies and moves papers between lists", () => {
    toggleSaved(art("7"));
    const other = createList("Other");
    setActiveList("default");
    expect(copyToList("7", other)).toBe(true);
    expect(copyToList("7", other)).toBe(false); // already there
    expect(readingList().length).toBe(1);
    expect(copyToList("7", other, true)).toBe(false);
    expect(readingList()).toEqual([]); // moved out even though the other list had it
    setActiveList(other);
    expect(readingList().length).toBe(1);
    expect(copyToList("7", "default")).toBe(true);
  });
  it("deletes a list with its matrix data, but never the last one", () => {
    expect(deleteList("default")).toBe(false);
    const id = createList("Temp");
    localStorage.setItem(listKey("opm-matrix-v1", id), "{}");
    expect(deleteList(id)).toBe(true);
    expect(localStorage.getItem(`opm-matrix-v1:${id}`)).toBeNull();
    expect(activeList().id).toBe("default");
    expect(listKey("opm-matrix-v1", "default")).toBe("opm-matrix-v1");
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
