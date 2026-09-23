// Pure helpers for chunking text, merging entity spans and tallying terms.
// Kept free of DOM / model code so they are unit-testable.

import { categoryFor, CATEGORY_ORDER, type Category } from "./models";

export interface Span {
  start: number;
  end: number;
  label: string;
  score: number | null;
}

export interface Entity extends Span {
  text: string;
  category: Category;
  // True when the mention is negated ("no signs of X", "fără X").
  negated: boolean;
}

export interface Chunk {
  text: string;
  offset: number;
}

// Token-classification models see at most ~512 tokens, so long notes are
// split at sentence/line boundaries into chunks of roughly `maxChars`.
export function chunkText(text: string, maxChars = 1200): Chunk[] {
  const chunks: Chunk[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const cut = Math.max(
        window.lastIndexOf("\n"),
        window.lastIndexOf(". "),
        window.lastIndexOf("; "),
      );
      if (cut > maxChars * 0.4) {
        end = start + cut + 1;
      } else {
        const space = window.lastIndexOf(" ");
        if (space > maxChars * 0.4) end = start + space + 1;
      }
    }
    const piece = text.slice(start, end);
    if (piece.trim()) chunks.push({ text: piece, offset: start });
    start = end;
  }
  return chunks;
}

export function overlaps(a: { start: number; end: number }, b: { start: number; end: number }) {
  return a.start < b.end && b.start < a.end;
}

// Trim whitespace and stray punctuation that BIO decoding often leaves on
// span edges, adjusting offsets so highlights stay aligned.
export function tidySpan(text: string, span: Span): Span | null {
  let { start, end } = span;
  while (start < end && /[\s,.;:()[\]"']/.test(text[start])) start++;
  while (end > start && /[\s,.;:()[\]"']/.test(text[end - 1])) end--;
  if (end - start < 2) return null;
  return { ...span, start, end };
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

// Sub-word tokens mean a model can label only part of a word ("men" in
// "meningeal"). Grow every span to whole words.
export function snapToWords(text: string, span: Span): Span {
  let { start, end } = span;
  while (start > 0 && WORD_CHAR.test(text[start - 1]) && WORD_CHAR.test(text[start])) start--;
  while (end < text.length && WORD_CHAR.test(text[end - 1]) && WORD_CHAR.test(text[end])) end++;
  return { ...span, start, end };
}

// Join same-label pieces that overlap or are separated by a single space or
// hyphen, e.g. "meningeal" + "irritation" → "meningeal irritation".
export function mergeFragments(text: string, spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out.at(-1);
    if (
      last &&
      categoryFor(last.label) === categoryFor(s.label) &&
      (s.start <= last.end || /^[ -]$/.test(text.slice(last.end, s.start)))
    ) {
      last.end = Math.max(last.end, s.end);
      last.score = Math.max(last.score ?? 0, s.score ?? 0);
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

// NegEx-style cues: in the same sentence shortly before the term, or right
// after it ("… was ruled out"). Lookarounds instead of \b so Romanian
// diacritics count as letters.
const NB = String.raw`(?<![\p{L}\p{N}])`;
const NA = String.raw`(?![\p{L}\p{N}])`;
// Sentence text up to the term; an initial like "C." does not end a sentence.
const SAME_SENTENCE = String.raw`(?:[^.;:\n]|(?<=(?:^|[\s(])\p{Lu})\.)`;
const NEGATION_BEFORE = new RegExp(
  `${NB}(?:no|not|without|denies|denied|negative for|absence of|absent|free of|ruled out|rules out|excluded|fără|fara|nu|absen[tț]a|negativ(?:ă|a)? pentru|exclus(?:ă|a)?)${NA}${SAME_SENTENCE}{0,50}$`,
  "iu",
);
const NEGATION_AFTER = new RegExp(
  `^[^.;:\\n]{0,25}?${NB}(?:ruled out|excluded|absent|negative|exclus(?:ă|a)?|absent(?:ă|a)?)${NA}`,
  "iu",
);

export function isNegated(text: string, span: { start: number; end: number }): boolean {
  const before = text.slice(Math.max(0, span.start - 60), span.start);
  const after = text.slice(span.end, span.end + 40);
  return NEGATION_BEFORE.test(before) || NEGATION_AFTER.test(after);
}

export function toEntities(text: string, spans: Span[]): Entity[] {
  const out: Entity[] = [];
  const snapped = mergeFragments(
    text,
    spans.map((s) => snapToWords(text, s)),
  );
  for (const raw of snapped) {
    const span = tidySpan(text, raw);
    if (!span) continue;
    out.push({
      ...span,
      text: text.slice(span.start, span.end),
      category: categoryFor(span.label),
      negated: isNegated(text, span),
    });
  }
  return dedupeOverlapping(out);
}

// When two detectors tag overlapping text keep the higher-scoring span.
export function dedupeOverlapping(entities: Entity[]): Entity[] {
  const sorted = [...entities].sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0) || b.end - b.start - (a.end - a.start),
  );
  const kept: Entity[] = [];
  for (const e of sorted) {
    if (!kept.some((k) => overlaps(k, e))) kept.push(e);
  }
  return kept.sort((a, b) => a.start - b.start);
}

// Drop clinical entities that overlap anything the PII model flagged, so an
// identifier can never end up as a search term.
export function removePiiOverlaps<T extends { start: number; end: number }>(
  entities: T[],
  pii: { start: number; end: number }[],
): T[] {
  return entities.filter((e) => !pii.some((p) => overlaps(e, p)));
}

export function normalizeTerm(term: string): string {
  return term
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .trim();
}

export interface TermGroup {
  key: string;
  display: string;
  category: Category;
  count: number;
  // Every mention of this term is negated.
  negated: boolean;
}

// Unique terms per category, most frequent first.
export function groupTerms(entities: Entity[]): TermGroup[] {
  const map = new Map<string, TermGroup>();
  for (const e of entities) {
    const key = `${e.category}:${normalizeTerm(e.text)}`;
    const g = map.get(key);
    if (g) {
      g.count++;
      g.negated = g.negated && e.negated;
    } else {
      map.set(key, { key, display: e.text, category: e.category, count: 1, negated: e.negated });
    }
  }
  return [...map.values()].sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
      b.count - a.count ||
      a.display.localeCompare(b.display),
  );
}

export interface TermStat {
  key: string;
  term: string;
  category: Category;
  docs: Set<string>;
  mentions: number;
}

// Document frequency of each term across a set of papers.
export function tallyByDocument(docs: { id: string; entities: Entity[] }[]): TermStat[] {
  const map = new Map<string, TermStat>();
  const displayCounts = new Map<string, Map<string, number>>();
  for (const doc of docs) {
    for (const e of doc.entities) {
      if (e.negated) continue;
      const norm = normalizeTerm(e.text);
      if (norm.length < 2) continue;
      const key = `${e.category}:${norm}`;
      let stat = map.get(key);
      if (!stat) {
        stat = { key, term: e.text, category: e.category, docs: new Set(), mentions: 0 };
        map.set(key, stat);
        displayCounts.set(key, new Map());
      }
      stat.docs.add(doc.id);
      stat.mentions++;
      const dc = displayCounts.get(key)!;
      dc.set(e.text, (dc.get(e.text) ?? 0) + 1);
    }
  }
  // Show the most common surface form of each term.
  for (const [key, stat] of map) {
    const dc = displayCounts.get(key)!;
    stat.term = [...dc.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  return [...map.values()].sort((a, b) => b.docs.size - a.docs.size || b.mentions - a.mentions);
}
