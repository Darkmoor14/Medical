// The Matrix tab: papers from the reading list as rows, with columns you
// define, an include/exclude decision per paper, and export.

import { h, replace } from "./dom";
import { downloadBlob, downloadText } from "./download";
import type { Finder } from "./finder";
import { articleKey, pubmedUrl, type Article } from "../pubmed";
import { paperUrl } from "../search/citations";
import { evidenceLevel } from "../search/evidence";
import { onReadingListChange, readingList, removeSaved } from "../search/store";
import {
  applySuggestions,
  DECISION_LABEL,
  decisionCounts,
  loadMatrix,
  matrixCsv,
  matrixDocx,
  matrixRows,
  matrixTsv,
  newColumnId,
  saveMatrix,
  studyLabel,
  type Decision,
  type DecisionFilter,
  type SortBy,
} from "../write/matrix";

export function matrixTab(deps: { finder: Finder; apiKey: () => string | null }): HTMLElement {
  const data = loadMatrix();
  let sort: SortBy = "added";
  let filter: DecisionFilter = "all";

  const persist = () => {
    const ok = saveMatrix(data);
    status.textContent = ok ? "" : "Could not save: the browser's storage is full. Export your matrix now.";
  };
  const status = h("p", { className: "status", role: "status" });
  const tableHost = h("div", { className: "matrix-scroll" });
  const summary = h("p", { className: "muted small", role: "status" });

  const papers = (): Article[] => readingList().map((p) => p.article);

  function render() {
    const all = papers();
    const rows = matrixRows(all, data, sort, filter);
    const counts = decisionCounts(all, data);
    summary.textContent = all.length
      ? `${all.length} paper${all.length === 1 ? "" : "s"} · ${counts.include} included · ${counts.exclude} excluded · ${counts.unsure} unsure · ${counts[""]} undecided` +
        (rows.length !== all.length ? ` · showing ${rows.length}` : "")
      : "";

    if (!all.length) {
      replace(
        tableHost,
        h(
          "p",
          { className: "muted empty" },
          "No papers yet. Star papers in the Search tab (☆), or use “Add papers” to find them here. They appear as rows you can fill in.",
        ),
      );
      return;
    }

    replace(
      tableHost,
      h(
        "table",
        { className: "matrix" },
        h(
          "thead",
          {},
          h(
            "tr",
            {},
            h("th", { className: "sticky-col", scope: "col" }, "Study"),
            h("th", { scope: "col" }, "Decision"),
            ...data.columns.map((c) =>
              h(
                "th",
                { scope: "col" },
                h(
                  "div",
                  { className: "col-head" },
                  h("input", {
                    type: "text",
                    value: c.label,
                    "aria-label": `Name of column ${c.label}`,
                    onchange: (e: Event) => {
                      c.label = (e.target as HTMLInputElement).value.trim() || c.label;
                      persist();
                      render();
                    },
                  }),
                  h(
                    "button",
                    {
                      type: "button",
                      className: "icon-btn",
                      title: `Remove the “${c.label}” column`,
                      "aria-label": `Remove column ${c.label}`,
                      onclick: () => {
                        const used = Object.values(data.cells).some((row) => row[c.id]?.trim());
                        if (used && !window.confirm(`Remove the “${c.label}” column and everything you wrote in it?`)) return;
                        data.columns = data.columns.filter((x) => x.id !== c.id);
                        for (const row of Object.values(data.cells)) delete row[c.id];
                        persist();
                        render();
                      },
                    },
                    "✕",
                  ),
                ),
              ),
            ),
          ),
        ),
        h(
          "tbody",
          {},
          ...rows.map((a) => {
            const key = articleKey(a);
            const decision = data.decisions[key] ?? "";
            const level = evidenceLevel(a.pubTypes);
            const study = studyLabel(a);
            return h(
              "tr",
              { className: decision ? `decision-${decision}` : "", "data-key": key },
              h(
                "th",
                { className: "sticky-col study", scope: "row" },
                h("strong", {}, study),
                h(
                  "a",
                  { href: a.pmid ? pubmedUrl(a.pmid) : paperUrl(a) || null, target: "_blank", rel: "noopener noreferrer", className: "study-title" },
                  a.title.replace(/\.$/, ""),
                ),
                h("span", { className: "muted small" }, [a.journal, a.pmid ? `PMID ${a.pmid}` : ""].filter(Boolean).join(" · ")),
                h(
                  "span",
                  { className: "finder-tags" },
                  h("span", { className: `level level-${level.rank}` }, level.label),
                  a.retracted && h("span", { className: "tag danger" }, "Retracted"),
                ),
                h(
                  "button",
                  {
                    type: "button",
                    className: "link small",
                    onclick: () => {
                      if (window.confirm(`Remove “${a.title.replace(/\.$/, "")}” from your reading list and this matrix?`)) removeSaved(key);
                    },
                  },
                  "Remove",
                ),
              ),
              h(
                "td",
                {},
                h(
                  "select",
                  {
                    "aria-label": `Decision for ${study}`,
                    onchange: (e: Event) => {
                      const v = (e.target as HTMLSelectElement).value as Decision;
                      if (v) data.decisions[key] = v;
                      else delete data.decisions[key];
                      persist();
                      render();
                    },
                  },
                  ...(Object.keys(DECISION_LABEL) as Decision[]).map((d) => h("option", { value: d, selected: d === decision }, DECISION_LABEL[d])),
                ),
              ),
              ...data.columns.map((c) =>
                h(
                  "td",
                  {},
                  h("textarea", {
                    rows: 3,
                    value: data.cells[key]?.[c.id] ?? "",
                    "aria-label": `${c.label} for ${study}`,
                    oninput: (e: Event) => {
                      (data.cells[key] ??= {})[c.id] = (e.target as HTMLTextAreaElement).value;
                      persist();
                    },
                  }),
                ),
              ),
            );
          }),
        ),
      ),
    );
  }

  const select = <T extends string>(label: string, value: T, options: [T, string][], on: (v: T) => void) =>
    h(
      "label",
      { className: "field inline" },
      label,
      h(
        "select",
        { "aria-label": label, onchange: (e: Event) => on((e.target as HTMLSelectElement).value as T) },
        ...options.map(([v, l]) => h("option", { value: v, selected: v === value }, l)),
      ),
    );

  const copyStatus = h("span", { className: "muted small", role: "status" });
  const exportBtn = (label: string, title: string, run: () => void | Promise<void>) =>
    h(
      "button",
      {
        type: "button",
        className: "small-btn",
        title,
        onclick: async () => {
          const rows = matrixRows(papers(), data, sort, filter);
          if (!rows.length) {
            copyStatus.textContent = "Nothing to export.";
            return;
          }
          copyStatus.textContent = "";
          try {
            await run();
          } catch (err) {
            copyStatus.textContent = `Export failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        },
      },
      label,
    );
  const exportRows = () => matrixRows(papers(), data, sort, filter);

  const root = h(
    "div",
    { className: "tab-body matrix-tab" },
    h(
      "section",
      { className: "card" },
      h("div", { className: "card-head" }, h("h2", {}, "Literature matrix")),
      h(
        "p",
        { className: "muted small" },
        "Rows are the papers in your reading list. Fill in what you extract from each paper, decide whether to include it, and export the table. Saved in this browser only.",
      ),
      h(
        "div",
        { className: "matrix-toolbar" },
        h(
          "button",
          {
            type: "button",
            className: "primary",
            onclick: () =>
              deps.finder.open({
                title: "Add papers to the matrix",
                confirmLabel: (n) => (n ? `Add ${n} paper${n === 1 ? "" : "s"}` : "Add"),
                alwaysSave: true,
                apiKey: deps.apiKey,
                onPick: () => {},
              }),
          },
          "Add papers",
        ),
        h(
          "button",
          {
            type: "button",
            onclick: () => {
              const label = window.prompt("Name of the new column (for example: Funding, Follow-up, Setting)");
              if (!label?.trim()) return;
              data.columns.push({ id: newColumnId(data, label), label: label.trim() });
              persist();
              render();
            },
          },
          "Add column",
        ),
        h(
          "button",
          {
            type: "button",
            title: "Fills empty Study design and Sample size cells from each abstract. Check them: they are guesses.",
            onclick: () => {
              const n = applySuggestions(data, papers());
              persist();
              render();
              copyStatus.textContent = n ? `Filled ${n} cell${n === 1 ? "" : "s"} from the abstracts. Please check them.` : "Nothing to suggest.";
            },
          },
          "Suggest design and size",
        ),
        select<SortBy>("Sort", sort, [["added", "Recently saved first"], ["year-desc", "Newest first"], ["year-asc", "Oldest first"], ["author", "First author"], ["decision", "Decision"], ["evidence", "Strongest evidence"]], (v) => {
          sort = v;
          render();
        }),
        select<DecisionFilter>("Show", filter, [["all", "All papers"], ["include", "Included"], ["exclude", "Excluded"], ["unsure", "Unsure"], ["none", "Undecided"]], (v) => {
          filter = v;
          render();
        }),
      ),
      status,
      summary,
      tableHost,
      h(
        "div",
        { className: "export-menu", role: "group", "aria-label": "Export matrix" },
        h("span", { className: "muted small" }, "Export: "),
        exportBtn("CSV", "Opens in Excel", () => downloadText("literature-matrix.csv", matrixCsv(exportRows(), data), "text/csv;charset=utf-8")),
        exportBtn("Word table", "A landscape table in a .docx file", async () => downloadBlob("literature-matrix.docx", await (await import("docx")).Packer.toBlob(await matrixDocx(exportRows(), data)))),
        exportBtn("Copy for Excel", "Copies a tab-separated table to paste into Excel or Sheets", async () => {
          await navigator.clipboard.writeText(matrixTsv(exportRows(), data));
          copyStatus.textContent = "Copied. Paste it into Excel or Google Sheets.";
        }),
        copyStatus,
      ),
    ),
  );

  onReadingListChange(render);
  render();
  return root;
}
