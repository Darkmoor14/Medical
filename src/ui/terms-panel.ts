// "What these papers talk about": share of analysed papers mentioning each
// term, per category. Clicking a term filters the paper list.

import { h } from "./dom";
import { normalizeTerm, type TermStat } from "../entities";
import { CATEGORY_LABEL, CATEGORY_ORDER, type Category } from "../models";

const TOP_N = 12;

export function termsPanel(opts: {
  stats: TermStat[];
  total: number;
  active: TermStat | null;
  onSelect: (stat: TermStat | null) => void;
}): HTMLElement {
  const { stats, total, active } = opts;
  const byCat = new Map<Category, TermStat[]>();
  for (const stat of stats) {
    const list = byCat.get(stat.category) ?? [];
    if (list.length < TOP_N) list.push(stat);
    byCat.set(stat.category, list);
  }
  const cats = CATEGORY_ORDER.filter((c) => byCat.has(c));
  if (!cats.length) {
    return h("p", { className: "muted" }, "No terms detected. Try turning on more detectors or lowering the threshold in Settings.");
  }
  return h(
    "div",
    { className: "term-columns" },
    ...cats.map((cat) =>
      h(
        "div",
        { className: "term-col" },
        h("h3", {}, h("span", { className: `dot cat-${cat}` }), CATEGORY_LABEL[cat]),
        h(
          "ol",
          { className: "bars" },
          ...byCat.get(cat)!.map((stat) => {
            const pct = (stat.docs.size / total) * 100;
            const on = active?.key === stat.key;
            return h(
              "li",
              {},
              h(
                "button",
                {
                  type: "button",
                  className: `bar-row${on ? " active" : ""}`,
                  "aria-pressed": on ? "true" : "false",
                  title: `${stat.docs.size} of ${total} papers (${pct.toFixed(0)}%)`,
                  onclick: () => opts.onSelect(on ? null : stat),
                },
                h("span", { className: "bar-label" }, stat.term),
                h("span", { className: "bar-track" }, h("span", { className: `bar-fill cat-${cat}`, style: `width:${pct.toFixed(1)}%` })),
                h("span", { className: "bar-value" }, `${stat.docs.size}`),
              ),
            );
          }),
        ),
      ),
    ),
  );
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function termsCsv(stats: TermStat[], total: number): string {
  const rows: (string | number)[][] = [["category", "term", "papers", "mentions", "share", "pmids"]];
  for (const s of stats) {
    rows.push([
      CATEGORY_LABEL[s.category],
      normalizeTerm(s.term),
      s.docs.size,
      s.mentions,
      (s.docs.size / total).toFixed(3),
      [...s.docs].join(" "),
    ]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

export function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
