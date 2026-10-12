// "Find a reference": one dialog used by the editor (to cite) and the matrix
// (to add papers). Sources: the reading list, a PubMed search, an OpenAlex
// search, or a pasted DOI / PMID.

import { h, replace } from "./dom";
import { showError } from "./status";
import { articleKey, fetchArticles, searchPubMed, type Article } from "../pubmed";
import { evidenceLevel } from "../search/evidence";
import { translateQuery } from "../search/query";
import { lookupIdentifier, searchOpenAlex } from "../search/sources";
import { addSaved, isSaved, readingList } from "../search/store";

type Tab = "reading" | "pubmed" | "openalex" | "id";

export interface FinderRequest {
  title: string;
  confirmLabel: (n: number) => string;
  // When true the picked papers are always saved to the reading list.
  alwaysSave?: boolean;
  apiKey: () => string | null;
  onPick: (articles: Article[]) => void;
}

export interface Finder {
  element: HTMLDialogElement;
  open(request: FinderRequest): void;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "reading", label: "Reading list" },
  { id: "pubmed", label: "PubMed" },
  { id: "openalex", label: "OpenAlex" },
  { id: "id", label: "DOI / PMID" },
];

export function referenceFinder(): Finder {
  const dialog = h("dialog", { className: "finder", "aria-labelledby": "finder-title" });
  let request: FinderRequest | null = null;
  let tab: Tab = "reading";
  let selected = new Map<string, Article>();
  // Results per tab, so switching tabs keeps what was found.
  const results: Record<Tab, Article[]> = { reading: [], pubmed: [], openalex: [], id: [] };
  let readingFilter = "";
  let saveToList = true;

  function render() {
    if (!request) return;
    const req = request;
    const status = h("p", { className: "status", role: "status" });

    const run = async (fn: () => Promise<Article[]>) => {
      status.textContent = "Searching…";
      try {
        results[tab] = await fn();
        status.textContent = results[tab].length ? "" : "No results.";
        renderList();
      } catch (err) {
        showError(status, err);
      }
    };

    const searchBox = (placeholder: string, label: string, go: (q: string) => Promise<Article[]>) => {
      const input = h("input", { type: "search", placeholder, "aria-label": label });
      return h(
        "form",
        {
          className: "finder-search",
          onsubmit: (e: Event) => {
            e.preventDefault();
            const q = input.value.trim();
            if (q) void run(() => go(q));
          },
        },
        input,
        h("button", { type: "submit", className: "primary" }, "Search"),
      );
    };

    let controls: HTMLElement;
    if (tab === "reading") {
      controls = h("input", {
        type: "search",
        placeholder: "Filter your reading list by title, author or year",
        "aria-label": "Filter reading list",
        value: readingFilter,
        oninput: (e: Event) => {
          readingFilter = (e.target as HTMLInputElement).value;
          renderList();
        },
      });
    } else if (tab === "pubmed") {
      controls = searchBox("Search PubMed (Romanian terms are translated)", "Search PubMed", async (q) => {
        const found = await searchPubMed(translateQuery(q).text, { retmax: 20, apiKey: req.apiKey() });
        return found.ids.length ? fetchArticles(found.ids, { apiKey: req.apiKey() }) : [];
      });
    } else if (tab === "openalex") {
      controls = searchBox("Search OpenAlex (journals, preprints, books)", "Search OpenAlex", (q) => searchOpenAlex(q, { limit: 20 }));
    } else {
      const input = h("input", { type: "text", placeholder: "Paste a DOI (10.1000/xyz) or a PubMed ID", "aria-label": "DOI or PMID" });
      controls = h(
        "form",
        {
          className: "finder-search",
          onsubmit: (e: Event) => {
            e.preventDefault();
            if (input.value.trim()) void run(async () => [await lookupIdentifier(input.value, { apiKey: req.apiKey() })]);
          },
        },
        input,
        h("button", { type: "submit", className: "primary" }, "Look up"),
      );
    }

    const list = h("div", { className: "finder-list" });
    const confirmBtn = h("button", { type: "button", className: "primary" });
    const count = h("span", { className: "muted small" });

    function updateFooter() {
      confirmBtn.disabled = selected.size === 0;
      confirmBtn.textContent = req.confirmLabel(selected.size);
      count.textContent = selected.size ? `${selected.size} selected` : "Tick the papers you want";
    }

    function visibleResults(): Article[] {
      if (tab !== "reading") return results[tab];
      const q = readingFilter.trim().toLowerCase();
      return readingList()
        .map((p) => p.article)
        .filter((a) => !q || `${a.title} ${a.authors.join(" ")} ${a.year} ${a.journal}`.toLowerCase().includes(q));
    }

    function renderList() {
      const items = visibleResults();
      replace(
        list,
        ...(items.length
          ? items.map((a) => {
              const key = articleKey(a);
              const level = evidenceLevel(a.pubTypes);
              return h(
                "label",
                { className: "finder-item" },
                h("input", {
                  type: "checkbox",
                  checked: selected.has(key),
                  "aria-label": a.title,
                  onchange: (e: Event) => {
                    if ((e.target as HTMLInputElement).checked) selected.set(key, a);
                    else selected.delete(key);
                    updateFooter();
                  },
                }),
                h(
                  "span",
                  { className: "finder-text" },
                  h("strong", {}, a.title.replace(/\.$/, "")),
                  h(
                    "span",
                    { className: "muted small" },
                    [a.authors.slice(0, 3).join(", ") + (a.authors.length > 3 ? ", …" : ""), a.journal, a.year].filter(Boolean).join(" · "),
                  ),
                  h(
                    "span",
                    { className: "finder-tags" },
                    h("span", { className: `level level-${level.rank}` }, level.label),
                    a.pmid ? h("span", { className: "tag" }, `PMID ${a.pmid}`) : a.doi ? h("span", { className: "tag" }, `DOI ${a.doi}`) : null,
                    tab !== "reading" && isSaved(key) && h("span", { className: "tag" }, "In reading list"),
                    a.retracted && h("span", { className: "tag danger" }, "Retracted"),
                  ),
                ),
              );
            })
          : [
              h(
                "p",
                { className: "muted" },
                tab === "reading"
                  ? readingList().length
                    ? "No saved paper matches the filter."
                    : "Your reading list is empty. Star papers in the Search tab, or find one with the other tabs here."
                  : "Search above to see papers.",
              ),
            ]),
      );
    }

    confirmBtn.addEventListener("click", () => {
      const picked = [...selected.values()];
      if (!picked.length) return;
      if (req.alwaysSave || saveToList) for (const a of picked) addSaved(a);
      const done = req.onPick;
      dialog.close();
      done(picked);
    });

    replace(
      dialog,
      h(
        "div",
        { className: "card-head" },
        h("h2", { id: "finder-title" }, req.title),
        h("button", { type: "button", onclick: () => dialog.close() }, "Close"),
      ),
      h(
        "div",
        { className: "finder-tabs", role: "tablist" },
        ...TABS.map((t) =>
          h(
            "button",
            {
              type: "button",
              role: "tab",
              "aria-selected": tab === t.id ? "true" : "false",
              onclick: () => {
                tab = t.id;
                render();
              },
            },
            t.label,
          ),
        ),
      ),
      controls,
      status,
      list,
      h(
        "div",
        { className: "finder-footer" },
        !req.alwaysSave &&
          h(
            "label",
            { className: "check" },
            h("input", {
              type: "checkbox",
              checked: saveToList,
              onchange: (e: Event) => (saveToList = (e.target as HTMLInputElement).checked),
            }),
            "Also save to my reading list",
          ),
        count,
        confirmBtn,
      ),
    );
    renderList();
    updateFooter();
  }

  return {
    element: dialog,
    open(req) {
      request = req;
      selected = new Map();
      tab = readingList().length ? "reading" : "pubmed";
      readingFilter = "";
      saveToList = true;
      results.pubmed = results.openalex = results.id = [];
      render();
      dialog.showModal();
    },
  };
}
