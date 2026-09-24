// PubMed query construction: filters, clinical questions (PICO + Clinical
// Queries) and Romanian → English rewriting of search terms.

import { applyGlossary } from "../glossary";

export interface Filters {
  fromYear: number | null;
  toYear: number | null;
  types: string[];
  freeFullText: boolean;
  humans: boolean;
  languages: string[];
  ages: string[];
  sex: "" | "female" | "male";
  clinical: ClinicalQuery | null;
}

export interface ClinicalQuery {
  category: "therapy" | "diagnosis" | "etiology" | "prognosis" | "prediction";
  scope: "broad" | "narrow";
}

export const EMPTY_FILTERS: Filters = {
  fromYear: null,
  toYear: null,
  types: [],
  freeFullText: false,
  humans: false,
  languages: [],
  ages: [],
  sex: "",
  clinical: null,
};

export const ARTICLE_TYPES: { key: string; label: string; clause: string }[] = [
  { key: "meta", label: "Meta-analysis", clause: "meta-analysis[pt]" },
  { key: "sr", label: "Systematic review", clause: "systematic review[pt]" },
  { key: "rct", label: "Randomized controlled trial", clause: "randomized controlled trial[pt]" },
  { key: "trial", label: "Clinical trial", clause: "clinical trial[pt]" },
  { key: "guideline", label: "Guideline", clause: "(guideline[pt] OR practice guideline[pt])" },
  { key: "review", label: "Review", clause: "review[pt]" },
  { key: "obs", label: "Observational study", clause: "observational study[pt]" },
  { key: "case", label: "Case report", clause: "case reports[pt]" },
];

export const LANGUAGES: { key: string; label: string }[] = [
  { key: "english", label: "English" },
  { key: "romanian", label: "Romanian" },
  { key: "french", label: "French" },
  { key: "german", label: "German" },
  { key: "spanish", label: "Spanish" },
  { key: "italian", label: "Italian" },
];

export const AGES: { key: string; label: string; clause: string }[] = [
  { key: "child", label: "Children (0–18)", clause: "(infant[mh] OR child[mh] OR adolescent[mh])" },
  { key: "adult", label: "Adults (19–64)", clause: "(adult[mh] OR middle aged[mh])" },
  { key: "aged", label: "Older adults (65+)", clause: "aged[mh]" },
];

export const CLINICAL_CATEGORIES: { key: ClinicalQuery["category"]; label: string; tag: string }[] = [
  { key: "therapy", label: "Therapy", tag: "Therapy" },
  { key: "diagnosis", label: "Diagnosis", tag: "Diagnosis" },
  { key: "etiology", label: "Etiology / harm", tag: "Etiology" },
  { key: "prognosis", label: "Prognosis", tag: "Prognosis" },
  { key: "prediction", label: "Clinical prediction guides", tag: "Clinical Prediction Guides" },
];

const orGroup = (clauses: string[]) => (clauses.length === 1 ? clauses[0] : `(${clauses.join(" OR ")})`);

// The search sent to PubMed: the user's terms AND every active filter.
export function buildFullQuery(base: string, f: Filters): string {
  const parts: string[] = [];
  if (base.trim()) parts.push(`(${base.trim()})`);
  const types = ARTICLE_TYPES.filter((t) => f.types.includes(t.key)).map((t) => t.clause);
  if (types.length) parts.push(orGroup(types));
  if (f.fromYear || f.toYear) {
    const from = f.fromYear ?? 1800;
    const to = f.toYear ?? 3000;
    parts.push(`("${from}/01/01"[dp] : "${to}/12/31"[dp])`);
  }
  if (f.freeFullText) parts.push("free full text[sb]");
  if (f.humans) parts.push("humans[mh]");
  if (f.languages.length) parts.push(orGroup(f.languages.map((l) => `${l}[la]`)));
  const ages = AGES.filter((a) => f.ages.includes(a.key)).map((a) => a.clause);
  if (ages.length) parts.push(orGroup(ages));
  if (f.sex) parts.push(`${f.sex}[mh]`);
  if (f.clinical) {
    const cat = CLINICAL_CATEGORIES.find((c) => c.key === f.clinical!.category);
    if (cat) parts.push(`${cat.tag}/${f.clinical.scope === "narrow" ? "Narrow" : "Broad"}[filter]`);
  }
  return parts.join(" AND ");
}

// Human-readable list of active filters, for removable chips.
export function activeFilters(f: Filters): { key: string; label: string; clear: (f: Filters) => Filters }[] {
  const out: { key: string; label: string; clear: (f: Filters) => Filters }[] = [];
  if (f.fromYear || f.toYear) {
    out.push({
      key: "years",
      label: f.fromYear && f.toYear ? `${f.fromYear}–${f.toYear}` : f.fromYear ? `From ${f.fromYear}` : `Until ${f.toYear}`,
      clear: (x) => ({ ...x, fromYear: null, toYear: null }),
    });
  }
  for (const t of ARTICLE_TYPES.filter((t) => f.types.includes(t.key))) {
    out.push({ key: `type-${t.key}`, label: t.label, clear: (x) => ({ ...x, types: x.types.filter((k) => k !== t.key) }) });
  }
  if (f.freeFullText) out.push({ key: "fft", label: "Free full text", clear: (x) => ({ ...x, freeFullText: false }) });
  if (f.humans) out.push({ key: "humans", label: "Humans", clear: (x) => ({ ...x, humans: false }) });
  for (const l of LANGUAGES.filter((l) => f.languages.includes(l.key))) {
    out.push({ key: `lang-${l.key}`, label: l.label, clear: (x) => ({ ...x, languages: x.languages.filter((k) => k !== l.key) }) });
  }
  for (const a of AGES.filter((a) => f.ages.includes(a.key))) {
    out.push({ key: `age-${a.key}`, label: a.label, clear: (x) => ({ ...x, ages: x.ages.filter((k) => k !== a.key) }) });
  }
  if (f.sex) out.push({ key: "sex", label: f.sex === "female" ? "Female" : "Male", clear: (x) => ({ ...x, sex: "" }) });
  if (f.clinical) {
    const cat = CLINICAL_CATEGORIES.find((c) => c.key === f.clinical!.category);
    out.push({
      key: "clinical",
      label: `Clinical query: ${cat?.label ?? f.clinical.category} (${f.clinical.scope})`,
      clear: (x) => ({ ...x, clinical: null }),
    });
  }
  return out;
}

export interface Pico {
  p: string;
  i: string;
  c: string;
  o: string;
}

// Each PICO field may list synonyms separated by commas or semicolons;
// synonyms are OR'd and fields AND'd, with the comparison OR'd with the
// intervention: P AND (I OR C) AND O.
export function buildPicoQuery(pico: Pico): string {
  const group = (field: string) => {
    const terms = field
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean);
    return terms.length ? orGroup(terms.map((t) => (/\s/.test(t) && !/[[\]"()]/.test(t) ? `(${t})` : t))) : "";
  };
  const p = group(pico.p);
  const ic = [group(pico.i), group(pico.c)].filter(Boolean);
  const o = group(pico.o);
  const icPart = ic.length === 2 ? `(${ic[0]} OR ${ic[1]})` : (ic[0] ?? "");
  return [p, icPart, o].filter(Boolean).join(" AND ");
}

const RO_HINT = /[ăâîșțşţ]|(?<![\p{L}])(?:și|si|cu|pentru|în|fără|fara|sau|de|la|al|ale|din)(?![\p{L}])/iu;

export function looksRomanian(query: string): boolean {
  return RO_HINT.test(query);
}

// Rewrite Romanian search terms in English. Quoted phrases and field tags
// ([mh], [tiab]…) are left untouched; "și"/"sau" become AND/OR.
export function translateQuery(query: string): { text: string; replaced: number; untranslated: string[] } {
  if (!looksRomanian(query)) return { text: query, replaced: 0, untranslated: [] };
  let replaced = 0;
  const pieces = query.split(/("[^"]*"(?:\[[^\]]*\])?|\[[^\]]*\])/);
  const text = pieces
    .map((piece, i) => {
      if (i % 2 === 1) return piece; // quoted phrase or field tag
      const g = applyGlossary(piece);
      replaced += g.replaced;
      return g.text
        .replace(/(?<![\p{L}])(?:și|si)(?![\p{L}])/giu, "AND")
        .replace(/(?<![\p{L}])sau(?![\p{L}])/giu, "OR")
        .replace(/(?<![\p{L}])(?:fără|fara)(?![\p{L}])/giu, "NOT");
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  const untranslated = [...new Set(text.match(/[\p{L}-]*[ăâîșțşţ][\p{L}-]*/giu) ?? [])];
  return { text, replaced, untranslated };
}
