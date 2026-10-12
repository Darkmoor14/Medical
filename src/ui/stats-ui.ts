// Shared bits for the Stats tab: number formatting, labelled inputs, tables.

import { h } from "./dom";
import type { CI } from "../stats/clinical";

export function fmt(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "–";
  const abs = Math.abs(v);
  if (abs !== 0 && abs < 10 ** -digits) return v.toExponential(1);
  return v.toLocaleString("en", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export const fmtP = (p: number | null | undefined): string => (p == null || !Number.isFinite(p) ? "–" : p < 0.001 ? "< 0.001" : p.toFixed(3));
export const pEq = (p: number | null | undefined): string => (p == null || !Number.isFinite(p) ? "p = –" : p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(3)}`);
export const pct = (v: number, digits = 1): string => (Number.isFinite(v) ? `${(v * 100).toFixed(digits)}%` : "–");
export const fmtCI = (c: CI, digits = 2): string => `${fmt(c.value, digits)} (${fmt(c.lo, digits)} to ${fmt(c.hi, digits)})`;
export const pctCI = (c: CI): string => `${pct(c.value)} (${pct(c.lo)} to ${pct(c.hi)})`;

export function numberField(label: string, value: string, on: (v: string) => void, opts: { hint?: string; step?: string } = {}): HTMLElement {
  return h(
    "label",
    { className: "field" },
    label,
    h("input", {
      type: "text",
      inputmode: "decimal",
      value,
      autocomplete: "off",
      title: opts.hint ?? null,
      oninput: (e: Event) => on((e.target as HTMLInputElement).value),
    }),
  );
}

export function selectField<T extends string>(label: string, value: T, options: [T, string][], on: (v: T) => void): HTMLElement {
  return h(
    "label",
    { className: "field" },
    label,
    h(
      "select",
      { "aria-label": label, onchange: (e: Event) => on((e.target as HTMLSelectElement).value as T) },
      ...options.map(([v, l]) => h("option", { value: v, selected: v === value }, l)),
    ),
  );
}

export function resultTable(caption: string, header: string[], rows: (string | HTMLElement)[][]): HTMLElement {
  return h(
    "table",
    { className: "stat-table" },
    h("caption", { className: "sr-only" }, caption),
    h("thead", {}, h("tr", {}, ...header.map((x) => h("th", { scope: "col" }, x)))),
    h("tbody", {}, ...rows.map((r) => h("tr", {}, ...r.map((c, i) => (i === 0 ? h("th", { scope: "row" }, c) : h("td", {}, c)))))),
  );
}

export const note = (text: string) => h("p", { className: "muted small" }, text);
export const warn = (text: string) => h("p", { className: "stat-warn", role: "status" }, text);

export function parseCount(s: string): number {
  return s.trim() === "" ? NaN : Number(s.replace(/\s/g, ""));
}
