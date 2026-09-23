// PubMed query construction and a last-line PHI guard.

import { CATEGORY_ORDER, type Category } from "./models";

export interface QueryTerm {
  text: string;
  category: Category;
}

export interface QueryFilters {
  years?: number | null;
  reviewsOnly?: boolean;
  trialsOnly?: boolean;
  humansOnly?: boolean;
  englishOnly?: boolean;
}

function quote(term: string): string {
  const clean = term.replace(/["[\]]/g, " ").replace(/\s+/g, " ").trim();
  return `"${clean}"[tiab]`;
}

// Terms in the same category are OR'd; categories are AND'd together.
export function buildQuery(terms: QueryTerm[], filters: QueryFilters = {}): string {
  const byCat = new Map<Category, string[]>();
  for (const t of terms) {
    const list = byCat.get(t.category) ?? [];
    const q = quote(t.text);
    if (!list.includes(q)) list.push(q);
    byCat.set(t.category, list);
  }
  const groups = CATEGORY_ORDER.filter((c) => byCat.has(c)).map((c) => {
    const list = byCat.get(c)!;
    return list.length === 1 ? list[0] : `(${list.join(" OR ")})`;
  });
  const parts = [...groups];
  if (filters.reviewsOnly) parts.push("(review[pt] OR systematic review[pt] OR meta-analysis[pt])");
  if (filters.trialsOnly) parts.push("(randomized controlled trial[pt] OR clinical trial[pt])");
  if (filters.humansOnly) parts.push("humans[mh]");
  if (filters.englishOnly) parts.push("english[la]");
  if (filters.years) parts.push(`"last ${filters.years} years"[dp]`);
  return parts.join(" AND ");
}

// Returns the PHI fragments found in `query`. PII spans shorter than three
// characters are ignored to avoid false positives on things like ages.
export function findPhiInQuery(query: string, phiValues: string[]): string[] {
  const q = query.toLowerCase();
  const hits = new Set<string>();
  for (const value of phiValues) {
    const v = value.trim().toLowerCase();
    if (v.length < 3) continue;
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(v)}($|[^\\p{L}\\p{N}])`, "u");
    if (pattern.test(q)) hits.add(value.trim());
  }
  return [...hits];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
