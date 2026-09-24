// The search card: query box with MeSH suggestions, Romanian → English
// rewriting, result count and sort, a filters panel with removable chips and
// a clinical question (PICO + Clinical Queries) builder.

import { h, replace } from "./dom";
import {
  activeFilters,
  AGES,
  ARTICLE_TYPES,
  buildPicoQuery,
  CLINICAL_CATEGORIES,
  EMPTY_FILTERS,
  LANGUAGES,
  translateQuery,
  type ClinicalQuery,
  type Filters,
} from "../search/query";
import type { SearchState } from "../search/url-state";
import { meshSuggestions, type Sort } from "../pubmed";

export const PAPER_COUNTS = [20, 50, 100, 200];

export interface SearchForm {
  element: HTMLElement;
  getState(): SearchState;
  setState(st: SearchState): void;
}

export function searchForm(opts: {
  onSubmit: (st: SearchState) => void;
  apiKey: () => string | null;
}): SearchForm {
  let filters: Filters = structuredClone(EMPTY_FILTERS);

  const queryInput = h("input", {
    type: "search",
    id: "search-query",
    placeholder: "e.g. empagliflozin chronic kidney disease, or insuficiență cardiacă",
    "aria-label": "PubMed query",
    autocomplete: "off",
  });
  const countSelect = h(
    "select",
    { "aria-label": "Number of papers" },
    ...PAPER_COUNTS.map((n) => h("option", { value: n, selected: n === 50 }, `${n} papers`)),
  );
  const sortSelect = h(
    "select",
    { "aria-label": "Sort order" },
    h("option", { value: "relevance" }, "Best match"),
    h("option", { value: "pub_date" }, "Most recent"),
  );
  const submitBtn = h("button", { className: "primary", type: "submit" }, "Search");
  const translationNote = h("p", { className: "notice", role: "status", hidden: true });
  const suggestions = h("div", { className: "suggestions", "aria-label": "MeSH suggestions", hidden: true });
  const chips = h("div", { className: "filter-chips", "aria-label": "Active filters" });

  // --- Romanian → English -------------------------------------------------
  const renderTranslation = () => {
    const q = queryInput.value.trim();
    const t = translateQuery(q);
    if (!t.replaced || t.text === q) {
      translationNote.hidden = true;
      return;
    }
    translationNote.hidden = false;
    replace(
      translationNote,
      "Searching in English: ",
      h("strong", {}, t.text),
      t.untranslated.length ? ` (not translated: ${t.untranslated.join(", ")}, so try English terms)` : "",
      " ",
      h(
        "button",
        {
          type: "button",
          className: "link",
          onclick: () => {
            queryInput.value = t.text;
            renderTranslation();
            queryInput.focus();
          },
        },
        "Edit in English",
      ),
    );
  };

  // --- MeSH suggestions ---------------------------------------------------
  let suggestTimer: ReturnType<typeof setTimeout> | undefined;
  let suggestSeq = 0;
  // Suggestions are for the phrase after the last AND/OR/NOT or comma.
  const currentPhrase = () => {
    const parts = queryInput.value.split(/\s+(?:AND|OR|NOT)\s+|,/);
    return (parts.at(-1) ?? "").replace(/[()"]/g, "").trim();
  };
  const loadSuggestions = () => {
    clearTimeout(suggestTimer);
    const phrase = currentPhrase();
    if (phrase.length < 4 || /\[/.test(phrase)) {
      suggestions.hidden = true;
      return;
    }
    suggestTimer = setTimeout(async () => {
      const seq = ++suggestSeq;
      const english = translateQuery(phrase).text;
      try {
        const terms = await meshSuggestions(english, { apiKey: opts.apiKey(), limit: 6 });
        if (seq !== suggestSeq) return;
        suggestions.hidden = terms.length === 0;
        replace(
          suggestions,
          h("span", { className: "muted small" }, "MeSH: "),
          ...terms.map((term) =>
            h(
              "button",
              {
                type: "button",
                className: "suggestion",
                title: `Search the MeSH heading "${term}" (includes narrower terms)`,
                onclick: () => {
                  const value = queryInput.value;
                  const idx = value.lastIndexOf(phrase);
                  const replacement = `"${term}"[MeSH Terms]`;
                  queryInput.value = idx >= 0 ? value.slice(0, idx) + replacement + value.slice(idx + phrase.length) : replacement;
                  suggestions.hidden = true;
                  renderTranslation();
                  queryInput.focus();
                },
              },
              term,
            ),
          ),
        );
      } catch {
        suggestions.hidden = true;
      }
    }, 450);
  };

  queryInput.addEventListener("input", () => {
    renderTranslation();
    loadSuggestions();
  });

  // --- Filters ------------------------------------------------------------
  const filterPanel = h("div", { className: "filter-grid" });
  const renderFilters = () => {
    const checkbox = (label: string, checked: boolean, onChange: (on: boolean) => void) =>
      h(
        "label",
        { className: "check" },
        h("input", {
          type: "checkbox",
          checked,
          onchange: (e: Event) => {
            onChange((e.target as HTMLInputElement).checked);
            update();
          },
        }),
        label,
      );
    const toggleIn = (list: string[], key: string, on: boolean) => (on ? [...list, key] : list.filter((k) => k !== key));
    const yearInput = (label: string, value: number | null, set: (v: number | null) => void) =>
      h(
        "label",
        { className: "field" },
        label,
        h("input", {
          type: "number",
          min: 1800,
          max: 2100,
          value: value ?? "",
          placeholder: "year",
          onchange: (e: Event) => {
            const v = Number((e.target as HTMLInputElement).value);
            set(v ? v : null);
            update();
          },
        }),
      );
    replace(
      filterPanel,
      h(
        "fieldset",
        {},
        h("legend", {}, "Publication date"),
        h(
          "div",
          { className: "row" },
          yearInput("From", filters.fromYear, (v) => (filters.fromYear = v)),
          yearInput("To", filters.toYear, (v) => (filters.toYear = v)),
        ),
        h(
          "div",
          { className: "row" },
          ...[1, 5, 10].map((y) =>
            h(
              "button",
              {
                type: "button",
                className: "small-btn",
                onclick: () => {
                  const now = new Date().getFullYear();
                  filters.fromYear = now - y + 1;
                  filters.toYear = null;
                  renderFilters();
                  update();
                },
              },
              `Last ${y} year${y > 1 ? "s" : ""}`,
            ),
          ),
        ),
      ),
      h(
        "fieldset",
        {},
        h("legend", {}, "Article type"),
        ...ARTICLE_TYPES.map((t) =>
          checkbox(t.label, filters.types.includes(t.key), (on) => (filters.types = toggleIn(filters.types, t.key, on))),
        ),
      ),
      h(
        "fieldset",
        {},
        h("legend", {}, "Availability and species"),
        checkbox("Free full text", filters.freeFullText, (on) => (filters.freeFullText = on)),
        checkbox("Humans only", filters.humans, (on) => (filters.humans = on)),
        h("legend", { className: "sub" }, "Language"),
        ...LANGUAGES.map((l) =>
          checkbox(l.label, filters.languages.includes(l.key), (on) => (filters.languages = toggleIn(filters.languages, l.key, on))),
        ),
      ),
      h(
        "fieldset",
        {},
        h("legend", {}, "Age and sex"),
        ...AGES.map((a) =>
          checkbox(a.label, filters.ages.includes(a.key), (on) => (filters.ages = toggleIn(filters.ages, a.key, on))),
        ),
        h(
          "label",
          { className: "field" },
          "Sex",
          h(
            "select",
            {
              onchange: (e: Event) => {
                filters.sex = (e.target as HTMLSelectElement).value as Filters["sex"];
                update();
              },
            },
            ...[
              ["", "Any"],
              ["female", "Female"],
              ["male", "Male"],
            ].map(([v, l]) => h("option", { value: v, selected: filters.sex === v }, l)),
          ),
        ),
      ),
    );
  };

  const renderChips = () => {
    const active = activeFilters(filters);
    replace(
      chips,
      ...active.map((f) =>
        h(
          "button",
          {
            type: "button",
            className: "filter-chip",
            title: "Remove this filter",
            onclick: () => {
              filters = f.clear(filters);
              renderFilters();
              update();
            },
          },
          f.label,
          h("span", { "aria-hidden": "true" }, " ✕"),
        ),
      ),
      active.length > 1 &&
        h(
          "button",
          {
            type: "button",
            className: "link",
            onclick: () => {
              filters = structuredClone(EMPTY_FILTERS);
              renderFilters();
              update();
            },
          },
          "Clear all",
        ),
    );
    filterToggle.textContent = active.length ? `Filters (${active.length})` : "Filters";
  };
  const update = () => renderChips();

  // --- Clinical question (PICO) -------------------------------------------
  const pico = { p: "", i: "", c: "", o: "" };
  let clinical: ClinicalQuery | null = null;
  const picoField = (key: keyof typeof pico, label: string, placeholder: string) =>
    h(
      "label",
      { className: "field" },
      label,
      h("input", {
        type: "text",
        placeholder,
        oninput: (e: Event) => (pico[key] = (e.target as HTMLInputElement).value),
      }),
    );
  const clinicalSelect = h(
    "select",
    {
      "aria-label": "Clinical question type",
      onchange: (e: Event) => {
        const v = (e.target as HTMLSelectElement).value;
        clinical = v ? { category: v as ClinicalQuery["category"], scope: clinical?.scope ?? "broad" } : null;
      },
    },
    h("option", { value: "" }, "Any question type"),
    ...CLINICAL_CATEGORIES.map((c) => h("option", { value: c.key }, c.label)),
  );
  const scopeSelect = h(
    "select",
    {
      "aria-label": "Clinical query scope",
      onchange: (e: Event) => {
        if (clinical) clinical.scope = (e.target as HTMLSelectElement).value as ClinicalQuery["scope"];
      },
    },
    h("option", { value: "broad" }, "Broad (more results)"),
    h("option", { value: "narrow" }, "Narrow (more precise)"),
  );
  const picoPanel = h(
    "div",
    { className: "pico" },
    h(
      "p",
      { className: "muted small" },
      "Separate synonyms with commas. Romanian terms are translated. The search is built as Patient AND (Intervention OR Comparison) AND Outcome.",
    ),
    h(
      "div",
      { className: "pico-grid" },
      picoField("p", "Patient / problem", "e.g. heart failure, cardiac failure"),
      picoField("i", "Intervention", "e.g. dapagliflozin, empagliflozin"),
      picoField("c", "Comparison (optional)", "e.g. placebo"),
      picoField("o", "Outcome (optional)", "e.g. hospitalization, mortality"),
    ),
    h("div", { className: "row" }, clinicalSelect, scopeSelect),
    h(
      "div",
      { className: "actions" },
      h(
        "button",
        {
          type: "button",
          className: "primary",
          onclick: () => {
            const translated = {
              p: translateQuery(pico.p).text,
              i: translateQuery(pico.i).text,
              c: translateQuery(pico.c).text,
              o: translateQuery(pico.o).text,
            };
            const q = buildPicoQuery(translated);
            if (!q) return;
            queryInput.value = q;
            filters.clinical = clinical ? { ...clinical, scope: scopeSelect.value as ClinicalQuery["scope"] } : null;
            renderFilters();
            update();
            renderTranslation();
            picoDetails.open = false;
            submit();
          },
        },
        "Build search and run",
      ),
    ),
  );

  const filterToggle = h("summary", {}, "Filters");
  const filterDetails = h("details", { className: "panel" }, filterToggle, filterPanel);
  const picoDetails = h("details", { className: "panel" }, h("summary", {}, "Clinical question (PICO)"), picoPanel);

  const submit = () => {
    const q = queryInput.value.trim();
    if (!q) {
      queryInput.focus();
      return;
    }
    suggestions.hidden = true;
    opts.onSubmit(getState());
  };

  const getState = (): SearchState => ({
    query: translateQuery(queryInput.value.trim()).text,
    count: Number(countSelect.value),
    sort: sortSelect.value as Sort,
    filters: structuredClone(filters),
  });

  const setState = (st: SearchState) => {
    queryInput.value = st.query;
    if (!PAPER_COUNTS.includes(st.count)) countSelect.append(h("option", { value: st.count }, `${st.count} papers`));
    countSelect.value = String(st.count);
    sortSelect.value = st.sort;
    filters = structuredClone(st.filters);
    renderFilters();
    update();
    renderTranslation();
  };

  renderFilters();
  update();

  const element = h(
    "section",
    { className: "card search-card" },
    h("h2", {}, "Search PubMed"),
    h(
      "form",
      {
        className: "search-form",
        role: "search",
        onsubmit: (e: Event) => {
          e.preventDefault();
          submit();
        },
      },
      queryInput,
      countSelect,
      sortSelect,
      submitBtn,
    ),
    suggestions,
    translationNote,
    chips,
    h("div", { className: "panels" }, filterDetails, picoDetails),
  );

  return { element, getState, setState };
}
