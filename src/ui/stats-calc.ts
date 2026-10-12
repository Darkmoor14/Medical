// Stats tab, section 1: clinical calculators on a 2x2 table.

import { h, replace } from "./dom";
import { pEq, fmt, fmtCI, note, numberField, parseCount, pct, pctCI, resultTable, warn } from "./stats-ui";
import { diagnosticAnalysis, posttestProbability, predictiveValues, riskAnalysis, validTable, type Table2x2 } from "../stats/clinical";

type Cells = [string, string, string, string];

function readTable(c: Cells): { table: Table2x2 | null; error: string | null } {
  if (c.every((v) => v.trim() === "")) return { table: null, error: null };
  const [a, b, cc, d] = c.map(parseCount);
  const t = { a, b, c: cc, d };
  const error = [a, b, cc, d].some(Number.isNaN) ? "Fill in all four boxes." : validTable(t);
  return { table: error ? null : t, error };
}

function tableInputs(labels: { rows: [string, string]; cols: [string, string] }, cells: Cells, on: () => void): HTMLElement {
  const box = (i: number, label: string) => numberField(label, cells[i], (v) => ((cells[i] = v), on()));
  return h(
    "div",
    { className: "grid2x2" },
    h("span", { className: "g-corner" }),
    h("strong", { className: "g-head" }, labels.cols[0]),
    h("strong", { className: "g-head" }, labels.cols[1]),
    h("strong", { className: "g-side" }, labels.rows[0]),
    box(0, `${labels.rows[0]}, ${labels.cols[0]}`),
    box(1, `${labels.rows[0]}, ${labels.cols[1]}`),
    h("strong", { className: "g-side" }, labels.rows[1]),
    box(2, `${labels.rows[1]}, ${labels.cols[0]}`),
    box(3, `${labels.rows[1]}, ${labels.cols[1]}`),
  );
}

function riskCard(): HTMLElement {
  const cells: Cells = ["", "", "", ""];
  const out = h("div", { className: "stat-out", "aria-live": "polite" });
  const update = () => {
    const { table, error } = readTable(cells);
    if (!table) {
      replace(out, error ? warn(error) : note("Enter the four counts to see the results."));
      return;
    }
    const r = riskAnalysis(table);
    const n = table.a + table.b + table.c + table.d;
    const nntText = r.nnt
      ? `${r.nnt.kind === "benefit" ? "NNT (benefit)" : "NNH (harm)"}: ${fmt(r.nnt.value, 1)}` +
        (r.nnt.lo != null && r.nnt.hi != null ? ` (${fmt(r.nnt.lo, 1)} to ${fmt(r.nnt.hi, 1)})` : " (interval includes no effect, so it is not reliable)")
      : "No difference in risk";
    replace(
      out,
      resultTable("Risk comparison", ["Measure", "Estimate (95% CI)"], [
        ["Risk, first group", pctCI(r.riskExposed)],
        ["Risk, second group", pctCI(r.riskUnexposed)],
        ["Risk ratio (RR)", fmtCI(r.rr)],
        ["Odds ratio (OR)", fmtCI(r.or)],
        ["Risk difference", `${pct(r.rd.value)} (${pct(r.rd.lo)} to ${pct(r.rd.hi)})`],
        ["Number needed to treat / harm", nntText.replace(/^[^:]+: /, "")],
        ["Chi-square test", `χ² = ${fmt(r.chi2)}, ${pEq(r.chi2P)}`],
        ["Fisher exact test", `${pEq(r.fisherP)}`],
      ]),
      h(
        "p",
        { className: "stat-summary" },
        `${n} people. Risk was ${pct(r.riskExposed.value)} in the first group and ${pct(r.riskUnexposed.value)} in the second (RR ${fmt(r.rr.value)}, 95% CI ${fmt(r.rr.lo)} to ${fmt(r.rr.hi)}). ${nntText}.`,
      ),
      r.corrected && warn("A cell is zero, so 0.5 was added to every cell for the risk ratio and odds ratio."),
      r.smallExpected && warn("Some expected counts are below 5: use the Fisher exact p-value instead of chi-square."),
    );
  };
  update();
  return h(
    "section",
    { className: "card" },
    h("div", { className: "card-head" }, h("h2", {}, "Compare two groups")),
    note("For a trial or cohort: how much more (or less) often does the outcome happen in the first group? Counts are people."),
    tableInputs({ rows: ["Treated / exposed", "Control / unexposed"], cols: ["Outcome", "No outcome"] }, cells, update),
    out,
  );
}

function diagnosticCard(): HTMLElement {
  const cells: Cells = ["", "", "", ""];
  let prevalence = "";
  let pretest = "";
  const out = h("div", { className: "stat-out" });
  const extraOut = h("div", { className: "stat-out", "aria-live": "polite" });
  const update = () => {
    const { table, error } = readTable(cells);
    replace(extraOut);
    if (!table) {
      replace(out, error ? warn(error) : note("Enter the four counts to see the results."));
      return;
    }
    const d = diagnosticAnalysis(table);
    const rows: [string, string][] = [
      ["Sensitivity", pctCI(d.sensitivity)],
      ["Specificity", pctCI(d.specificity)],
      ["Positive predictive value", pctCI(d.ppv)],
      ["Negative predictive value", pctCI(d.npv)],
      ["Accuracy", pctCI(d.accuracy)],
      ["Prevalence in this sample", pctCI(d.prevalence)],
      ["Positive likelihood ratio", d.lrPositive ? fmtCI(d.lrPositive) : "–"],
      ["Negative likelihood ratio", d.lrNegative ? fmtCI(d.lrNegative) : "–"],
      ["Diagnostic odds ratio", d.diagnosticOddsRatio != null ? fmt(d.diagnosticOddsRatio) : "–"],
    ];
    const extra: (HTMLElement | false)[] = [];
    const prev = Number(prevalence.replace(",", "."));
    if (prevalence.trim() && prev > 0 && prev < 100) {
      const pv = predictiveValues(d.sensitivity.value, d.specificity.value, prev / 100);
      extra.push(h("p", { className: "stat-summary" }, `At a prevalence of ${fmt(prev, 1)}%: positive predictive value ${pct(pv.ppv)}, negative predictive value ${pct(pv.npv)}.`));
    }
    const pre = Number(pretest.replace(",", "."));
    if (pretest.trim() && pre > 0 && pre < 100 && d.lrPositive && d.lrNegative) {
      extra.push(
        h(
          "p",
          { className: "stat-summary" },
          `Starting from a pre-test probability of ${fmt(pre, 1)}%: a positive test gives ${pct(posttestProbability(pre / 100, d.lrPositive.value))}; a negative test gives ${pct(posttestProbability(pre / 100, d.lrNegative.value))}.`,
        ),
      );
    }
    replace(out, resultTable("Diagnostic accuracy", ["Measure", "Estimate (95% CI)"], rows));
    replace(extraOut, ...extra);
  };
  update();
  return h(
    "section",
    { className: "card" },
    h("div", { className: "card-head" }, h("h2", {}, "Test accuracy")),
    note("Compare a test with a reference standard. Counts are people."),
    tableInputs({ rows: ["Test positive", "Test negative"], cols: ["Disease", "No disease"] }, cells, update),
    out,
    h(
      "div",
      { className: "calc-extra" },
      numberField("Prevalence in your population (%)", prevalence, (v) => ((prevalence = v), update()), { hint: "Predictive values depend on how common the disease is" }),
      numberField("Pre-test probability (%)", pretest, (v) => ((pretest = v), update()), { hint: "Your estimate before the test" }),
    ),
    extraOut,
  );
}

export function calculators(): HTMLElement {
  return h("div", { className: "tab-body" }, riskCard(), diagnosticCard(), note("Confidence intervals: log method for ratios, Wald for the risk difference, Wilson for proportions. Calculated in your browser."));
}
