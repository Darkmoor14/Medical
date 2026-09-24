// The app: search PubMed, show papers immediately, then analyse the
// abstracts on this device in the background and chart what they mention.

import { h, replace } from "./dom";
import { articleCard, articleText } from "./articles";
import { progressText, showError } from "./status";
import { searchForm } from "./search-form";
import { downloadText, termsCsv, termsPanel } from "./terms-panel";
import type { Engine } from "../engine";
import { tallyByDocument, toEntities, type Entity, type TermStat } from "../entities";
import { fetchArticles, pubmedSearchUrl, searchPubMed, spellCheck, type Article } from "../pubmed";
import { buildFullQuery } from "../search/query";
import { decodeState, encodeState, type SearchState } from "../search/url-state";
import { nerModels, type Settings } from "../settings";
import { findSignsAndSymptoms } from "../findings";

interface Results {
  state: SearchState;
  fullQuery: string;
  total: number;
  translation: string;
  articles: Article[];
  entities: Map<string, Entity[]> | null;
  stats: TermStat[] | null;
  filter: TermStat | null;
}

export function searchPage(engine: Engine, getSettings: () => Settings): HTMLElement {
  let results: Results | null = null;
  let runId = 0;

  const status = h("p", { className: "status", role: "status" });
  const summary = h("div", { className: "summary" });
  const termsCard = h("section", { className: "card", hidden: true });
  const papersCard = h("section", { className: "card", hidden: true });
  const apiKey = () => getSettings().apiKey || null;

  const form = searchForm({ onSubmit: (st) => void run(st), apiKey });

  async function run(st: SearchState) {
    const id = ++runId;
    const stale = () => id !== runId;
    try {
      history.replaceState(null, "", encodeState(st));
    } catch {
      // Hash updates can fail in sandboxed previews; the search still runs.
    }
    const fullQuery = buildFullQuery(st.query, st.filters);
    results = null;
    termsCard.hidden = true;
    papersCard.hidden = true;
    replace(summary);
    status.textContent = "Searching PubMed…";
    try {
      const found = await searchPubMed(fullQuery, { retmax: st.count, sort: st.sort, apiKey: apiKey() });
      if (stale()) return;
      renderSummary(st, fullQuery, found.count, found.queryTranslation);
      // Spelling suggestions are fetched alongside and never block results.
      void spellCheck(st.query, { apiKey: apiKey() })
        .then((corrected) => {
          if (!stale() && corrected) showSpelling(st, corrected, found.count);
        })
        .catch(() => {});
      if (!found.ids.length) {
        status.textContent = "No papers matched. Try fewer terms, remove filters, or check the spelling.";
        return;
      }
      status.textContent = `Fetching ${found.ids.length} papers…`;
      const articles = await fetchArticles(found.ids, { apiKey: apiKey() });
      if (stale()) return;
      results = {
        state: st,
        fullQuery,
        total: found.count,
        translation: found.queryTranslation,
        articles,
        entities: null,
        stats: null,
        filter: null,
      };
      status.textContent = "";
      renderPapers();
      void analyse(id);
    } catch (err) {
      if (!stale()) showError(status, err);
    }
  }

  // Term extraction runs after the papers are on screen.
  async function analyse(id: number) {
    const r = results;
    if (!r) return;
    const s = getSettings();
    const models = nerModels(s);
    const progress = h("progress", { max: 100, value: 0 });
    const label = h("p", { className: "muted small", role: "status" }, "Loading models…");
    termsCard.hidden = false;
    replace(termsCard, h("h2", {}, "What these papers talk about"), label, progress);
    const texts = new Map(r.articles.map((a) => [a.pmid, articleText(a)]));
    try {
      const extracted = models.length
        ? await engine.extractMany(
            {
              docs: r.articles.map((a) => ({ id: a.pmid, text: texts.get(a.pmid)! })),
              nerModels: models,
              threshold: s.threshold,
            },
            (p) => {
              label.textContent = progressText(p);
              if (p.stage === "analyze" && !p.model) progress.value = p.progress;
            },
          )
        : r.articles.map((a) => ({ id: a.pmid, spans: [] }));
      if (id !== runId) return;
      r.entities = new Map(
        extracted.map((d) => {
          const text = texts.get(d.id) ?? "";
          const findings = s.findings ? findSignsAndSymptoms(text) : [];
          return [d.id, toEntities(text, [...d.spans, ...findings])];
        }),
      );
      r.stats = tallyByDocument([...r.entities].map(([pmid, entities]) => ({ id: pmid, entities })));
      renderTerms();
      renderPapers();
    } catch (err) {
      if (id !== runId) return;
      replace(termsCard, h("h2", {}, "What these papers talk about"));
      const msg = h("p", { className: "status" });
      showError(msg, err);
      termsCard.append(msg, h("p", { className: "muted small" }, "The papers below are still available."));
    }
  }

  function renderSummary(st: SearchState, fullQuery: string, count: number, translation: string) {
    replace(
      summary,
      h(
        "p",
        { className: "result-count" },
        h("strong", {}, count.toLocaleString()),
        ` result${count === 1 ? "" : "s"} on PubMed`,
        count > st.count ? ` · showing the top ${st.count} (${st.sort === "pub_date" ? "most recent" : "best match"})` : "",
      ),
      h(
        "div",
        { className: "actions" },
        h("a", { className: "button", href: pubmedSearchUrl(fullQuery), target: "_blank", rel: "noopener noreferrer" }, "Open on pubmed.gov"),
        h(
          "button",
          {
            type: "button",
            onclick: (e: Event) => {
              const btn = e.currentTarget as HTMLButtonElement;
              navigator.clipboard?.writeText(location.href).then(
                () => (btn.textContent = "Link copied"),
                () => (btn.textContent = "Copy failed"),
              );
            },
          },
          "Copy link to this search",
        ),
      ),
      h(
        "details",
        { className: "translation" },
        h("summary", {}, "How PubMed read your search"),
        h("code", {}, translation || fullQuery),
      ),
    );
  }

  function showSpelling(st: SearchState, corrected: string, count: number) {
    summary.prepend(
      h(
        "p",
        { className: count ? "notice" : "notice strong" },
        "Did you mean ",
        h(
          "button",
          {
            type: "button",
            className: "link",
            onclick: () => {
              const next = { ...st, query: corrected };
              form.setState(next);
              void run(next);
            },
          },
          corrected,
        ),
        "?",
      ),
    );
  }

  function renderTerms() {
    const r = results;
    if (!r?.stats) return;
    termsCard.hidden = false;
    replace(
      termsCard,
      h(
        "div",
        { className: "card-head" },
        h("h2", {}, "What these papers talk about"),
        h(
          "button",
          { type: "button", onclick: () => downloadText("pubmed-terms.csv", termsCsv(r.stats!, r.articles.length), "text/csv") },
          "Export CSV",
        ),
      ),
      h(
        "p",
        { className: "muted small" },
        `Share of the ${r.articles.length} papers shown that mention each term, found on this device. Click a term to filter the papers.`,
      ),
      termsPanel({
        stats: r.stats,
        total: r.articles.length,
        active: r.filter,
        onSelect: (stat) => {
          r.filter = stat;
          renderTerms();
          renderPapers();
        },
      }),
    );
  }

  function renderPapers() {
    const r = results;
    if (!r) return;
    const visible = r.filter ? r.articles.filter((a) => r.filter!.docs.has(a.pmid)) : r.articles;
    papersCard.hidden = false;
    replace(
      papersCard,
      h(
        "div",
        { className: "card-head" },
        h("h2", {}, r.filter ? `Papers mentioning “${r.filter.term}” (${visible.length})` : `Papers (${r.articles.length})`),
        r.filter &&
          h(
            "div",
            { className: "actions" },
            h(
              "button",
              {
                type: "button",
                onclick: () => {
                  const term = r.filter!.term.replace(/"/g, "");
                  const next = { ...r.state, query: `(${r.state.query}) AND "${term}"[tiab]` };
                  form.setState(next);
                  void run(next);
                },
              },
              "Narrow the search to this term",
            ),
            h(
              "button",
              {
                type: "button",
                onclick: () => {
                  r.filter = null;
                  renderTerms();
                  renderPapers();
                },
              },
              "Clear filter",
            ),
          ),
      ),
      h("div", { className: "papers" }, ...visible.map((a) => articleCard(a, r.entities?.get(a.pmid) ?? []))),
    );
  }

  // Open a shared link or reload: restore and run the search in the URL.
  const initial = decodeState(location.hash);
  if (initial) {
    form.setState(initial);
    queueMicrotask(() => void run(initial));
  }

  return h(
    "div",
    { className: "tab-body" },
    form.element,
    h("div", {}, status, summary),
    termsCard,
    papersCard,
  );
}
