// Stats tab, section 3: analyse your own table (pasted or from a file).
// The data is read in this page only: never stored, never sent anywhere.

import { h, replace } from "./dom";
import { columnChart } from "./charts";
import { scatterPlot } from "./stats-plots";
import { pEq, fmt, note, resultTable, selectField, warn } from "./stats-ui";
import { crossTab, groupBy, pairs, parseDataset, type CategoricalColumn, type Column, type Dataset, type NumericColumn } from "../stats/dataset";
import { chiSquareTable, describe, kruskalWallis, mannWhitney, oneWayAnova, pearson, regression, spearman, welchT } from "../stats/tests";

const EXAMPLE = `age,sex,treatment,sbp_before,sbp_after
54,F,A,152,138
61,M,A,160,141
47,F,B,148,147
66,M,B,158,155
58,F,A,155,139
72,M,B,165,160
49,F,A,150,135
63,M,B,159,151
55,F,B,149,146
68,M,A,162,142`;

const nums = (c: NumericColumn) => c.values.filter((v): v is number => v !== null);

function summaryTable(ds: Dataset): HTMLElement {
  const rows = ds.columns.map((c) => {
    const missing = c.values.filter((v) => v === null).length;
    if (c.kind === "numeric") {
      const d = describe(nums(c));
      if (!d) return [c.name, "number", "0", String(missing), "–", "–", "–"];
      return [c.name, "number", String(d.n), String(missing), `${fmt(d.mean)} ± ${fmt(d.sd)}`, `${fmt(d.median)} (${fmt(d.q1)}–${fmt(d.q3)})`, `${fmt(d.min)} – ${fmt(d.max)}`];
    }
    const counts = new Map<string, number>();
    for (const v of c.values) if (v !== null) counts.set(v, (counts.get(v) ?? 0) + 1);
    const n = [...counts.values()].reduce((s, v) => s + v, 0);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const text = top.slice(0, 4).map(([k, v]) => `${k} ${v} (${((v / n) * 100).toFixed(0)}%)`).join("; ") + (top.length > 4 ? `; +${top.length - 4} more` : "");
    return [c.name, `${counts.size} categories`, String(n), String(missing), text, "", ""];
  });
  return resultTable("Summary of every column", ["Column", "Type", "n", "Missing", "Mean ± SD, or categories", "Median (IQR)", "Range"], rows);
}

function histogram(values: number[], title: string): HTMLElement {
  const n = values.length;
  const bins = Math.max(3, Math.min(20, Math.ceil(Math.log2(n) + 1)));
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const width = (hi - lo) / bins || 1;
  const counts = new Array(bins).fill(0) as number[];
  for (const v of values) counts[Math.min(bins - 1, Math.floor((v - lo) / width))]++;
  return columnChart({ title, data: counts.map((c, i) => ({ label: fmt(lo + i * width, 1), count: c })), unit: "values", tableCaption: `Values per ${title}` });
}

function compareGroups(ds: Dataset, v: Column, g: CategoricalColumn): HTMLElement {
  if (v.kind === "numeric") {
    const groups = groupBy(v.values, g.values);
    const names = [...groups.keys()].sort();
    if (names.length < 2) return warn("The grouping column needs at least two different values.");
    if (names.length > 12) return warn(`The grouping column has ${names.length} different values; pick a column with fewer categories.`);
    const rows = names.map((k) => {
      const d = describe(groups.get(k)!)!;
      return [k, String(d.n), `${fmt(d.mean)} ± ${fmt(d.sd)}`, `${fmt(d.median)} (${fmt(d.q1)}–${fmt(d.q3)})`, `${fmt(d.ci[0])} to ${fmt(d.ci[1])}`];
    });
    const out: (HTMLElement | null)[] = [resultTable(`${v.name} by ${g.name}`, [g.name, "n", "Mean ± SD", "Median (IQR)", "95% CI of mean"], rows)];
    const small = names.some((k) => groups.get(k)!.length < 2);
    if (small) out.push(warn("A group has fewer than two values, so some tests can't be run."));
    if (names.length === 2) {
      const [x, y] = names.map((k) => groups.get(k)!);
      const t = welchT(x, y);
      const mw = mannWhitney(x, y);
      out.push(
        resultTable("Tests", ["Test", "Result"], [
          ["Welch's t-test", t ? `t = ${fmt(t.t)}, df = ${fmt(t.df, 1)}, ${pEq(t.p)}; difference ${fmt(t.diff)} (95% CI ${fmt(t.ci[0])} to ${fmt(t.ci[1])})` : "can't be calculated"],
          ["Mann–Whitney U", mw ? `U = ${fmt(mw.u, 1)}, ${pEq(mw.p)}` : "can't be calculated"],
        ]),
      );
    } else {
      const all = names.map((k) => groups.get(k)!);
      const a = oneWayAnova(all);
      const k = kruskalWallis(all);
      out.push(
        resultTable("Tests", ["Test", "Result"], [
          ["One-way ANOVA", a ? `F(${a.df1}, ${a.df2}) = ${fmt(a.f)}, ${pEq(a.p)}` : "can't be calculated"],
          ["Kruskal–Wallis", k ? `H = ${fmt(k.h)}, df = ${k.df}, ${pEq(k.p)}` : "can't be calculated"],
        ]),
        note("With more than two groups these tests only say whether any group differs; they don't say which."),
      );
    }
    out.push(note("The t-test assumes roughly bell-shaped values; the rank tests don't. For paired (before/after) data compare the difference column against zero instead."));
    return h("div", { className: "stat-out" }, ...out);
  }
  const tab = crossTab(v.values, g.values);
  if (tab.rowLabels.length < 2 || tab.colLabels.length < 2) return warn("Both columns need at least two different values.");
  if (tab.rowLabels.length > 12 || tab.colLabels.length > 12) return warn("Too many categories for a cross-table; pick columns with fewer values.");
  const total = tab.counts.flat().reduce((s, x) => s + x, 0);
  const rows = tab.rowLabels.map((r, i) => {
    const rowSum = tab.counts[i].reduce((s, x) => s + x, 0);
    return [r, ...tab.counts[i].map((c) => `${c} (${((c / rowSum) * 100).toFixed(0)}%)`), String(rowSum)];
  });
  const chi = chiSquareTable(tab.counts);
  return h(
    "div",
    { className: "stat-out" },
    resultTable(`${v.name} by ${g.name}`, [`${v.name} \\ ${g.name}`, ...tab.colLabels, "Total"], rows),
    h("p", { className: "muted small" }, `Row percentages. ${total} people with both values.`),
    chi
      ? resultTable("Test", ["Test", "Result"], [
          ["Chi-square", `χ²(${chi.df}) = ${fmt(chi.chi2)}, ${pEq(chi.p)}; Cramér's V = ${fmt(chi.cramersV)}`],
          ...(chi.fisherP != null ? [["Fisher exact", `${pEq(chi.fisherP)}`]] : []),
        ])
      : warn("Chi-square can't be calculated for this table."),
    chi && chi.minExpected < 5 ? warn("Some expected counts are below 5: prefer Fisher's exact test (2×2) or combine categories.") : null,
  );
}

function correlate(x: NumericColumn, y: NumericColumn): HTMLElement {
  const ps = pairs(x.values, y.values);
  const xs = ps.map((p) => p[0]);
  const ys = ps.map((p) => p[1]);
  const pr = pearson(xs, ys);
  if (!pr) return warn("Need at least three rows with values in both columns, and some variation in each.");
  const sp = spearman(xs, ys);
  const line = regression(xs, ys);
  return h(
    "div",
    { className: "stat-out" },
    resultTable(`${x.name} and ${y.name}`, ["Measure", "Result"], [
      ["Rows used", String(ps.length)],
      ["Pearson r", `${fmt(pr.r, 3)}${pr.ci ? ` (95% CI ${fmt(pr.ci[0], 3)} to ${fmt(pr.ci[1], 3)})` : ""}, ${pEq(pr.p)}`],
      ["Spearman ρ", sp ? `${fmt(sp.r, 3)}, ${pEq(sp.p)}` : "–"],
      ["Straight line", line ? `${y.name} = ${fmt(line.intercept, 3)} + ${fmt(line.slope, 3)} × ${x.name}` : "–"],
    ]),
    scatterPlot(xs, ys, x.name, y.name, line),
    note("Correlation isn't causation. Pearson looks for a straight-line relationship; Spearman for any steadily rising or falling one."),
  );
}

export function ownData(): HTMLElement {
  let ds: Dataset | null = null;
  const text = h("textarea", { rows: 7, placeholder: "Paste a table here (including the header row), copied from Excel or a CSV file", "aria-label": "Data table" });
  const status = h("p", { className: "status", role: "status" });
  const result = h("div", { className: "tab-body" });

  const analyse = () => {
    try {
      ds = parseDataset(text.value);
      status.textContent = "";
      status.className = "status";
    } catch (err) {
      ds = null;
      status.className = "status error";
      status.textContent = err instanceof Error ? err.message : String(err);
      replace(result);
      return;
    }
    renderResults(ds);
  };

  function renderResults(data: Dataset) {
    const all = data.columns;
    const numeric = all.filter((c): c is NumericColumn => c.kind === "numeric");
    const cat = all.filter((c): c is CategoricalColumn => c.kind === "categorical" && new Set(c.values.filter(Boolean)).size <= 12);

    // Compare
    let varIdx = Math.max(0, all.findIndex((c) => c.kind === "numeric" && c.name !== cat[0]?.name));
    if (all[varIdx].name === cat[0]?.name) varIdx = Math.max(0, all.findIndex((c) => c.name !== cat[0]?.name));
    let grpIdx = 0;
    const cmpOut = h("div", {});
    const cmp = () => {
      const v = all[varIdx];
      const g = cat[grpIdx];
      if (!g) return replace(cmpOut, note("Needs a column of categories (such as sex or treatment) to compare by."));
      if (v === g) return replace(cmpOut, note("Pick a different variable from the grouping column."));
      replace(cmpOut, v.kind === "numeric" ? histogram(nums(v), v.name) : null, compareGroups(data, v, g));
    };
    // Correlate
    let xi = 0;
    let yi = Math.min(1, numeric.length - 1);
    const corOut = h("div", {});
    const cor = () => (numeric.length < 2 ? replace(corOut, note("Needs at least two numeric columns.")) : xi === yi ? replace(corOut, note("Pick two different columns.")) : replace(corOut, correlate(numeric[xi], numeric[yi])));

    replace(
      result,
      h(
        "section",
        { className: "card" },
        h("div", { className: "card-head" }, h("h2", {}, "Summary")),
        h("p", { className: "muted small" }, `${data.rows} rows, ${all.length} columns (${numeric.length} numeric).`),
        h("div", { className: "table-scroll" }, summaryTable(data)),
      ),
      h(
        "section",
        { className: "card" },
        h("div", { className: "card-head" }, h("h2", {}, "Compare groups")),
        h(
          "div",
          { className: "matrix-toolbar" },
          selectField("Variable", all[varIdx].name, all.map((c) => [c.name, c.name] as [string, string]), (name) => ((varIdx = all.findIndex((c) => c.name === name)), cmp())),
          selectField("Compare by", cat[0]?.name ?? "", cat.map((c) => [c.name, c.name] as [string, string]), (name) => ((grpIdx = cat.findIndex((c) => c.name === name)), cmp())),
        ),
        cmpOut,
      ),
      h(
        "section",
        { className: "card" },
        h("div", { className: "card-head" }, h("h2", {}, "Relationship between two measurements")),
        numeric.length >= 2
          ? h(
              "div",
              { className: "matrix-toolbar" },
              selectField("X axis", numeric[xi].name, numeric.map((c) => [c.name, c.name] as [string, string]), (name) => ((xi = numeric.findIndex((c) => c.name === name)), cor())),
              selectField("Y axis", numeric[yi].name, numeric.map((c) => [c.name, c.name] as [string, string]), (name) => ((yi = numeric.findIndex((c) => c.name === name)), cor())),
            )
          : null,
        corOut,
      ),
    );
    cmp();
    cor();
  }

  const file = h("input", {
    type: "file",
    accept: ".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain",
    "aria-label": "Choose a data file",
    onchange: async (e: Event) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      if (f.size > 20_000_000) {
        status.className = "status error";
        status.textContent = "That file is larger than 20 MB.";
        return;
      }
      text.value = await f.text();
      analyse();
    },
  });

  return h(
    "div",
    { className: "tab-body" },
    h(
      "section",
      { className: "card" },
      h("div", { className: "card-head" }, h("h2", {}, "Your data")),
      note("Paste a table copied from Excel, or open a .csv / .tsv file (in Excel: Save as → CSV). The first row must be the column names. The data stays in this page: it isn't saved or sent anywhere. Even so, remove names and other identifiers first."),
      text,
      h(
        "div",
        { className: "matrix-toolbar" },
        h("button", { type: "button", className: "primary", onclick: analyse }, "Analyse"),
        h("label", { className: "field inline" }, "or open a file", file),
        h(
          "button",
          {
            type: "button",
            className: "link",
            onclick: () => {
              text.value = EXAMPLE;
              analyse();
            },
          },
          "Try an example",
        ),
        h("button", { type: "button", className: "link", onclick: () => ((text.value = ""), (ds = null), replace(result), (status.textContent = "")) }, "Clear"),
      ),
      status,
    ),
    result,
  );
}
