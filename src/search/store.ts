// Reading list and search history, kept in this browser only. Every access
// is wrapped: storage can be missing or blocked (private windows) and the
// app must keep working without it.

import { articleKey, type Article } from "../pubmed";
import { encodeState, type SearchState } from "./url-state";
import { EMPTY_FILTERS } from "./query";

const READING_KEY = "opm-reading-list-v1";
const HISTORY_KEY = "opm-search-history-v1";
const MAX_HISTORY = 30;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export interface SavedPaper {
  article: Article;
  note: string;
  addedAt: string;
}

type Listener = () => void;
const listeners = new Set<Listener>();
export function onReadingListChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = () => listeners.forEach((fn) => fn());

export function readingList(): SavedPaper[] {
  return read<SavedPaper[]>(READING_KEY, []);
}

// Papers are identified by articleKey(): the PMID for PubMed papers, else the
// DOI (or another source id), so papers found through OpenAlex or Crossref
// can be saved too.
export function isSaved(key: string): boolean {
  return readingList().some((p) => articleKey(p.article) === key);
}

export function toggleSaved(article: Article): boolean {
  const list = readingList();
  const key = articleKey(article);
  const i = list.findIndex((p) => articleKey(p.article) === key);
  if (i >= 0) list.splice(i, 1);
  else list.unshift({ article, note: "", addedAt: new Date().toISOString() });
  write(READING_KEY, list);
  notify();
  return i < 0;
}

// Save a paper if it isn't already; returns true when it was added.
export function addSaved(article: Article): boolean {
  if (isSaved(articleKey(article))) return false;
  toggleSaved(article);
  return true;
}

export function removeSaved(key: string) {
  write(
    READING_KEY,
    readingList().filter((p) => articleKey(p.article) !== key),
  );
  notify();
}

export function setNote(key: string, note: string) {
  const list = readingList();
  const p = list.find((x) => articleKey(x.article) === key);
  if (!p) return;
  p.note = note;
  write(READING_KEY, list);
}

export interface HistoryEntry {
  key: string;
  state: SearchState;
  date: string;
  total: number;
  pmids: string[];
}

// Entries saved by older versions may lack newer filter fields.
export function searchHistory(): HistoryEntry[] {
  const entries = read<HistoryEntry[]>(HISTORY_KEY, []);
  return Array.isArray(entries)
    ? entries
        .filter((e) => e && typeof e.state?.query === "string")
        .map((e) => ({ ...e, pmids: e.pmids ?? [], state: { ...e.state, filters: { ...EMPTY_FILTERS, ...e.state.filters } } }))
    : [];
}

// Record a search and return the previous run of the same search, if any,
// so new papers can be marked.
export function recordSearch(state: SearchState, total: number, pmids: string[]): HistoryEntry | null {
  const key = encodeState({ ...state, count: 0 });
  const history = searchHistory();
  const previous = history.find((h) => h.key === key) ?? null;
  const next = [
    { key, state, date: new Date().toISOString(), total, pmids },
    ...history.filter((h) => h.key !== key),
  ].slice(0, MAX_HISTORY);
  write(HISTORY_KEY, next);
  return previous;
}

export function clearHistory() {
  write(HISTORY_KEY, []);
}
