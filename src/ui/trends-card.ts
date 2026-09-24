// Trends for the current result set: papers per year (for the papers shown,
// or for every PubMed result on request) and the journals they appear in.

import { h, replace } from "./dom";
import { barList, columnChart } from "./charts";
import { showError } from "./status";
import { countsByYear, type Article } from "../pubmed";
import { journalCounts, yearCounts } from "../search/trends";

export function trendsCard(opts: {
  articles: Article[];
  fullQuery: string | null;
  total: number;
  apiKey: () => string | null;
}): HTMLElement {
  const { articles } = opts;
  const years = yearCounts(articles);
  const yearSlot = h("div", {});
  const status = h("p", { className: "muted small", role: "status" });

  const showShown = () =>
    replace(
      yearSlot,
      columnChart({
        title: `Papers per year (the ${articles.length} shown)`,
        data: years,
        unit: "papers",
        tableCaption: "Papers per year",
      }),
    );

  const allBtn =
    opts.fullQuery && opts.total > articles.length
      ? h(
          "button",
          {
            type: "button",
            className: "small-btn",
            onclick: async () => {
              allBtn!.disabled = true;
              const to = new Date().getFullYear();
              const from = to - 24;
              try {
                const counts = await countsByYear(opts.fullQuery!, from, to, {
                  apiKey: opts.apiKey(),
                  onProgress: (done, total) => (status.textContent = `Counting PubMed records per year… ${done}/${total}`),
                });
                status.textContent = "";
                replace(
                  yearSlot,
                  columnChart({
                    title: `All ${opts.total.toLocaleString()} PubMed results per year (${from}–${to})`,
                    data: counts.map((c) => ({ label: String(c.year), count: c.count })),
                    unit: "records",
                    tableCaption: "Records per year",
                  }),
                );
              } catch (err) {
                showError(status, err);
                allBtn!.disabled = false;
              }
            },
          },
          `Show the trend for all ${opts.total.toLocaleString()} results`,
        )
      : null;

  if (years.length) showShown();
  const journals = journalCounts(articles);

  return h(
    "section",
    { className: "card" },
    h("div", { className: "card-head" }, h("h2", {}, "Trends"), allBtn),
    status,
    h(
      "div",
      { className: "trends-grid" },
      years.length ? yearSlot : h("p", { className: "muted" }, "No publication years available."),
      journals.length > 0 &&
        barList({ title: "Top journals among the papers shown", data: journals, unit: "papers", tableCaption: "Papers per journal" }),
    ),
  );
}
