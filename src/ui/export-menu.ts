// Export buttons shared by the results list and the reading list.

import { h } from "./dom";
import { downloadText } from "./terms-panel";
import { referenceList, toBibtex, toCsv, toRis } from "../search/citations";
import type { Article } from "../pubmed";

export function exportMenu(opts: { label: string; articles: () => Article[]; filename: string }): HTMLElement {
  const status = h("span", { className: "muted small", role: "status" });
  const guard = (fn: (list: Article[]) => void) => () => {
    const list = opts.articles();
    if (!list.length) {
      status.textContent = "Nothing to export.";
      return;
    }
    fn(list);
  };
  const copy = (style: "vancouver" | "apa") =>
    guard((list) =>
      navigator.clipboard?.writeText(referenceList(list, style)).then(
        () => (status.textContent = `Copied ${list.length} reference${list.length === 1 ? "" : "s"} (${style === "apa" ? "APA" : "Vancouver"}).`),
        () => (status.textContent = "Copy failed. Your browser blocked clipboard access."),
      ),
    );
  return h(
    "div",
    { className: "export-menu", role: "group", "aria-label": opts.label },
    h("span", { className: "muted small" }, `${opts.label}: `),
    h(
      "button",
      {
        type: "button",
        className: "small-btn",
        title: "For Zotero, EndNote, Mendeley",
        onclick: guard((l) => downloadText(`${opts.filename}.ris`, toRis(l), "application/x-research-info-systems")),
      },
      "RIS",
    ),
    h("button", { type: "button", className: "small-btn", onclick: guard((l) => downloadText(`${opts.filename}.bib`, toBibtex(l), "application/x-bibtex")) }, "BibTeX"),
    h("button", { type: "button", className: "small-btn", onclick: guard((l) => downloadText(`${opts.filename}.csv`, toCsv(l), "text/csv")) }, "CSV"),
    h("button", { type: "button", className: "small-btn", onclick: copy("vancouver") }, "Copy Vancouver"),
    h("button", { type: "button", className: "small-btn", onclick: copy("apa") }, "Copy APA"),
    status,
  );
}
