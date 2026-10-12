// Reads pasted or uploaded tables (CSV, semicolon- or tab-separated, as copied
// from Excel) into typed columns. Nothing is stored or sent anywhere.

export interface NumericColumn {
  kind: "numeric";
  name: string;
  values: (number | null)[];
}
export interface CategoricalColumn {
  kind: "categorical";
  name: string;
  values: (string | null)[];
}
export type Column = NumericColumn | CategoricalColumn;

export interface Dataset {
  columns: Column[];
  rows: number;
  delimiter: string;
}

function detectDelimiter(firstLines: string): string {
  const candidates = ["\t", ";", ",", "|"];
  const counts = candidates.map((d) => firstLines.split("\n").reduce((s, l) => s + l.split(d).length - 1, 0));
  const best = Math.max(...counts);
  return best === 0 ? "," : candidates[counts.indexOf(best)];
}

// Splits text into rows, honouring "quoted, fields" and doubled quotes.
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

// "3.5", "3,5" (when the file isn't comma-separated), "1 234,5", "12%".
export function parseNumber(raw: string, decimalComma: boolean): number | null {
  let s = raw.trim().replace(/%$/, "").replace(/\s/g, "");
  if (!s) return null;
  if (decimalComma) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s) ? Number(s) : null;
}

const MISSING = /^(na|n\/a|nan|null|none|-|—|\?)$/i;

export function parseDataset(text: string): Dataset {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Paste a table or choose a file first.");
  const delimiter = detectDelimiter(trimmed.split("\n").slice(0, 10).join("\n"));
  const table = parseDelimited(trimmed, delimiter);
  if (table.length < 2) throw new Error("Need a header row and at least one row of data.");
  const header = table[0].map((h, i) => h.trim() || `Column ${i + 1}`);
  const body = table.slice(1);
  const decimalComma = delimiter !== ",";

  const columns: Column[] = header.map((name, j) => {
    const raw = body.map((r) => (r[j] ?? "").trim());
    const cells = raw.map((v) => (v === "" || MISSING.test(v) ? null : v));
    const present = cells.filter((v): v is string => v !== null);
    const nums = present.map((v) => parseNumber(v, decimalComma));
    const numeric = present.length > 0 && nums.filter((v) => v !== null).length / present.length >= 0.9;
    if (numeric) {
      return { kind: "numeric", name, values: cells.map((v) => (v === null ? null : parseNumber(v, decimalComma))) };
    }
    return { kind: "categorical", name, values: cells };
  });
  // Disambiguate duplicate headers.
  const seen = new Map<string, number>();
  for (const c of columns) {
    const n = (seen.get(c.name) ?? 0) + 1;
    seen.set(c.name, n);
    if (n > 1) c.name = `${c.name} (${n})`;
  }
  return { columns, rows: body.length, delimiter };
}

// Rows where both columns have a value.
export function pairs<A, B>(a: (A | null)[], b: (B | null)[]): [A, B][] {
  const out: [A, B][] = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== null && b[i] !== null) out.push([a[i] as A, b[i] as B]);
  return out;
}

export function groupBy(numbers: (number | null)[], groups: (string | null)[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const [v, g] of pairs(numbers, groups)) {
    if (!out.has(g)) out.set(g, []);
    out.get(g)!.push(v);
  }
  return out;
}

export function crossTab(rows: (string | null)[], cols: (string | null)[]): { rowLabels: string[]; colLabels: string[]; counts: number[][] } {
  const ps = pairs(rows, cols);
  const rowLabels = [...new Set(ps.map((p) => p[0]))].sort();
  const colLabels = [...new Set(ps.map((p) => p[1]))].sort();
  const counts = rowLabels.map(() => colLabels.map(() => 0));
  for (const [r, c] of ps) counts[rowLabels.indexOf(r)][colLabels.indexOf(c)]++;
  return { rowLabels, colLabels, counts };
}
