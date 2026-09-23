import { h, replace } from "./dom";
import { articleCard, highlight } from "./articles";
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
import { findRomanianPii, mergePii } from "../ro-pii";
import { ACCEPTED_FILES, extractText } from "../files";
import { detectLanguage, segmentSentences, type NoteLanguage } from "../lang";

const SAMPLE_NOTE = `DISCHARGE SUMMARY (synthetic example)
Patient: Jordan Avery, DOB 04/12/1961, MRN 00482913
Seen at Riverside General Hospital by Dr. Casey Morgan. Phone (555) 201-7788.

History: 63-year-old with type 2 diabetes mellitus and chronic kidney disease stage 3, admitted with community-acquired pneumonia. Also has atrial fibrillation on apixaban.

Hospital course: Treated with ceftriaxone and azithromycin, improved over 4 days. Metformin was held because of reduced eGFR and restarted at a lower dose. Started empagliflozin for renal protection.

Plan: Follow up with nephrology in 2 weeks. Continue apixaban 5 mg twice daily.`;

const SAMPLE_NOTE_RO = `SCRISOARE MEDICALĂ (exemplu sintetic)
Pacient: Popescu Ion, CNP 1610412400010, CI seria RX nr. 123456
Domiciliu: Str. Mihai Eminescu nr. 12, bl. A3, ap. 7, sector 2, București. Tel. 0722 123 456.
Internat în Spitalul Clinic Județean, FO nr. 4821/2024, medic curant Dr. Ionescu Maria.

Diagnostic: Diabet zaharat tip 2. Boală cronică de rinichi stadiul 3. Pneumonie comunitară. Fibrilație atrială.

Evoluție: s-a administrat ceftriaxonă și azitromicină, cu ameliorare în 4 zile. Metforminul a fost oprit din cauza scăderii RFG și reluat în doză redusă. S-a inițiat empagliflozin pentru protecție renală.

Recomandări: control la nefrologie peste 2 săptămâni. Continuă apixaban 5 mg de două ori pe zi. Data externării: 18.03.2024.`;

interface NoteState {
  text: string;
  pii: Span[];
  entities: Entity[];
  groups: TermGroup[];
  selected: Set<string>;
  customQuery: string | null;
  language: NoteLanguage;
  // For non-English notes: the on-device English translation that the
  // clinical models were run on.
  english: { text: string; entities: Entity[] } | null;
}

export function noteTab(engine: Engine, getSettings: () => Settings): HTMLElement {
  let state: NoteState | null = null;
  const filters: QueryFilters = { years: 10, humansOnly: true };

  const input = h("textarea", {
    id: "note-input",
    rows: 12,
    spellcheck: false,
    placeholder: "Paste a clinical note, or drop a .docx / .pdf / .txt file here. It is analysed on this device and is never uploaded.",
    "aria-label": "Clinical note",
  });
  const status = h("p", { className: "status", role: "status" });
  const analyzeBtn = h("button", { className: "primary", type: "button" }, "Analyze note");
  const fileInput = h("input", { type: "file", accept: ACCEPTED_FILES, hidden: true, "aria-label": "Open document" });
  const openBtn = h("button", { type: "button", onclick: () => fileInput.click() }, "Open file (.docx, .pdf, .txt)");
  async function loadFile(file: File) {
    status.textContent = `Reading ${file.name}…`;
    try {
      const { text, warning } = await extractText(file);
      input.value = text;
      langSelect.value = "auto";
      replace(results);
      state = null;
      status.textContent = `Loaded ${file.name} (${text.length.toLocaleString()} characters), read on this device.${warning ? " " + warning : ""} Check the text, then click Analyze note.`;
    } catch (err) {
      showError(status, err);
    }
  }
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) void loadFile(file);
    fileInput.value = "";
  });
  input.addEventListener("dragover", (e) => {
    e.preventDefault();
    input.classList.add("dragging");
  });
  input.addEventListener("dragleave", () => input.classList.remove("dragging"));
  input.addEventListener("drop", (e) => {
    e.preventDefault();
    input.classList.remove("dragging");
    const file = e.dataTransfer?.files?.[0];
    if (file) void loadFile(file);
  });
  const langSelect = h(
    "select",
    { "aria-label": "Note language" },
    h("option", { value: "auto" }, "Detect language"),
    h("option", { value: "en" }, "English"),
    h("option", { value: "ro" }, "Română (Romanian)"),
  );
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
      const language: NoteLanguage =
        langSelect.value === "auto" ? detectLanguage(text) : (langSelect.value as NoteLanguage);
      const onProgress = (p: Parameters<typeof progressText>[0]) => (status.textContent = progressText(p));
      const analysis = await engine.analyzeNote(
        {
          text,
          piiModel: PII_MODEL,
          piiThreshold: s.piiThreshold,
          // The clinical models are English-only; other languages are
          // translated first (below).
          nerModels: language === "en" ? nerModels(s) : [],
          threshold: s.threshold,
        },
        onProgress,
      );
      // Romanian identifier rules always run: a CNP or +40 number can appear
      // in any note, and over-redacting is the safe failure.
      const pii = mergePii(analysis.pii, findRomanianPii(text));
      let entities: Entity[] = [];
      let english: NoteState["english"] = null;
      if (language === "en") {
        entities = removePiiOverlaps(toEntities(text, analysis.clinical), pii);
      } else {
        // Only the de-identified text is translated, so identifiers never
        // reach the translation or the clinical models.
        const segments = segmentSentences(redact(text, pii));
        const translated = await engine.translate(
          {
            segments: segments.filter((g) => g.translate).map((g) => g.text),
            model: s.translationModel,
            srcLang: "ron_Latn",
            tgtLang: "eng_Latn",
          },
          onProgress,
        );
        let i = 0;
        const englishText = segments.map((g) => (g.translate ? translated[i++] : g.text)).join("");
        const [doc] = await engine.extractMany(
          { docs: [{ id: "en", text: englishText }], nerModels: nerModels(s), threshold: s.threshold },
          onProgress,
        );
        const found = toEntities(englishText, doc?.spans ?? []).filter((e) => !/[[\]]/.test(e.text));
        english = { text: englishText, entities: found };
        entities = found;
      }
      const groups = groupTerms(entities);
      state = {
        text,
        pii,
        entities: language === "en" ? entities : [],
        groups,
        selected: defaultSelection(groups),
        customQuery: null,
        language,
        english,
      };
      status.textContent = `${language === "ro" ? "Romanian note. " : ""}Found ${pii.length} identifier${pii.length === 1 ? "" : "s"} (redacted) and ${groups.length} clinical term${groups.length === 1 ? "" : "s"}.`;
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
      st.english &&
        h(
          "section",
          { className: "card" },
          h("h2", {}, "English translation"),
          h(
            "p",
            { className: "muted small" },
            "Machine-translated on this device from the de-identified note, and used only to find clinical terms. Check it before relying on it.",
          ),
          h("pre", { className: "note-view" }, ...highlight(st.english.text, st.english.entities)),
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
              langSelect.value = "auto";
            },
          },
          "Load synthetic example",
        ),
        h(
          "button",
          {
            type: "button",
            onclick: () => {
              input.value = SAMPLE_NOTE_RO;
              langSelect.value = "auto";
            },
          },
          "Exemplu sintetic (RO)",
        ),
      ),
      input,
      h("div", { className: "actions" }, analyzeBtn, langSelect, openBtn, fileInput),
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
  if (span.label === "CNP") return "CNP";
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
  return redact(st.text, st.pii);
}

function redact(text: string, pii: Span[]): string {
  let out = "";
  let pos = 0;
  for (const p of [...pii].sort((a, b) => a.start - b.start)) {
    if (p.start < pos) continue;
    out += text.slice(pos, p.start) + `[${piiLabel(p)}]`;
    pos = p.end;
  }
  return out + text.slice(pos);
}
