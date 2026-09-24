import { h, replace } from "./dom";
import { articleCard, articleText } from "./articles";
import { progressText, showError } from "./status";
import type { Engine } from "../engine";
import { tallyByDocument, toEntities, normalizeTerm, type Entity, type TermStat } from "../entities";
import { CATEGORY_LABEL, CATEGORY_ORDER, type Category } from "../models";
import { fetchArticles, searchPubMed, type Article, type Sort } from "../pubmed";
import { nerModels, type Settings } from "../settings";
import { findSignsAndSymptoms } from "../findings";

interface MinerState {
  query: string;
  total: number;
  articles: Article[];
  entities: Map<string, Entity[]>;
  stats: TermStat[];
  filter: TermStat | null;
}

const TOP_N = 12;

export function minerTab(engine: Engine, getSettings: () => Settings): HTMLElement {
  let state: MinerState | null = null;

  const queryInput = h("input", {
    type: "search",
    id: "miner-query",
    placeholder: "e.g. empagliflozin chronic kidney disease",
    "aria-label": "PubMed query",
  });
  const countSelect = h(
    "select",
    { "aria-label": "Number of papers" },
    ...[20, 50, 100, 200].map((n) => h("option", { value: n, selected: n === 50 }, `${n} papers`)),
  );
  const sortSelect = h(
    "select",
    { "aria-label": "Sort order" },
    h("option", { value: "relevance" }, "Best match"),
    h("option", { value: "pub_date" }, "Most recent"),
  );
  const runBtn = h("button", { className: "primary", type: "submit" }, "Search & analyze");
  const status = h("p", { className: "status", role: "status" });
  const bar = h("progress", { max: 100, value: 0, hidden: true });
  const results = h("div", { className: "miner-results" });

  const form = h(
    "form",
    {
      className: "miner-form",
      onsubmit: (e: Event) => {
        e.preventDefault();
        run(queryInput.value.trim());
      },
    },
    queryInput,
    countSelect,
    sortSelect,
    runBtn,
  );

  async function run(query: string) {
    if (!query) return;
    queryInput.value = query;
    const s = getSettings();
    const models = nerModels(s);
    if (!models.length) {
      status.textContent = "Turn on at least one detector in Settings.";
      return;
    }
    runBtn.disabled = true;
    replace(results);
    bar.hidden = false;
    bar.value = 0;
    try {
      status.textContent = "Searching PubMed…";
      const found = await searchPubMed(query, {
        retmax: Number(countSelect.value),
        sort: sortSelect.value as Sort,
        apiKey: s.apiKey || null,
      });
      if (!found.ids.length) {
        status.textContent = "No papers matched that query.";
        return;
      }
      status.textContent = `Fetching ${found.ids.length} abstracts…`;
      const articles = await fetchArticles(found.ids, { apiKey: s.apiKey || null });
      status.textContent = "Loading models…";
      const extracted = await engine.extractMany(
        {
          docs: articles.map((a) => ({ id: a.pmid, text: articleText(a) })),
          nerModels: models,
          threshold: s.threshold,
        },
        (p) => {
          status.textContent = progressText(p);
          if (p.stage === "analyze" && !p.model) bar.value = p.progress;
        },
      );
      const textById = new Map(articles.map((a) => [a.pmid, articleText(a)]));
      const entities = new Map(
        extracted.map((d) => {
          const text = textById.get(d.id) ?? "";
          const findings = s.findings ? findSignsAndSymptoms(text) : [];
          return [d.id, toEntities(text, [...d.spans, ...findings])];
        }),
      );
      state = {
        query,
        total: found.count,
        articles,
        entities,
        stats: tallyByDocument([...entities].map(([id, ents]) => ({ id, entities: ents }))),
        filter: null,
      };
      status.textContent = `Analyzed ${articles.length} of ${found.count.toLocaleString()} matching papers on this device.`;
      render();
    } catch (err) {
      showError(status, err);
    } finally {
      runBtn.disabled = false;
      bar.hidden = true;
    }
  }

  function render() {
    if (!state) return;
    const st = state;
    const byCat = new Map<Category, TermStat[]>();
    for (const stat of st.stats) {
      const list = byCat.get(stat.category) ?? [];
      if (list.length < TOP_N) list.push(stat);
      byCat.set(stat.category, list);
    }
    const cats = CATEGORY_ORDER.filter((c) => byCat.has(c));
    const n = st.articles.length;

    const visible = st.filter
      ? st.articles.filter((a) => st.filter!.docs.has(a.pmid))
      : st.articles;

    replace(
      results,
      h(
        "section",
        { className: "card" },
        h(
          "div",
          { className: "card-head" },
          h("h2", {}, "What these papers talk about"),
          h("button", { type: "button", onclick: () => downloadCsv(st) }, "Export CSV"),
        ),
        h("p", { className: "muted small" }, `Share of the ${n} analyzed papers that mention each term. Click a term to filter the papers.`),
        cats.length
          ? h(
              "div",
              { className: "term-columns" },
              ...cats.map((cat) =>
                h(
                  "div",
                  { className: "term-col" },
                  h("h3", {}, h("span", { className: `dot cat-${cat}` }), CATEGORY_LABEL[cat]),
                  h(
                    "ol",
                    { className: "bars" },
                    ...byCat.get(cat)!.map((stat) => {
                      const pct = (stat.docs.size / n) * 100;
                      return h(
                        "li",
                        {},
                        h(
                          "button",
                          {
                            type: "button",
                            className: `bar-row${st.filter?.key === stat.key ? " active" : ""}`,
                            "aria-pressed": st.filter?.key === stat.key ? "true" : "false",
                            onclick: () => {
                              st.filter = st.filter?.key === stat.key ? null : stat;
                              render();
                            },
                          },
                          h("span", { className: "bar-label" }, stat.term),
                          h(
                            "span",
                            { className: "bar-track" },
                            h("span", { className: `bar-fill cat-${cat}`, style: `width:${pct.toFixed(1)}%` }),
                          ),
                          h("span", { className: "bar-value" }, `${stat.docs.size}`),
                        ),
                      );
                    }),
                  ),
                ),
              ),
            )
          : h("p", { className: "muted" }, "No terms detected. Try turning on more detectors or lowering the threshold."),
      ),
      h(
        "section",
        { className: "card" },
        h(
          "div",
          { className: "card-head" },
          h(
            "h2",
            {},
            st.filter ? `Papers mentioning “${st.filter.term}” (${visible.length})` : `Papers (${n})`,
          ),
          st.filter &&
            h(
              "div",
              { className: "actions" },
              h(
                "button",
                {
                  type: "button",
                  onclick: () => {
                    const term = st.filter!.term.replace(/"/g, "");
                    run(`(${st.query}) AND "${term}"[tiab]`);
                  },
                },
                "Search PubMed for this",
              ),
              h(
                "button",
                {
                  type: "button",
                  onclick: () => {
                    st.filter = null;
                    render();
                  },
                },
                "Clear filter",
              ),
            ),
        ),
        h(
          "div",
          { className: "papers" },
          ...visible.map((a) => articleCard(a, st.entities.get(a.pmid) ?? [])),
        ),
      ),
    );
  }

  return h(
    "div",
    { className: "tab-body" },
    h(
      "section",
      { className: "card" },
      h("h2", {}, "Search PubMed, then extract what the papers mention"),
      h(
        "p",
        { className: "muted small" },
        "Abstracts are downloaded from PubMed and analyzed on this device with the detectors chosen in Settings. Nothing is uploaded.",
      ),
      form,
      bar,
      status,
    ),
    results,
  );
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(st: MinerState) {
  const rows: (string | number)[][] = [["category", "term", "papers", "mentions", "share", "pmids"]];
  for (const s of st.stats) {
    rows.push([
      CATEGORY_LABEL[s.category],
      normalizeTerm(s.term),
      s.docs.size,
      s.mentions,
      (s.docs.size / st.articles.length).toFixed(3),
      [...s.docs].join(" "),
    ]);
  }
  const blob = new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pubmed-terms.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
