import { h, replace } from "./dom";
import { articleCard } from "./articles";
import { progressText, showError } from "./status";
import type { Engine } from "../engine";
import {
  groupTerms,
  removePiiOverlaps,
  toEntities,
  normalizeTerm,
  type Entity,
  type Span,
  type TermGroup,
} from "../entities";
import { CATEGORY_LABEL, PII_MODEL } from "../models";
import { buildQuery, findPhiInQuery, type QueryFilters } from "../query";
import { fetchArticles, pubmedSearchUrl, searchPubMed } from "../pubmed";
import { nerModels, type Settings } from "../settings";
import { normalizeLabel } from "openmed";

const SAMPLE_NOTE = `DISCHARGE SUMMARY (synthetic example)
Patient: Jordan Avery, DOB 04/12/1961, MRN 00482913
Seen at Riverside General Hospital by Dr. Casey Morgan. Phone (555) 201-7788.

History: 63-year-old with type 2 diabetes mellitus and chronic kidney disease stage 3, admitted with community-acquired pneumonia. Also has atrial fibrillation on apixaban.

Hospital course: Treated with ceftriaxone and azithromycin, improved over 4 days. Metformin was held because of reduced eGFR and restarted at a lower dose. Started empagliflozin for renal protection.

Plan: Follow up with nephrology in 2 weeks. Continue apixaban 5 mg twice daily.`;

interface NoteState {
  text: string;
  pii: Span[];
  entities: Entity[];
  groups: TermGroup[];
  selected: Set<string>;
  customQuery: string | null;
}

export function noteTab(engine: Engine, getSettings: () => Settings): HTMLElement {
  let state: NoteState | null = null;
  const filters: QueryFilters = { years: 10, humansOnly: true };

  const input = h("textarea", {
    id: "note-input",
    rows: 12,
    spellcheck: false,
    placeholder: "Paste a clinical note. It is analysed on this device and is never uploaded.",
    "aria-label": "Clinical note",
  });
  const status = h("p", { className: "status", role: "status" });
  const analyzeBtn = h("button", { className: "primary", type: "button" }, "Analyze note");
  const results = h("div", { className: "note-results" });

  analyzeBtn.addEventListener("click", async () => {
    const text = input.value;
    if (!text.trim()) {
      status.textContent = "Paste a note first.";
      return;
    }
    const s = getSettings();
    analyzeBtn.disabled = true;
    replace(results);
    status.textContent = "Loading models…";
    try {
      const analysis = await engine.analyzeNote(
        {
          text,
          piiModel: PII_MODEL,
          piiThreshold: s.piiThreshold,
          nerModels: nerModels(s),
          threshold: s.threshold,
        },
        (p) => (status.textContent = progressText(p)),
      );
      const entities = removePiiOverlaps(toEntities(text, analysis.clinical), analysis.pii);
      const groups = groupTerms(entities);
      state = {
        text,
        pii: analysis.pii,
        entities,
        groups,
        selected: defaultSelection(groups),
        customQuery: null,
      };
      status.textContent = `Found ${analysis.pii.length} identifier${analysis.pii.length === 1 ? "" : "s"} (redacted) and ${groups.length} clinical term${groups.length === 1 ? "" : "s"}.`;
      renderResults();
    } catch (err) {
      showError(status, err);
    } finally {
      analyzeBtn.disabled = false;
    }
  });

  function renderResults() {
    if (!state) return;
    const st = state;
    const query = st.customQuery ?? currentQuery(st, filters);
    const queryBox = h("textarea", {
      className: "query",
      rows: 3,
      value: query,
      "aria-label": "PubMed query",
      spellcheck: false,
    });
    const guard = h("p", { className: "guard", role: "alert" });
    const searchBtn = h("button", { className: "primary", type: "button" }, "Search PubMed");
    const openLink = h("a", { className: "button", target: "_blank", rel: "noopener noreferrer" }, "Open on pubmed.gov");
    const paperStatus = h("p", { className: "status", role: "status" });
    const papers = h("div", { className: "papers" });

    const phiValues = st.pii.map((p) => st.text.slice(p.start, p.end));
    const checkGuard = () => {
      const hits = findPhiInQuery(queryBox.value, phiValues);
      const empty = !queryBox.value.trim();
      searchBtn.disabled = hits.length > 0 || empty;
      guard.textContent = hits.length
        ? `Blocked: the query contains text flagged as an identifier (${hits.join(", ")}). Remove it before searching.`
        : "";
      openLink.toggleAttribute("hidden", hits.length > 0 || empty);
      openLink.setAttribute("href", pubmedSearchUrl(queryBox.value));
    };
    const resetBtn = h("button", { type: "button", className: "link", hidden: st.customQuery == null }, "Reset to generated query");
    queryBox.addEventListener("input", () => {
      st.customQuery = queryBox.value;
      resetBtn.hidden = false;
      checkGuard();
    });
    checkGuard();

    searchBtn.addEventListener("click", async () => {
      const s = getSettings();
      searchBtn.disabled = true;
      paperStatus.textContent = "Searching PubMed…";
      replace(papers);
      try {
        const found = await searchPubMed(queryBox.value, { retmax: 20, apiKey: s.apiKey || null });
        if (!found.ids.length) {
          paperStatus.textContent = "No results. Try selecting fewer terms or widening the filters.";
          return;
        }
        const articles = await fetchArticles(found.ids, { apiKey: s.apiKey || null });
        paperStatus.textContent = `Showing ${articles.length} of ${found.count.toLocaleString()} results.`;
        replace(papers, ...articles.map((a) => articleCard(a)));
      } catch (err) {
        showError(paperStatus, err);
      } finally {
        checkGuard();
      }
    });

    const rebuild = () => {
      st.customQuery = null;
      renderResults();
    };
    resetBtn.addEventListener("click", rebuild);

    replace(
      results,
      h(
        "section",
        { className: "card" },
        h(
          "div",
          { className: "card-head" },
          h("h2", {}, "De-identified note"),
          h(
            "button",
            {
              type: "button",
              onclick: (e: Event) => {
                navigator.clipboard?.writeText(redactedText(st)).then(
                  () => ((e.target as HTMLButtonElement).textContent = "Copied"),
                  () => ((e.target as HTMLButtonElement).textContent = "Copy failed"),
                );
              },
            },
            "Copy de-identified text",
          ),
        ),
        h("p", { className: "muted small" }, "Identifiers are replaced with labels. Clinical terms are highlighted. Nothing here has left your device."),
        h("pre", { className: "note-view" }, ...renderNote(st)),
      ),
      h(
        "section",
        { className: "card" },
        h("h2", {}, "Clinical terms"),
        st.groups.length
          ? h("p", { className: "muted small" }, "Pick the terms to search for. Terms in the same group are combined with OR, and groups are combined with AND.")
          : h("p", { className: "muted" }, "No clinical terms found. Try turning on more detectors in Settings, or lowering the confidence threshold."),
        ...groupsByCategory(st.groups).map(([cat, groups]) =>
          h(
            "fieldset",
            { className: "term-group" },
            h("legend", {}, h("span", { className: `dot cat-${cat}` }), CATEGORY_LABEL[cat]),
            ...groups.map((g) =>
              h(
                "label",
                { className: `chip cat-${g.category}` },
                h("input", {
                  type: "checkbox",
                  checked: st.selected.has(g.key),
                  onchange: (e: Event) => {
                    if ((e.target as HTMLInputElement).checked) st.selected.add(g.key);
                    else st.selected.delete(g.key);
                    rebuild();
                  },
                }),
                g.display,
                g.count > 1 && h("span", { className: "count" }, `×${g.count}`),
              ),
            ),
          ),
        ),
      ),
      h(
        "section",
        { className: "card" },
        h("h2", {}, "PubMed search"),
        h(
          "div",
          { className: "filters" },
          h(
            "label",
            {},
            "Published in ",
            h(
              "select",
              {
                onchange: (e: Event) => {
                  const v = (e.target as HTMLSelectElement).value;
                  filters.years = v ? Number(v) : null;
                  rebuild();
                },
              },
              ...[
                ["", "any year"],
                ["1", "the last year"],
                ["5", "the last 5 years"],
                ["10", "the last 10 years"],
              ].map(([v, l]) => h("option", { value: v, selected: String(filters.years ?? "") === v }, l)),
            ),
          ),
          filterToggle("Reviews only", "reviewsOnly"),
          filterToggle("Clinical trials only", "trialsOnly"),
          filterToggle("Human studies", "humansOnly"),
          filterToggle("English", "englishOnly"),
        ),
        queryBox,
        guard,
        h(
          "p",
          { className: "muted small" },
          "Only the text in this box is sent to PubMed (NCBI). You can edit it. ",
          resetBtn,
        ),
        h("div", { className: "actions" }, searchBtn, openLink),
        paperStatus,
        papers,
      ),
    );

    function filterToggle(label: string, key: "reviewsOnly" | "trialsOnly" | "humansOnly" | "englishOnly") {
      return h(
        "label",
        { className: "toggle" },
        h("input", {
          type: "checkbox",
          checked: Boolean(filters[key]),
          onchange: (e: Event) => {
            filters[key] = (e.target as HTMLInputElement).checked;
            rebuild();
          },
        }),
        label,
      );
    }
  }

  return h(
    "div",
    { className: "tab-body" },
    h(
      "section",
      { className: "card" },
      h(
        "div",
        { className: "card-head" },
        h("h2", {}, "Clinical note"),
        h(
          "button",
          {
            type: "button",
            onclick: () => {
              input.value = SAMPLE_NOTE;
            },
          },
          "Load synthetic example",
        ),
      ),
      input,
      h("div", { className: "actions" }, analyzeBtn),
      status,
    ),
    results,
  );
}

function defaultSelection(groups: TermGroup[]): Set<string> {
  // Pre-select up to two of the most mentioned conditions and drugs.
  const pick = (cat: string) => groups.filter((g) => g.category === cat).slice(0, 2).map((g) => g.key);
  const sel = [...pick("condition"), ...pick("drug")];
  if (!sel.length) sel.push(...groups.slice(0, 2).map((g) => g.key));
  return new Set(sel);
}

function currentQuery(st: NoteState, filters: QueryFilters): string {
  const terms = st.groups
    .filter((g) => st.selected.has(g.key))
    .map((g) => ({ text: g.display, category: g.category }));
  return terms.length ? buildQuery(terms, filters) : "";
}

function groupsByCategory(groups: TermGroup[]) {
  const map = new Map<TermGroup["category"], TermGroup[]>();
  for (const g of groups) map.set(g.category, [...(map.get(g.category) ?? []), g]);
  return [...map.entries()];
}

function piiLabel(span: Span): string {
  return normalizeLabel(span.label) || span.label;
}

// Walk the original text, replacing PII with labels and marking entities.
function renderNote(st: NoteState): (Node | string)[] {
  const marks = [
    ...st.pii.map((p) => ({ ...p, kind: "pii" as const })),
    ...st.entities.map((e) => ({ ...e, kind: "ent" as const })),
  ].sort((a, b) => a.start - b.start);
  const selectedTerms = new Set(
    st.groups.filter((g) => st.selected.has(g.key)).map((g) => g.key),
  );
  const out: (Node | string)[] = [];
  let pos = 0;
  for (const m of marks) {
    if (m.start < pos) continue;
    out.push(st.text.slice(pos, m.start));
    if (m.kind === "pii") {
      out.push(h("span", { className: "redacted", title: "Identifier removed" }, `[${piiLabel(m)}]`));
    } else {
      const e = m as Entity & { kind: "ent" };
      const key = `${e.category}:${normalizeTerm(e.text)}`;
      out.push(
        h(
          "mark",
          { className: `ent cat-${e.category}${selectedTerms.has(key) ? " selected" : ""}`, title: `${e.label} ${e.score?.toFixed(2) ?? ""}` },
          st.text.slice(e.start, e.end),
        ),
      );
    }
    pos = m.end;
  }
  out.push(st.text.slice(pos));
  return out;
}

function redactedText(st: NoteState): string {
  let out = "";
  let pos = 0;
  for (const p of [...st.pii].sort((a, b) => a.start - b.start)) {
    if (p.start < pos) continue;
    out += st.text.slice(pos, p.start) + `[${piiLabel(p)}]`;
    pos = p.end;
  }
  return out + st.text.slice(pos);
}
