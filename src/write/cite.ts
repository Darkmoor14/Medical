// Citation numbering and in-text labels for the editor, in two styles:
//   vancouver  [1], [1,3], [2–4]; references numbered in order of first use
//   apa        (Smith et al., 2023); references alphabetical

import { articleKey, type Article } from "../pubmed";
import { apa, authorsOf, vancouver } from "../search/citations";

export type CiteStyle = "vancouver" | "apa";

export interface DocNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

// Keys of every citation in the document, in order of first appearance.
export function citationOrder(doc: DocNode | null | undefined): string[] {
  const seen: string[] = [];
  const walk = (n: DocNode) => {
    if (n.type === "citation") {
      for (const k of (n.attrs?.keys as string[] | undefined) ?? []) if (!seen.includes(k)) seen.push(k);
    }
    n.content?.forEach(walk);
  };
  if (doc) walk(doc);
  return seen;
}

export type Refs = Record<string, Article>;

// "Smith", "Smith & Jones", "Smith et al." — or a short title when no authors.
export function authorPart(a: Article): string {
  const people = authorsOf(a);
  const name = (p: (typeof people)[number]) => p.collective || p.last;
  if (people.length === 0) return a.title.split(/\s+/).slice(0, 3).join(" ").replace(/[.,:;]+$/, "") + "…";
  if (people.length === 1) return name(people[0]);
  if (people.length === 2) return `${name(people[0])} & ${name(people[1])}`;
  return `${name(people[0])} et al.`;
}

// 2023a / 2023b when two cited papers share first author and year.
export function yearSuffixes(keys: string[], refs: Refs): Map<string, string> {
  const groups = new Map<string, string[]>();
  for (const k of keys) {
    const a = refs[k];
    if (!a) continue;
    const id = `${authorPart(a).toLowerCase()}|${a.year}`;
    groups.set(id, [...(groups.get(id) ?? []), k]);
  }
  const out = new Map<string, string>();
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    [...members]
      .sort((x, y) => refs[x].title.localeCompare(refs[y].title))
      .forEach((k, i) => out.set(k, String.fromCharCode(97 + i)));
  }
  return out;
}

function numberList(nums: number[]): string {
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    if (j - i >= 2) parts.push(`${sorted[i]}–${sorted[j]}`);
    else for (let k = i; k <= j; k++) parts.push(String(sorted[k]));
    i = j + 1;
  }
  return parts.join(",");
}

export function citeLabel(keys: string[], style: CiteStyle, order: string[], refs: Refs): string {
  if (!keys.length) return "[?]";
  if (style === "vancouver") {
    return `[${numberList(keys.map((k) => order.indexOf(k) + 1).filter((n) => n > 0))}]`;
  }
  const suffix = yearSuffixes(order, refs);
  const parts = keys
    .map((k) => {
      const a = refs[k];
      return a ? `${authorPart(a)}, ${a.year || "n.d."}${suffix.get(k) ?? ""}` : "?";
    })
    .sort((x, y) => x.localeCompare(y));
  return `(${parts.join("; ")})`;
}

export interface ReferenceEntry {
  key: string;
  // "1" for Vancouver; empty for APA.
  number: string;
  text: string;
  missing: boolean;
}

// The reference list for the cited keys, in the order the style requires.
export function referenceEntries(order: string[], style: CiteStyle, refs: Refs): ReferenceEntry[] {
  const suffix = yearSuffixes(order, refs);
  const entries = order.map((key, i) => {
    const a = refs[key];
    if (!a) return { key, number: style === "vancouver" ? String(i + 1) : "", text: "[reference missing: it was removed from this document's library]", missing: true };
    let text = style === "vancouver" ? vancouver(a) : apa(a);
    const s = suffix.get(key);
    if (style === "apa" && s && a.year) text = text.replace(`(${a.year}).`, `(${a.year}${s}).`);
    return { key, number: style === "vancouver" ? String(i + 1) : "", text, missing: false };
  });
  if (style === "apa") {
    const sortKey = (e: ReferenceEntry) => `${refs[e.key] ? authorPart(refs[e.key]).toLowerCase() : "~"}|${refs[e.key]?.year ?? ""}|${suffix.get(e.key) ?? ""}`;
    entries.sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
  }
  return entries;
}

// Keep a copy of the cited papers inside the document, so a citation survives
// if the paper is later removed from the reading list.
export function addRefs(refs: Refs, articles: Article[]): Refs {
  const next = { ...refs };
  for (const a of articles) next[articleKey(a)] = a;
  return next;
}
