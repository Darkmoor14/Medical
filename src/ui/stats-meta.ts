// Stats tab, section 4: pool study results into a meta-analysis.

import { h, replace } from "./dom";
import { downloadText } from "./download";
import { forestPlot } from "./stats-plots";
import { pEq, fmt, fmtP, note, resultTable, selectField, warn } from "./stats-ui";
import { readingList } from "../search/store";
import { articleKey } from "../pubmed";
import { loadMatrix, studyLabel } from "../write/matrix";
import { metaAnalysis, parseEstimate, type Scale } from "../stats/meta";

interface Row {
  label: string;
  est: string;
  lo: string;
  hi: string;
}
interface State {
  scale: Scale;
  measure: string;
  rows: Row[];
}

const KEY = "opm-meta-v1";
const MEASURES: Record<Scale, string[]> = { ratio: ["Odds ratio", "Risk ratio", "Hazard ratio"], difference: ["Mean difference", "Risk difference", "Other difference"] };

function load(): State {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (s && Array.isArray(s.rows)) return { scale: s.scale === "difference" ? "difference" : "ratio", measure: String(s.measure ?? "Odds ratio"), rows: s.rows };
  } catch {
    // Start fresh.
  }
  return { scale: "ratio", measure: "Odds ratio", rows: [blank(), blank()] };
}
const blank = (): Row => ({ label: "", est: "", lo: "", hi: "" });
const save = (s: State) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Not saving is harmless: the table still works.
  }
};

export function metaSection(): HTMLElement & { refresh: () => void } {
  const state = load();
  const tableHost = h("div", { className: "table-scroll" });
  const resultHost = h("div", { className: "stat-out", "aria-live": "polite" });
  const msg = h("p", { className: "status", role: "status" });

  function results() {
    save(state);
    const filled = state.rows.filter((r) => r.est.trim() || r.lo.trim() || r.hi.trim());
    const m = filled.length >= 2 ? metaAnalysis(filled.map((r) => ({ label: r.label.trim(), est: parseEstimate(r.est), lo: parseEstimate(r.lo), hi: parseEstimate(r.hi) })), state.scale) : null;
    if (!m) {
      replace(resultHost, note(filled.length < 2 ? "Enter at least two studies with an estimate and its 95% confidence interval." : `Need at least two usable studies. ${state.scale === "ratio" ? "Ratios must be above zero, " : ""}and each estimate must lie between its lower and upper limit.`));
      return;
    }
    const pooledRow = (name: string, p: { est: number; lo: number; hi: number; p: number }) => [name, fmt(p.est, 3), `${fmt(p.lo, 3)} to ${fmt(p.hi, 3)}`, fmtP(p.p)];
    replace(
      resultHost,
      m.skipped.length ? warn(`Left out because the numbers can't be used: ${m.skipped.join(", ")}.`) : null,
      resultTable("Pooled results", ["Model", state.measure, "95% CI", "p"], [pooledRow("Fixed effect", m.fixed), pooledRow("Random effects (DerSimonian–Laird)", m.random)]),
      resultTable("Heterogeneity", ["Measure", "Value"], [
        ["Studies", String(m.studies.length)],
        ["Cochran's Q", `${fmt(m.q)} (df ${m.df}), ${pEq(m.qP)}`],
        ["I²", `${fmt(m.i2, 0)}%`],
        ["τ²", fmt(m.tau2, 4)],
      ]),
      m.i2 >= 50 ? warn(`Heterogeneity is ${m.i2 >= 75 ? "high" : "moderate"} (I² ${fmt(m.i2, 0)}%): the studies disagree more than chance explains. Prefer the random-effects result and look for reasons (population, dose, design).`) : null,
      m.studies.length < 5 ? note("With fewer than five studies the heterogeneity estimates are very imprecise.") : null,
      forestPlot(m, state.scale, state.measure),
      h(
        "button",
        {
          type: "button",
          className: "small-btn",
          onclick: () =>
            downloadText(
              "meta-analysis.csv",
              [
                ["Study", state.measure, "Lower 95%", "Upper 95%", "Weight fixed %", "Weight random %"],
                ...m.studies.map((s) => [`"${s.label.replace(/"/g, '""')}"`, s.est, s.lo, s.hi, fmt(s.wFixed, 1), fmt(s.wRandom, 1)]),
                ["Fixed effect", m.fixed.est, m.fixed.lo, m.fixed.hi, "", ""],
                ["Random effects", m.random.est, m.random.lo, m.random.hi, "", ""],
              ]
                .map((r) => r.join(","))
                .join("\n"),
              "text/csv;charset=utf-8",
            ),
        },
        "Download CSV",
      ),
      note("Estimates are pooled on the log scale for ratios. Use adjusted or unadjusted estimates consistently across studies, and make sure all point the same way (for example, treatment versus control in every study)."),
    );
  }

  function renderTable() {
    const input = (r: Row, f: keyof Row, label: string, i: number) =>
      h("input", {
        type: "text",
        value: r[f],
        inputmode: f === "label" ? "text" : "decimal",
        "aria-label": `${label} of study ${i + 1}`,
        autocomplete: "off",
        oninput: (e: Event) => {
          r[f] = (e.target as HTMLInputElement).value;
          results();
        },
      });
    replace(
      tableHost,
      h(
        "table",
        { className: "stat-table meta-input" },
        h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Study"), h("th", { scope: "col" }, state.measure), h("th", { scope: "col" }, "Lower 95%"), h("th", { scope: "col" }, "Upper 95%"), h("th", { scope: "col" }, h("span", { className: "sr-only" }, "Remove")))),
        h(
          "tbody",
          {},
          ...state.rows.map((r, i) =>
            h(
              "tr",
              {},
              h("td", {}, input(r, "label", "Name", i)),
              h("td", {}, input(r, "est", "Estimate", i)),
              h("td", {}, input(r, "lo", "Lower limit", i)),
              h("td", {}, input(r, "hi", "Upper limit", i)),
              h(
                "td",
                {},
                h(
                  "button",
                  {
                    type: "button",
                    className: "icon-btn",
                    "aria-label": `Remove study ${i + 1}`,
                    onclick: () => {
                      state.rows.splice(i, 1);
                      if (!state.rows.length) state.rows.push(blank());
                      renderTable();
                      results();
                    },
                  },
                  "✕",
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  function importFromMatrix() {
    const matrix = loadMatrix();
    const list = readingList().map((p) => p.article);
    const included = list.filter((a) => matrix.decisions[articleKey(a)] === "include");
    const source = included.length ? included : list;
    if (!source.length) {
      msg.className = "status error";
      msg.textContent = "Your reading list is empty. Save papers in the Search tab first.";
      return;
    }
    const have = new Set(state.rows.map((r) => r.label));
    let added = 0;
    state.rows = state.rows.filter((r) => r.label || r.est || r.lo || r.hi);
    for (const a of source) {
      const label = studyLabel(a);
      if (have.has(label)) continue;
      state.rows.push({ label, est: "", lo: "", hi: "" });
      added++;
    }
    if (!state.rows.length) state.rows.push(blank());
    msg.className = "status";
    msg.textContent = `Added ${added} stud${added === 1 ? "y" : "ies"} ${included.length ? "marked Include in the Matrix tab" : "from your reading list"}. Now type each one's estimate and confidence interval.`;
    renderTable();
    results();
  }

  const pasteBox = h("textarea", { rows: 4, "aria-label": "Rows to paste", placeholder: "One study per line: name, estimate, lower, upper\nSmith 2020; 0.80; 0.62; 1.03" });
  const section = h(
    "div",
    { className: "tab-body" },
    h(
      "section",
      { className: "card" },
      h("div", { className: "card-head" }, h("h2", {}, "Meta-analysis")),
      note("Combine results of several studies. For each study type the main result with its 95% confidence interval, exactly as the paper reports it."),
      h(
        "div",
        { className: "matrix-toolbar" },
        selectField("Type of result", state.scale, [["ratio", "Ratio (OR, RR, HR)"], ["difference", "Difference (mean difference, risk difference)"]], (v) => {
          state.scale = v;
          state.measure = MEASURES[v][0];
          renderTable();
          results();
          measureSelect.replaceWith((measureSelect = makeMeasure()));
        }),
      ),
      tableHost,
      h(
        "div",
        { className: "matrix-toolbar" },
        h("button", { type: "button", onclick: () => (state.rows.push(blank()), renderTable(), results()) }, "Add study"),
        h("button", { type: "button", onclick: importFromMatrix, title: "Adds the papers marked Include in the Matrix tab (or the whole reading list) as rows to fill in" }, "Add studies from my matrix"),
        h("button", { type: "button", className: "link", onclick: () => ((state.rows = [blank(), blank()]), msg.replaceChildren(), renderTable(), results()) }, "Clear"),
      ),
      h(
        "details",
        { className: "table-view" },
        h("summary", {}, "Paste several studies at once"),
        pasteBox,
        h(
          "button",
          {
            type: "button",
            className: "small-btn",
            onclick: () => {
              const rows = pasteBox.value
                .split(/\r?\n/)
                .map((l) => l.split(/[;\t]|,(?=\s*[\d.-])/).map((x) => x.trim()))
                .filter((p) => p.length >= 4)
                .map(([label, est, lo, hi]) => ({ label, est, lo, hi }));
              if (!rows.length) {
                msg.className = "status error";
                msg.textContent = "No usable lines. Use: name; estimate; lower; upper";
                return;
              }
              state.rows = [...state.rows.filter((r) => r.label || r.est || r.lo || r.hi), ...rows];
              pasteBox.value = "";
              msg.className = "status";
              msg.textContent = `Added ${rows.length} stud${rows.length === 1 ? "y" : "ies"}.`;
              renderTable();
              results();
            },
          },
          "Add these rows",
        ),
      ),
      msg,
    ),
    h("section", { className: "card" }, h("div", { className: "card-head" }, h("h2", {}, "Result")), resultHost),
    note("Meta-analysis is only as good as the studies and how they were chosen. This tool pools numbers; it doesn't assess risk of bias or publication bias."),
  );

  const makeMeasure = () => selectField("Measure", state.measure, MEASURES[state.scale].map((m) => [m, m] as [string, string]), (v) => ((state.measure = v), renderTable(), results()));
  let measureSelect = makeMeasure();
  section.querySelector(".matrix-toolbar")!.append(measureSelect);

  renderTable();
  results();
  return Object.assign(section, { refresh: () => undefined });
}
