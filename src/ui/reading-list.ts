// Reading list: starred papers with personal notes, saved in this browser.

import { h, replace } from "./dom";
import { articleCard } from "./articles";
import { exportMenu } from "./export-menu";
import { activeList, copyToList, createList, deleteList, onReadingListChange, readingList, readingLists, removeSaved, renameList, setNote } from "../search/store";
import { articleKey } from "../pubmed";

export function readingListDialog(): HTMLDialogElement {
  const dialog = h("dialog", { className: "reading", "aria-labelledby": "reading-title" });

  function render() {
    const list = readingList();
    const current = activeList();
    const others = readingLists().filter((l) => l.id !== current.id);
    const listSelect = (label: string, move: boolean, key: string) =>
      others.length
        ? h(
            "select",
            {
              className: "small-select",
              "aria-label": `${label} for ${key}`,
              onchange: (e: Event) => {
                const sel = e.target as HTMLSelectElement;
                if (sel.value) copyToList(key, sel.value, move);
                sel.value = "";
              },
            },
            h("option", { value: "" }, label),
            ...others.map((l) => h("option", { value: l.id }, l.name)),
          )
        : null;
    replace(
      dialog,
      h(
        "div",
        { className: "card-head" },
        h("h2", { id: "reading-title" }, `${current.name} (${list.length})`),
        h("button", { type: "button", onclick: () => dialog.close() }, "Close"),
      ),
      h(
        "div",
        { className: "matrix-toolbar" },
        h("button", { type: "button", className: "small-btn", onclick: () => { const n = window.prompt("Name of the new list (for example: Heart failure, Thesis chapter 2)"); if (n?.trim()) createList(n); } }, "New list"),
        h("button", { type: "button", className: "small-btn", onclick: () => { const n = window.prompt("New name for this list", current.name); if (n?.trim()) renameList(current.id, n); } }, "Rename list"),
        readingLists().length > 1 &&
          h(
            "button",
            {
              type: "button",
              className: "small-btn",
              onclick: () => {
                if (window.confirm(`Delete the list “${current.name}” with its ${list.length} paper${list.length === 1 ? "" : "s"}, notes and matrix? This can't be undone.`)) deleteList(current.id);
              },
            },
            "Delete list",
          ),
      ),
      h("p", { className: "muted small" }, "Each list has its own papers, notes, matrix and meta-analysis. Saved in this browser only. Export to keep a copy or move it to another device."),
      list.length > 0 && exportMenu({ label: "Export all", articles: () => readingList().map((p) => p.article), filename: "reading-list" }),
      list.length
        ? h(
            "div",
            { className: "papers" },
            ...list.map((p) =>
              h(
                "div",
                { className: "saved" },
                articleCard(p.article, [], {
                  starred: true,
                  onStar: () => {
                    removeSaved(articleKey(p.article));
                    render();
                  },
                }),
                h(
                  "label",
                  { className: "field" },
                  `Your note (saved ${new Date(p.addedAt).toLocaleDateString()})`,
                  h("textarea", {
                    rows: 2,
                    value: p.note,
                    placeholder: "e.g. relevant for the discussion section",
                    oninput: (e: Event) => setNote(articleKey(p.article), (e.target as HTMLTextAreaElement).value),
                  }),
                ),
                others.length > 0 && h("div", { className: "matrix-toolbar" }, listSelect("Copy to…", false, articleKey(p.article)), listSelect("Move to…", true, articleKey(p.article))),
              ),
            ),
          )
        : h("p", { className: "muted" }, "No papers yet. Use the ☆ on a paper to add it here."),
    );
  }

  // Keep an open dialog in step with list changes (switching, copying, renaming).
  onReadingListChange(() => {
    if (dialog.open) render();
  });

  const show = dialog.showModal.bind(dialog);
  dialog.showModal = () => {
    render();
    show();
  };
  return dialog;
}
