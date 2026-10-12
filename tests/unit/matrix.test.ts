// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import mammoth from "mammoth";
import { Packer } from "docx";
import {
  applySuggestions,
  decisionCounts,
  emptyMatrix,
  loadMatrix,
  matrixCsv,
  matrixDocx,
  matrixRows,
  matrixTsv,
  newColumnId,
  saveMatrix,
  suggestDesign,
  suggestSampleSize,
} from "../../src/write/matrix";
import type { Article } from "../../src/pubmed";

const art = (pmid: string, title: string, year: string, abstract = "", pubTypes = ["Journal Article"], last = "Smith"): Article => ({
  pmid,
  title,
  abstract,
  authors: [`${last} J`],
  journal: "J Test",
  year,
  pubTypes,
  doi: null,
  pmcid: null,
  journalTitle: "J Test",
  volume: "",
  issue: "",
  pages: "",
  month: "",
  authorsFull: [{ last, fore: "John", initials: "J", collective: "" }],
  meshTerms: [],
  retracted: false,
  concern: false,
});

describe("suggestions", () => {
  it("guesses the study design from publication types and the abstract", () => {
    expect(suggestDesign(art("1", "T", "2020", "", ["Randomized Controlled Trial"]))).toBe("Randomized controlled trial");
    expect(suggestDesign(art("1", "A meta-analysis of statins", "2020"))).toBe("Meta-analysis");
    expect(suggestDesign(art("1", "T", "2020", "This retrospective cohort study included adults."))).toBe("Retrospective cohort study");
    expect(suggestDesign(art("1", "T", "2020", "A case-control study of 200 pairs."))).toBe("Case-control study");
    expect(suggestDesign(art("1", "T", "2020", "In this cross-sectional survey…"))).toBe("Cross-sectional study");
    expect(suggestDesign(art("1", "T", "2020", "", ["Case Reports"]))).toBe("Case report");
    expect(suggestDesign(art("1", "T", "2020", "We discuss things."))).toBe("");
  });

  it("finds the sample size in the abstract", () => {
    expect(suggestSampleSize(art("1", "T", "2020", "Methods: n = 1,204 adults were enrolled."))).toBe("n = 1,204");
    expect(suggestSampleSize(art("1", "T", "2020", "We enrolled 312 consecutive patients with sepsis."))).toBe("312 patients");
    expect(suggestSampleSize(art("1", "T", "2020", "We pooled 24 randomized trials."))).toBe("24 trials");
    expect(suggestSampleSize(art("1", "T", "2020", "In 2019 patients improved."))).toBe("");
    expect(suggestSampleSize(art("1", "T", "2020", "", ["Case Reports"]))).toBe("1 patient");
  });

  it("fills only empty design and size cells", () => {
    const m = emptyMatrix();
    const a = art("1", "T", "2020", "A randomized trial of 80 patients.", ["Randomized Controlled Trial"]);
    m.cells["1"] = { design: "My own text" };
    expect(applySuggestions(m, [a])).toBe(1);
    expect(m.cells["1"]).toEqual({ design: "My own text", size: "80 patients" });
    expect(applySuggestions(m, [a])).toBe(0);
  });
});

describe("rows, counts and columns", () => {
  const papers = [art("1", "A", "2019", "", ["Case Reports"], "Zed"), art("2", "B", "2023", "", ["Meta-Analysis"], "Adams"), art("3", "C", "2021", "", ["Journal Article"], "Moore")];
  const m = emptyMatrix();
  m.decisions = { "1": "exclude", "2": "include" };

  it("sorts and filters", () => {
    const ids = (r: Article[]) => r.map((a) => a.pmid);
    expect(ids(matrixRows(papers, m, "added", "all"))).toEqual(["1", "2", "3"]);
    expect(ids(matrixRows(papers, m, "year-desc", "all"))).toEqual(["2", "3", "1"]);
    expect(ids(matrixRows(papers, m, "author", "all"))).toEqual(["2", "3", "1"]);
    expect(ids(matrixRows(papers, m, "evidence", "all"))).toEqual(["2", "1", "3"]);
    expect(ids(matrixRows(papers, m, "decision", "all"))).toEqual(["2", "3", "1"]);
    expect(ids(matrixRows(papers, m, "added", "include"))).toEqual(["2"]);
    expect(ids(matrixRows(papers, m, "added", "none"))).toEqual(["3"]);
    expect(decisionCounts(papers, m)).toEqual({ "": 1, include: 1, exclude: 1, unsure: 0 });
  });

  it("makes unique column ids", () => {
    const x = emptyMatrix();
    expect(newColumnId(x, "Funding source")).toBe("funding-source");
    x.columns.push({ id: "funding-source", label: "Funding source" });
    expect(newColumnId(x, "Funding source")).toBe("funding-source-2");
    expect(newColumnId(x, "???")).toBe("column");
  });
});

describe("saving and exporting", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips through localStorage", () => {
    const m = emptyMatrix();
    m.cells["1"] = { finding: "Works" };
    expect(saveMatrix(m)).toBe(true);
    expect(loadMatrix().cells["1"].finding).toBe("Works");
    localStorage.setItem("opm-matrix-v1", "{broken");
    expect(loadMatrix().columns.length).toBe(7);
  });

  const papers = [art("1", "A study, with a comma.", "2019", "", ["Case Reports"], "Zed")];
  const m = emptyMatrix();
  m.cells["1"] = { finding: 'Said "yes"\nand more', design: "Case report" };
  m.decisions["1"] = "include";

  it("writes CSV that Excel can open", () => {
    const csv = matrixCsv(papers, m);
    expect(csv.startsWith("﻿Study,Title,Journal,Year,PMID,DOI,Evidence level,Decision,Study design")).toBe(true);
    expect(csv).toContain('"A study, with a comma"');
    expect(csv).toContain('"Said ""yes""\nand more"');
    expect(csv).toContain("Case report,Include");
  });

  it("writes tab-separated text with no line breaks inside cells", () => {
    const tsv = matrixTsv(papers, m);
    expect(tsv.split("\n")).toHaveLength(2);
    expect(tsv).toContain("Said \"yes\" and more");
  });

  it("builds a landscape Word table", async () => {
    const buf = await Packer.toBuffer(await matrixDocx(papers, m));
    const { value } = await mammoth.extractRawText({ buffer: buf });
    expect(value).toContain("Literature matrix");
    expect(value).toContain("Zed, 2019");
    expect(value).toContain("Include");
    expect(value).toContain("Said");
    const JSZip = (await import("jszip")).default;
    const xml = await (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string");
    const w = Number(/<w:pgSz[^>]*w:w="(\d+)"/.exec(xml)?.[1]);
    const hgt = Number(/<w:pgSz[^>]*w:h="(\d+)"/.exec(xml)?.[1]);
    expect(w).toBeGreaterThan(hgt);
  });
});
