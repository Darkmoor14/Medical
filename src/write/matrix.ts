// Literature matrix: one row per paper in the reading list, one column per
// thing you extract from it (design, sample size, findings…), plus an
// include/exclude decision. Stored in this browser only.

import { articleKey, type Article } from "../pubmed";
import { authorPart } from "./cite";
import { evidenceLevel } from "../search/evidence";
import { listKey } from "../search/store";

export type Decision = "" | "include" | "exclude" | "unsure";

export interface MatrixColumn {
  id: string;
  label: string;
}

export interface MatrixData {
  columns: MatrixColumn[];
  cells: Record<string, Record<string, string>>;
  decisions: Record<string, Decision>;
}

export const DECISION_LABEL: Record<Decision, string> = { "": "Undecided", include: "Include", exclude: "Exclude", unsure: "Unsure" };

// Column ids with an automatic suggestion.
export const DESIGN_COLUMN = "design";
export const SIZE_COLUMN = "size";

export function defaultColumns(): MatrixColumn[] {
  return [
    { id: DESIGN_COLUMN, label: "Study design" },
    { id: "population", label: "Population / setting" },
    { id: SIZE_COLUMN, label: "Sample size" },
    { id: "exposure", label: "Intervention / exposure" },
    { id: "outcome", label: "Main outcome" },
    { id: "finding", label: "Key finding" },
    { id: "limits", label: "Limitations / risk of bias" },
  ];
}

export function emptyMatrix(): MatrixData {
  return { columns: defaultColumns(), cells: {}, decisions: {} };
}

const KEY = "opm-matrix-v1";

// One matrix per reading list (the active list unless another is named).
export function loadMatrix(listId?: string): MatrixData {
  try {
    const raw = localStorage.getItem(listKey(KEY, listId));
    const m = raw ? JSON.parse(raw) : null;
    if (m && Array.isArray(m.columns)) return { columns: m.columns, cells: m.cells ?? {}, decisions: m.decisions ?? {} };
  } catch {
    // Fall back to an empty matrix.
  }
  return emptyMatrix();
}

export function saveMatrix(m: MatrixData, listId?: string): boolean {
  try {
    localStorage.setItem(listKey(KEY, listId), JSON.stringify(m));
    return true;
  } catch {
    return false;
  }
}

export function newColumnId(m: MatrixData, label: string): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "column";
  let id = base;
  for (let i = 2; m.columns.some((c) => c.id === id); i++) id = `${base}-${i}`;
  return id;
}

// --- Suggestions ------------------------------------------------------------

export function suggestDesign(a: Article): string {
  const types = a.pubTypes.map((t) => t.toLowerCase());
  const has = (t: string) => types.includes(t);
  const text = `${a.title}\n${a.abstract}`.toLowerCase();
  if (has("meta-analysis") || /meta-?analy/.test(a.title.toLowerCase())) return "Meta-analysis";
  if (has("systematic review") || /systematic review/.test(a.title.toLowerCase())) return "Systematic review";
  if (has("randomized controlled trial") || /randomi[sz]ed (controlled|clinical) trial|double-blind|randomly assigned/.test(text)) {
    return "Randomized controlled trial";
  }
  if (/case[- ]control/.test(text)) return "Case-control study";
  if (/cross[- ]sectional/.test(text)) return "Cross-sectional study";
  const cohort = /\b(prospective|retrospective)\b[^.]{0,40}\bcohort\b|\b(prospective|retrospective)\s+(observational\s+)?(study|analysis)\b/.exec(text);
  if (cohort) return `${(cohort[1] ?? cohort[2]).replace(/^./, (c) => c.toUpperCase())} ${/cohort/.test(cohort[0]) ? "cohort study" : "study"}`;
  if (/\bcohort\b/.test(text)) return "Cohort study";
  if (has("case reports") || /\bwe (report|describe|present) a (case|patient)\b/.test(text)) return "Case report";
  if (/case series/.test(text)) return "Case series";
  if (has("practice guideline") || has("guideline")) return "Guideline";
  if (has("clinical trial") || has("controlled clinical trial") || /clinical trial/.test(text)) return "Clinical trial";
  if (has("observational study")) return "Observational study";
  if (has("review")) return "Narrative review";
  return "";
}

const PEOPLE = "patients|participants|subjects|adults|children|women|men|individuals|cases|people|infants|neonates|veterans|volunteers|mothers|adolescents";

export function suggestSampleSize(a: Article): string {
  const text = `${a.title}\n${a.abstract}`;
  const n = /\b[nN]\s*=\s*(\d[\d,]*)/.exec(text);
  if (n) return `n = ${n[1]}`;
  const people = new RegExp(
    `\\b(\\d[\\d,]{1,9})\\s+(?:(?:consecutive|eligible|adult|pediatric|paediatric|hospitali[sz]ed|randomi[sz]ed|enrolled|critically ill|older)\\s+){0,2}(${PEOPLE})\\b`,
    "i",
  ).exec(text);
  if (people && !/^(19|20)\d\d$/.test(people[1])) return `${people[1]} ${people[2].toLowerCase()}`;
  const studies = /\b(\d{1,4})\s+(?:randomi[sz]ed\s+)?(studies|trials|articles|reports|cohorts)\b/i.exec(text);
  if (studies) return `${studies[1]} ${studies[2].toLowerCase()}`;
  if (a.pubTypes.some((t) => /^case reports$/i.test(t))) return "1 patient";
  return "";
}

// Copy suggestions into empty design and sample-size cells. Returns how many were filled.
export function applySuggestions(m: MatrixData, papers: Article[]): number {
  let filled = 0;
  for (const a of papers) {
    const key = articleKey(a);
    const cells = (m.cells[key] ??= {});
    for (const [col, suggest] of [[DESIGN_COLUMN, suggestDesign], [SIZE_COLUMN, suggestSampleSize]] as const) {
      if (!m.columns.some((c) => c.id === col) || cells[col]?.trim()) continue;
      const value = suggest(a);
      if (value) {
        cells[col] = value;
        filled++;
      }
    }
  }
  return filled;
}

// --- Rows -------------------------------------------------------------------

export type SortBy = "added" | "year-desc" | "year-asc" | "author" | "decision" | "evidence";
export type DecisionFilter = "all" | Decision | "none";

export function studyLabel(a: Article): string {
  return `${authorPart(a)}, ${a.year || "n.d."}`;
}

export function matrixRows(papers: Article[], m: MatrixData, sort: SortBy, filter: DecisionFilter): Article[] {
  const decisionOf = (a: Article): Decision => m.decisions[articleKey(a)] ?? "";
  const kept = papers.filter((a) => filter === "all" || (filter === "none" ? decisionOf(a) === "" : decisionOf(a) === filter));
  const order: Record<Decision, number> = { include: 0, unsure: 1, "": 2, exclude: 3 };
  const idx = new Map(papers.map((a, i) => [articleKey(a), i]));
  const by: Record<SortBy, (a: Article, b: Article) => number> = {
    added: () => 0,
    "year-desc": (a, b) => Number(b.year || 0) - Number(a.year || 0),
    "year-asc": (a, b) => Number(a.year || 9999) - Number(b.year || 9999),
    author: (a, b) => authorPart(a).localeCompare(authorPart(b)),
    decision: (a, b) => order[decisionOf(a)] - order[decisionOf(b)],
    evidence: (a, b) => evidenceLevel(a.pubTypes).rank - evidenceLevel(b.pubTypes).rank,
  };
  return [...kept].sort((a, b) => by[sort](a, b) || idx.get(articleKey(a))! - idx.get(articleKey(b))!);
}

export function decisionCounts(papers: Article[], m: MatrixData): Record<Decision, number> {
  const out: Record<Decision, number> = { "": 0, include: 0, exclude: 0, unsure: 0 };
  for (const a of papers) out[m.decisions[articleKey(a)] ?? ""]++;
  return out;
}

// --- Export -----------------------------------------------------------------

export function matrixTable(papers: Article[], m: MatrixData): { header: string[]; rows: string[][] } {
  const header = ["Study", "Title", "Journal", "Year", "PMID", "DOI", "Evidence level", "Decision", ...m.columns.map((c) => c.label)];
  const rows = papers.map((a) => {
    const key = articleKey(a);
    return [
      studyLabel(a),
      a.title.replace(/\.$/, ""),
      a.journal,
      a.year,
      a.pmid,
      a.doi ?? "",
      evidenceLevel(a.pubTypes).label,
      DECISION_LABEL[m.decisions[key] ?? ""],
      ...m.columns.map((c) => m.cells[key]?.[c.id] ?? ""),
    ];
  });
  return { header, rows };
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function matrixCsv(papers: Article[], m: MatrixData): string {
  const { header, rows } = matrixTable(papers, m);
  // A leading byte-order mark lets Excel read accented characters correctly.
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

// Tab-separated, for pasting straight into Excel or Sheets.
export function matrixTsv(papers: Article[], m: MatrixData): string {
  const { header, rows } = matrixTable(papers, m);
  const clean = (v: string) => v.replace(/[\t\r\n]+/g, " ");
  return [header, ...rows].map((r) => r.map(clean).join("\t")).join("\n");
}

// The matrix as a landscape table in a Word document.
export async function matrixDocx(papers: Article[], m: MatrixData) {
  const docx = await import("docx");
  const { Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, PageOrientation, HeadingLevel } = docx;
  const key = (a: Article) => articleKey(a);
  const header = ["Study", "Evidence", "Decision", ...m.columns.map((c) => c.label)];
  const cell = (text: string, bold = false, fill?: string) =>
    new TableCell({
      children: text
        .split("\n")
        .map((line) => new Paragraph({ children: [new TextRun({ text: line, bold, size: 17 })] })),
      shading: fill ? { type: ShadingType.CLEAR, fill, color: "auto" } : undefined,
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
    });
  const rows = [
    new TableRow({ tableHeader: true, children: header.map((h) => cell(h, true, "E6EEF0")) }),
    ...papers.map(
      (a) =>
        new TableRow({
          cantSplit: true,
          children: [
            cell(`${studyLabel(a)}\n${a.title.replace(/\.$/, "")}`),
            cell(evidenceLevel(a.pubTypes).label),
            cell(DECISION_LABEL[m.decisions[key(a)] ?? ""]),
            ...m.columns.map((c) => cell(m.cells[key(a)]?.[c.id] ?? "")),
          ],
        }),
    ),
  ];
  return new Document({
    creator: "OpenMed PubMed Explorer",
    title: "Literature matrix",
    styles: { default: { document: { run: { font: "Calibri", size: 18 } } } },
    sections: [
      {
        // A4 portrait values; the library swaps them for landscape.
        properties: { page: { size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
        children: [
          new Paragraph({ text: "Literature matrix", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ children: [new TextRun({ text: `${papers.length} papers`, size: 18 })], spacing: { after: 160 } }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }),
        ],
      },
    ],
  });
}
