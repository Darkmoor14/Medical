// Search state in the URL hash, so a search can be shared as a link and
// survives a reload: #q=…&n=50&s=relevance&f={…}

import { EMPTY_FILTERS, type Filters } from "./query";
import type { Sort } from "../pubmed";

export interface SearchState {
  query: string;
  count: number;
  sort: Sort;
  filters: Filters;
}

export function encodeState(st: SearchState): string {
  const p = new URLSearchParams();
  p.set("q", st.query);
  p.set("n", String(st.count));
  p.set("s", st.sort);
  const changed = Object.fromEntries(
    Object.entries(st.filters).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(EMPTY_FILTERS[k as keyof Filters])),
  );
  if (Object.keys(changed).length) p.set("f", JSON.stringify(changed));
  return `#${p.toString()}`;
}

export function decodeState(hash: string): SearchState | null {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const query = p.get("q");
  if (!query) return null;
  let filters: Filters = { ...EMPTY_FILTERS };
  try {
    const f = p.get("f");
    if (f) filters = { ...EMPTY_FILTERS, ...JSON.parse(f) };
  } catch {
    // Ignore a malformed filter part and keep the query.
  }
  const count = Number(p.get("n"));
  const sort = p.get("s") === "pub_date" ? "pub_date" : "relevance";
  return { query, count: Number.isFinite(count) && count > 0 ? count : 50, sort, filters };
}
