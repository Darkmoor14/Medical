// Stats tab, section 4: pool study results into a meta-analysis.

import { h, replace } from "./dom";
import { downloadText } from "./download";
import { forestPlot } from "./stats-plots";
import { pEq, fmt, fmtP, note, resultTable, selectField, warn } from "./stats-ui";
import { activeList, listKey, onReadingListChange, readingList } from "../search/store";
import { articleKey } from "../pubmed";
import { loadMatrix, studyLabel } from "../write/matrix";
import { metaAnalysis, parseEstimate, type Scale } from "../stats/meta";
import { KIND_LABEL, primaryEffect, type EffectKind } from "../stats/extract";

interface Row {
  label: string;
  est: string;
  lo: string;
  hi: string;
}
interface State {
  scale: Scale;
  measure: string;
  // Studies typed in by hand.
  rows: Row[];
  // Take studies from the active reading list, reading their abstracts.
  auto: boolean;
  // Values the user corrected for papers from the list, and papers left out.
  overrides: Record<string, { est: string; lo: string; hi: string }>;
  unused: string[];
}

// One row of the table, whether it came from the reading list or was typed in.
interface View {
  key: string | null; // article key for rows from the list
  label: string;
  est: string;
  lo: string;
  hi: string;
  use: boolean;
  source: string;
  kind: EffectKind | null;
  edited: boolean;
  manual: Row | null;
}

const KEY = "opm-meta-v1"; // one per reading list
const MEASURES: Record<Scale, string[]> = { ratio: ["Odds ratio", "Risk ratio", "Hazard ratio"], difference: ["Mean difference", "Risk difference", "Other difference"] };

function load(listId: string): State {
  try {
    const s = JSON.parse(localStorage.getItem(listKey(KEY, listId)) ?? "null");
    if (s && Array.isArray(s.rows)) {
      return {
        scale: s.scale === "difference" ? "difference" : "ratio",
        measure: String(s.measure ?? "Odds ratio"),
        rows: s.rows,
        auto: s.auto !== false,
        overrides: s.overrides && typeof s.overrides === "object" ? s.overrides : {},
        unused: Array.isArray(s.unused) ? s.unused : [],
      };
    }
  } catch {
    // Start fresh.
  }
  return { scale: "ratio", measure: "Odds ratio", rows: [blank()], auto: true, overrides: {}, unused: [] };
}
const blank = (): Row => ({ label: "", est: "", lo: "", hi: "" });
const save = (s: State, listId: string) => {
  try {
    localStorage.setItem(listKey(KEY, listId), JSON.stringify(s));
  } catch {
    // Not saving is harmless: the table still works.
  }
};

const SHORT: Record<EffectKind, string> = { OR: "OR", RR: "RR", HR: "HR", MD: "MD", SMD: "SMD", RD: "RD" };

export function metaSection(): HTMLElement & { refresh: () => void } {
  let listId = activeList().id;
  let state = load(listId);
  let views: View[] = [];
  const tableHost = h("div", { className: "table-scroll" });
  const infoHost = h("div", { className: "stat-out" });
  const resultHost = h("div", { className: "stat-out", "aria-live": "polite" });
  const msg = h("p", { className: "status", role: "status" });
  const heading = h("h2", {}, "Meta-analysis");

  const persist = () => save(state, listId);

  // Rows from the reading list: papers marked Include in the Matrix if there are any,
  // otherwise every paper not marked Exclude.
  function buildViews(): { views: View[]; note: string } {
    const out: View[] = [];
    let noteText = "";
    if (state.auto) {
      const matrix = loadMatrix(listId);
      const papers = readingList().map((p) => p.article);
      const included = papers.filter((a) => matrix.decisions[articleKey(a)] === "include");
      const used = included.length ? included : papers.filter((a) => matrix.decisions[articleKey(a)] !== "exclude");
      noteText = included.length
        ? `Using the ${included.length} paper${included.length === 1 ? "" : "s"} marked Include in the Matrix tab.`
        : papers.length
          ? `Using all ${used.length} paper${used.length === 1 ? "" : "s"} in this list that aren't marked Exclude. Mark papers Include in the Matrix tab to choose.`
          : "";
      for (const a of used) {
        const key = articleKey(a);
        const found = primaryEffect(a, state.scale);
        const over = state.overrides[key];
        out.push({
          key,
          label: studyLabel(a),
          est: over?.est ?? (found ? String(found.est) : ""),
          lo: over?.lo ?? (found ? String(found.lo) : ""),
          hi: over?.hi ?? (found ? String(found.hi) : ""),
          use: !state.unused.includes(key),
          source: found ? found.sentence : "No effect size with a confidence interval was found in the abstract. Type it in from the paper, or untick this row.",
          kind: found?.kind ?? null,
          edited: Boolean(over),
          manual: null,
        });
      }
    }
    for (const r of state.rows) out.push({ key: null, label: r.label, est: r.est, lo: r.lo, hi: r.hi, use: true, source: "", kind: null, edited: false, manual: r });
    return { views: out, note: noteText };
  }

  const measureName = (): string => {
    const kinds = new Set(views.filter((v) => v.use && v.kind && v.est).map((v) => v.kind!));
    return kinds.size === 1 ? KIND_LABEL[[...kinds][0]] : state.measure;
  };

  function results() {
    persist();
    const active = views.filter((v) => v.use && (v.est.trim() || v.lo.trim() || v.hi.trim()));
    const m = active.length >= 2 ? metaAnalysis(active.map((r) => ({ label: r.label.trim(), est: parseEstimate(r.est), lo: parseEstimate(r.lo), hi: parseEstimate(r.hi) })), state.scale) : null;
    if (!m) {
      replace(resultHost, note(active.length < 2 ? "Needs at least two studies with an estimate and its 95% confidence interval." : `Needs at least two usable studies. ${state.scale === "ratio" ? "Ratios must be above zero, " : ""}and each estimate must lie between its lower and upper limit.`));
      return;
    }
    const measure = measureName();
    const mixed = new Set(active.map((v) => v.kind).filter(Boolean)).size > 1;
    const pooledRow = (name: string, p: { est: number; lo: number; hi: number; p: number }) => [name, fmt(p.est, 3), `${fmt(p.lo, 3)} to ${fmt(p.hi, 3)}`, pEq(p.p)];
    replace(
      resultHost,
      m.skipped.length ? warn(`Left out because the numbers can't be used: ${m.skipped.join(", ")}.`) : null,
      mixed ? warn("These studies report different measures (for example OR and HR). Pooling them is only reasonable when they approximate each other, as with rare outcomes. Otherwise analyse them separately.") : null,
      resultTable("Pooled results", ["Model", measure, "95% CI", "p"], [pooledRow("Fixed effect", m.fixed), pooledRow("Random effects (DerSimonian–Laird)", m.random)]),
      resultTable("Heterogeneity", ["Measure", "Value"], [
        ["Studies", String(m.studies.length)],
        ["Cochran's Q", `${fmt(m.q)} (df ${m.df}), ${pEq(m.qP)}`],
        ["I²", `${fmt(m.i2, 0)}%`],
        ["τ²", fmt(m.tau2, 4)],
      ]),
      m.i2 >= 50 ? warn(`Heterogeneity is ${m.i2 >= 75 ? "high" : "moderate"} (I² ${fmt(m.i2, 0)}%): the studies disagree more than chance explains. Prefer the random-effects result and look for reasons (population, dose, design).`) : null,
      m.studies.length < 5 ? note("With fewer than five studies the heterogeneity estimates are very imprecise.") : null,
      forestPlot(m, state.scale, measure),
      h(
        "button",
        {
          type: "button",
          className: "small-btn",
          onclick: () =>
            downloadText(
              "meta-analysis.csv",
              [
                ["Study", measure, "Lower 95%", "Upper 95%", "Weight fixed %", "Weight random %"],
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
    const built = buildViews();
    views = built.views;
    heading.textContent = `Meta-analysis: ${activeList().name}`;
    const autoCount = views.filter((v) => v.key).length;
    const found = views.filter((v) => v.key && v.kind && !v.edited).length;
    replace(
      infoHost,
      state.auto && built.note ? note(`${built.note} Effect sizes were read from ${found} of ${autoCount} abstract${autoCount === 1 ? "" : "s"}: check each one against the source sentence.`) : null,
    );

    const input = (v: View, f: "label" | "est" | "lo" | "hi", label: string, i: number) =>
      h("input", {
        type: "text",
        value: v[f],
        readOnly: f === "label" && v.key !== null,
        inputmode: f === "label" ? "text" : "decimal",
        "aria-label": `${label} of study ${i + 1}`,
        autocomplete: "off",
        oninput: (e: Event) => {
          v[f] = (e.target as HTMLInputElement).value;
          if (v.manual) v.manual[f] = v[f];
          else if (v.key && f !== "label") {
            state.overrides[v.key] = { est: v.est, lo: v.lo, hi: v.hi };
            v.edited = true;
          }
          results();
        },
      });

    replace(
      tableHost,
      h(
        "table",
        { className: "stat-table meta-input" },
        h(
          "thead",
          {},
          h(
            "tr",
            {},
            h("th", { scope: "col" }, "Use"),
            h("th", { scope: "col" }, "Study"),
            h("th", { scope: "col" }, state.measure),
            h("th", { scope: "col" }, "Lower 95%"),
            h("th", { scope: "col" }, "Upper 95%"),
            h("th", { scope: "col" }, "Found in the abstract"),
            h("th", { scope: "col" }, h("span", { className: "sr-only" }, "Actions")),
          ),
        ),
        h(
          "tbody",
          {},
          ...views.map((v, i) =>
            h(
              "tr",
              { className: v.use ? "" : "meta-off", "data-key": v.key ?? null },
              h(
                "td",
                {},
                v.key
                  ? h("input", {
                      type: "checkbox",
                      checked: v.use,
                      "aria-label": `Use study ${i + 1} (${v.label})`,
                      onchange: (e: Event) => {
                        v.use = (e.target as HTMLInputElement).checked;
                        state.unused = v.use ? state.unused.filter((k) => k !== v.key) : [...state.unused, v.key!];
                        results();
                      },
                    })
                  : null,
              ),
              h("td", {}, input(v, "label", "Name", i)),
              h("td", {}, input(v, "est", "Estimate", i), v.kind ? h("span", { className: "tag" }, SHORT[v.kind]) : null),
              h("td", {}, input(v, "lo", "Lower limit", i)),
              h("td", {}, input(v, "hi", "Upper limit", i)),
              h("td", { className: "meta-source small muted" }, v.key ? v.source : "typed in by hand"),
              h(
                "td",
                {},
                v.key
                  ? v.edited
                    ? h("button", { type: "button", className: "icon-btn", title: "Back to the value found in the abstract", "aria-label": `Reset study ${i + 1}`, onclick: () => (delete state.overrides[v.key!], renderTable(), results()) }, "↺")
                    : null
                  : h(
                      "button",
                      {
                        type: "button",
                        className: "icon-btn",
                        "aria-label": `Remove study ${i + 1}`,
                        onclick: () => {
                          state.rows = state.rows.filter((r) => r !== v.manual);
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

  // Follows the active reading list; each list has its own meta-analysis.
  function sync() {
    const id = activeList().id;
    if (id !== listId) {
      persist();
      listId = id;
      state = load(listId);
      measureHost.replaceChildren(typeSelect(), measureSelect());
      autoBox.checked = state.auto;
    }
    renderTable();
    results();
  }

  const pasteBox = h("textarea", { rows: 4, "aria-label": "Rows to paste", placeholder: "One study per line: name, estimate, lower, upper\nSmith 2020; 0.80; 0.62; 1.03" });
  const typeSelect = () =>
    selectField("Type of result", state.scale, [["ratio", "Ratio (OR, RR, HR)"], ["difference", "Difference (mean difference, risk difference)"]], (v) => {
      state.scale = v;
      state.measure = MEASURES[v][0];
      measureHost.replaceChildren(typeSelect(), measureSelect());
      renderTable();
      results();
    });
  const measureSelect = () => selectField("Measure", state.measure, MEASURES[state.scale].map((m) => [m, m] as [string, string]), (v) => ((state.measure = v), renderTable(), results()));
  const measureHost = h("div", { className: "matrix-toolbar" }, typeSelect(), measureSelect());

  const autoBox = h("input", {
    type: "checkbox",
    checked: state.auto,
    onchange: (e: Event) => {
      state.auto = (e.target as HTMLInputElement).checked;
      renderTable();
      results();
    },
  });

  const section = h(
    "div",
    { className: "tab-body" },
    h(
      "section",
      { className: "card" },
      h("div", { className: "card-head" }, heading),
      note("Combine results of several studies. Studies come from your reading list: effect sizes with their 95% confidence intervals are read from the abstracts. Anything the abstract doesn't give, or gives differently from the paper's main result, you can type in."),
      h("label", { className: "field inline" }, autoBox, "Take studies from my reading list automatically"),
      measureHost,
      infoHost,
      tableHost,
      h(
        "div",
        { className: "matrix-toolbar" },
        h("button", { type: "button", onclick: () => (state.rows.push(blank()), renderTable(), results()) }, "Add study by hand"),
        h(
          "button",
          { type: "button", className: "link", onclick: () => ((state.rows = [blank()]), (state.overrides = {}), (state.unused = []), msg.replaceChildren(), renderTable(), results()) },
          "Reset everything",
        ),
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

  onReadingListChange(sync);
  sync();
  return Object.assign(section, { refresh: sync });
}
