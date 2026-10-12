// Stats tab, section 2: a dashboard of the reading list and literature matrix.

import { h, replace } from "./dom";
import { articleKey } from "../pubmed";
import { barList, columnChart } from "./charts";
import { downloadText } from "./download";
import { note } from "./stats-ui";
import { activeList, onReadingListChange, readingList } from "../search/store";
import { loadMatrix } from "../write/matrix";
import { overview, type Overview } from "../stats/overview";

const tile = (value: string | number, label: string) => h("div", { className: "stat-tile" }, h("strong", {}, String(value)), h("span", {}, label));

function overviewCsv(o: Overview): string {
  const section = (name: string, rows: { label: string; count: number }[]) => rows.map((r) => `${name},"${r.label.replace(/"/g, '""')}",${r.count}`);
  return ["group,label,papers", ...section("Year", o.years), ...section("Evidence", o.evidence), ...section("Design", o.designs), ...section("Journal", o.journals), ...section("First author", o.authors), ...section("Decision", o.decisions)].join("\n");
}

export function readingListOverview(): HTMLElement & { refresh: () => void } {
  const host = h("div", { className: "tab-body" });
  const render = () => {
    const list = readingList();
    if (!list.length) {
      replace(host, h("section", { className: "card" }, h("p", { className: "muted empty" }, "Your reading list is empty. Star papers in the Search tab, then come back for a summary of what you have collected.")));
      return;
    }
    const o = overview(
      list.map((p) => p.article),
      loadMatrix(activeList().id),
      Object.fromEntries(list.map((p) => [articleKey(p.article), p.note])),
    );
    replace(
      host,
      h(
        "section",
        { className: "card" },
        h("div", { className: "card-head" }, h("h2", {}, `${activeList().name}: at a glance`), h("button", { type: "button", className: "small-btn", onclick: () => downloadText("reading-list-summary.csv", overviewCsv(o), "text/csv;charset=utf-8") }, "Download CSV")),
        h(
          "div",
          { className: "stat-tiles" },
          tile(o.total, "papers"),
          tile(o.medianYear ?? "–", "median year"),
          tile(`${o.withAbstract}/${o.total}`, "with an abstract"),
          tile(o.medianSample != null ? o.medianSample.toLocaleString() : "–", `median sample size (${o.sampleSizes.length} papers state one)`),
          tile(o.withNotes, "with your notes"),
          tile(o.retracted, "retracted"),
        ),
        o.retracted > 0 ? h("p", { className: "stat-warn" }, `${o.retracted} paper${o.retracted === 1 ? " is" : "s are"} marked as retracted. Don't cite ${o.retracted === 1 ? "it" : "them"} as evidence.`) : null,
      ),
      h(
        "section",
        { className: "card" },
        h("div", { className: "charts-grid" }, o.years.length ? columnChart({ title: "Papers per year", data: o.years, unit: "papers", tableCaption: "Papers per year" }) : null, barList({ title: "Strength of evidence", data: o.evidence, unit: "papers", tableCaption: "Papers per evidence level" }), barList({ title: "Study design", data: o.designs, unit: "papers", tableCaption: "Papers per study design" })),
      ),
      h(
        "section",
        { className: "card" },
        h("div", { className: "charts-grid" }, barList({ title: "Top journals", data: o.journals, unit: "papers", tableCaption: "Papers per journal" }), barList({ title: "Most frequent first authors", data: o.authors, unit: "papers", tableCaption: "Papers per first author" }), o.decisions.length ? barList({ title: "Screening decisions (Matrix tab)", data: o.decisions, unit: "papers", tableCaption: "Papers per decision" }) : null),
        note("Study design comes from your Matrix column when filled in, otherwise from the abstract and publication type (a guess)."),
      ),
    );
  };
  onReadingListChange(render);
  render();
  // The matrix can change without the reading list changing, so the tab refreshes on show.
  return Object.assign(host, { refresh: render });
}
