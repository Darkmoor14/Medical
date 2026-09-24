// Reading list: starred papers with personal notes, saved in this browser.

import { h, replace } from "./dom";
import { articleCard } from "./articles";
import { exportMenu } from "./export-menu";
import { readingList, removeSaved, setNote } from "../search/store";

export function readingListDialog(): HTMLDialogElement {
  const dialog = h("dialog", { className: "reading", "aria-labelledby": "reading-title" });

  function render() {
    const list = readingList();
    replace(
      dialog,
      h(
        "div",
        { className: "card-head" },
        h("h2", { id: "reading-title" }, `Reading list (${list.length})`),
        h("button", { type: "button", onclick: () => dialog.close() }, "Close"),
      ),
      h("p", { className: "muted small" }, "Saved in this browser only. Export to keep a copy or move it to another device."),
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
                    removeSaved(p.article.pmid);
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
                    oninput: (e: Event) => setNote(p.article.pmid, (e.target as HTMLTextAreaElement).value),
                  }),
                ),
              ),
            ),
          )
        : h("p", { className: "muted" }, "No papers yet. Use the ☆ on a paper to add it here."),
    );
  }

  const show = dialog.showModal.bind(dialog);
  dialog.showModal = () => {
    render();
    show();
  };
  return dialog;
}
