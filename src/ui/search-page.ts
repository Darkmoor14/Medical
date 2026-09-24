// The app: search PubMed, show papers immediately, then analyse the
// abstracts on this device in the background and chart what they mention.

import { h, replace } from "./dom";
import { articleCard, articleText } from "./articles";
import { progressText, showError } from "./status";
import { searchForm } from "./search-form";
import { downloadText, termsCsv, termsPanel } from "./terms-panel";
import type { Engine } from "../engine";
import { tallyByDocument, toEntities, type Entity, type TermStat } from "../entities";
import {
  citationMetrics,
  fetchArticles,
  linkedArticles,
  pubmedSearchUrl,
  searchPubMed,
  spellCheck,
  type Article,
  type LinkKind,
  type Metrics,
} from "../pubmed";
import { evidenceLevel, evidenceMix, orderArticles, type ResultOrder } from "../search/evidence";
import { CATEGORY_LABEL, CATEGORY_ORDER, type Category } from "../models";
import { buildFullQuery } from "../search/query";
import { decodeState, encodeState, type SearchState } from "../search/url-state";
import { nerModels, type Settings } from "../settings";
import { findSignsAndSymptoms } from "../findings";
import { cooccurring } from "../search/trends";
import { trendsCard } from "./trends-card";
import { abbreviationMap, canonicalizer } from "../search/synonyms";

interface Results {
  state: SearchState;
  fullQuery: string;
  total: number;
  translation: string;
  articles: Article[];
  entities: Map<string, Entity[]> | null;
  stats: TermStat[] | null;
  filter: TermStat | null;
  metrics: Map<string, Metrics>;
  evidence: string | null;
  // Set when showing articles similar to / citing one paper.
  linked: { kind: LinkKind; from: Article; previous: Results } | null;
}

export function searchPage(engine: Engine, getSettings: () => Settings): HTMLElement {
  let results: Results | null = null;
  let runId = 0;
  let order: ResultOrder = "pubmed";
  const hiddenCats = new Set<Category>();

  const status = h("p", { className: "status", role: "status" });
  const summary = h("div", { className: "summary" });
  const termsCard = h("section", { className: "card", hidden: true });
  const papersCard = h("section", { className: "card", hidden: true });
  const trendsSlot = h("div", {});
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
    replace(trendsSlot);
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
        metrics: new Map(),
        evidence: null,
        linked: null,
      };
      status.textContent = "";
      renderPapers();
      renderTrends();
      void loadMetrics(id);
      void analyse(id);
    } catch (err) {
      if (!stale()) showError(status, err);
    }
  }

  async function loadMetrics(id: number) {
    const r = results;
    if (!r) return;
    const metrics = await citationMetrics(r.articles.map((a) => a.pmid));
    if (id !== runId || results !== r || !metrics.size) return;
    r.metrics = metrics;
    renderPapers();
  }

  // Similar articles / cited by: a new result set that can go back.
  async function runLinked(from: Article, kind: LinkKind) {
    const previous = results;
    if (!previous) return;
    const id = ++runId;
    status.textContent = kind === "similar" ? "Finding similar articles…" : "Finding articles that cite this one…";
    try {
      const ids = await linkedArticles(from.pmid, kind, { apiKey: apiKey(), limit: previous.state.count });
      if (id !== runId) return;
      if (!ids.length) {
        status.textContent =
          kind === "similar" ? "PubMed lists no similar articles for this paper." : "No citing articles found in PubMed Central for this paper.";
        return;
      }
      const articles = await fetchArticles(ids, { apiKey: apiKey() });
      if (id !== runId) return;
      results = {
        ...previous,
        total: ids.length,
        articles,
        entities: null,
        stats: null,
        filter: null,
        metrics: new Map(),
        evidence: null,
        linked: { kind, from, previous: previous.linked ? previous.linked.previous : previous },
      };
      status.textContent = "";
      renderPapers();
      renderTrends();
      papersCard.scrollIntoView({ behavior: "smooth", block: "start" });
      void loadMetrics(id);
      void analyse(id);
    } catch (err) {
      if (id === runId) showError(status, err);
    }
  }

  function backToSearch() {
    const r = results;
    if (!r?.linked) return;
    runId++;
    results = r.linked.previous;
    renderTerms();
    renderPapers();
    renderTrends();
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
      r.stats = tallyByDocument(
        [...r.entities].map(([pmid, entities]) => ({ id: pmid, entities })),
        canonicalizer(abbreviationMap([...texts.values()])),
      );
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

  // Terms that appear in the same papers as the selected one.
  function togetherList(r: Results): HTMLElement | false {
    const pairs = cooccurring(r.stats!, r.filter!);
    if (!pairs.length) return false;
    const n = r.filter!.docs.size;
    return h(
      "div",
      { className: "together" },
      h("h3", {}, `Often mentioned together with “${r.filter!.term}”`),
      h(
        "ol",
        { className: "bars" },
        ...pairs.map(({ stat, shared }) =>
          h(
            "li",
            {},
            h(
              "button",
              {
                type: "button",
                className: "bar-row",
                title: `In ${shared} of the ${n} papers mentioning “${r.filter!.term}”`,
                onclick: () => {
                  r.filter = stat;
                  renderTerms();
                  renderPapers();
                },
              },
              h("span", { className: "bar-label" }, h("span", { className: `dot cat-${stat.category}` }), stat.term),
              h("span", { className: "bar-track" }, h("span", { className: `bar-fill cat-${stat.category}`, style: `width:${((shared / n) * 100).toFixed(1)}%` })),
              h("span", { className: "bar-value" }, `${shared}/${n}`),
            ),
          ),
        ),
      ),
    );
  }

  function renderTrends() {
    const r = results;
    if (!r) return;
    replace(
      trendsSlot,
      trendsCard({
        articles: r.articles,
        fullQuery: r.linked ? null : r.fullQuery,
        total: r.total,
        apiKey,
      }),
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
      r.filter && togetherList(r),
    );
  }

  function renderPapers() {
    const r = results;
    if (!r) return;
    let visible = r.filter ? r.articles.filter((a) => r.filter!.docs.has(a.pmid)) : r.articles;
    if (r.evidence) visible = visible.filter((a) => evidenceLevel(a.pubTypes).key === r.evidence);
    visible = orderArticles(visible, order, r.metrics);
    const title = r.linked
      ? `${r.linked.kind === "similar" ? "Similar to" : "Papers citing"} “${r.linked.from.title}”`
      : r.filter
        ? `Papers mentioning “${r.filter.term}”`
        : "Papers";

    const orderSelect = h(
      "select",
      {
        "aria-label": "Order papers by",
        onchange: (e: Event) => {
          order = (e.target as HTMLSelectElement).value as ResultOrder;
          renderPapers();
        },
      },
      ...(
        [
          ["pubmed", "PubMed order"],
          ["evidence", "Strongest evidence first"],
          ["citations", "Most cited"],
          ["newest", "Newest first"],
        ] as const
      ).map(([v, l]) => h("option", { value: v, selected: order === v, disabled: v === "citations" && !r.metrics.size }, l)),
    );

    const mix = evidenceMix(r.filter ? r.articles.filter((a) => r.filter!.docs.has(a.pmid)) : r.articles);
    const presentCats = CATEGORY_ORDER.filter((c) => [...(r.entities?.values() ?? [])].some((list) => list.some((e) => e.category === c)));
    const papersList = h(
      "div",
      { className: `papers ${[...hiddenCats].map((c) => `hide-cat-${c}`).join(" ")}` },
      ...visible.map((a) =>
        articleCard(a, r.entities?.get(a.pmid) ?? [], {
          metrics: r.metrics.get(a.pmid),
          onLinked: (art, kind) => void runLinked(art, kind),
        }),
      ),
    );

    papersCard.hidden = false;
    replace(
      papersCard,
      h(
        "div",
        { className: "card-head" },
        h("h2", {}, `${title} (${visible.length})`),
        h(
          "div",
          { className: "actions" },
          r.linked && h("button", { type: "button", onclick: backToSearch }, "← Back to search results"),
          r.filter &&
            !r.linked &&
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
          r.filter &&
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
              "Clear term filter",
            ),
          orderSelect,
        ),
      ),
      mix.length > 1 &&
        h(
          "div",
          { className: "evidence-mix", role: "group", "aria-label": "Filter by strength of evidence" },
          h("span", { className: "muted small" }, "Evidence: "),
          ...mix.map(({ level, count }) =>
            h(
              "button",
              {
                type: "button",
                className: `level level-${level.rank}${r.evidence === level.key ? " active" : ""}`,
                "aria-pressed": r.evidence === level.key ? "true" : "false",
                onclick: () => {
                  r.evidence = r.evidence === level.key ? null : level.key;
                  renderPapers();
                },
              },
              `${level.label} ${count}`,
            ),
          ),
        ),
      presentCats.length > 0 &&
        h(
          "div",
          { className: "legend", role: "group", "aria-label": "Highlight categories" },
          h("span", { className: "muted small" }, "Highlights: "),
          ...presentCats.map((c) =>
            h(
              "label",
              { className: `legend-item cat-${c}` },
              h("input", {
                type: "checkbox",
                checked: !hiddenCats.has(c),
                onchange: (e: Event) => {
                  if ((e.target as HTMLInputElement).checked) hiddenCats.delete(c);
                  else hiddenCats.add(c);
                  papersList.classList.toggle(`hide-cat-${c}`, hiddenCats.has(c));
                },
              }),
              h("span", { className: `dot cat-${c}` }),
              CATEGORY_LABEL[c],
            ),
          ),
        ),
      papersList,
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
    trendsSlot,
    papersCard,
  );
}
