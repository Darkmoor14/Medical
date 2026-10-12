// Reading list and search history, kept in this browser only. Every access
// is wrapped: storage can be missing or blocked (private windows) and the
// app must keep working without it.

import { articleKey, type Article } from "../pubmed";
import { encodeState, type SearchState } from "./url-state";
import { EMPTY_FILTERS } from "./query";

const READING_KEY = "opm-reading-list-v1";
const LISTS_KEY = "opm-reading-lists-v2";
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

export interface ReadingListData {
  id: string;
  name: string;
  papers: SavedPaper[];
}
interface ListsState {
  active: string;
  lists: ReadingListData[];
}

export const DEFAULT_LIST_ID = "default";
export const DEFAULT_LIST_NAME = "My reading list";

type Listener = () => void;
const listeners = new Set<Listener>();
export function onReadingListChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = () => listeners.forEach((fn) => fn());

// Several named lists, one of them active. The first version of the app had a
// single list: it becomes the default list the first time this runs.
function loadState(): ListsState {
  const s = read<ListsState | null>(LISTS_KEY, null);
  if (s && Array.isArray(s.lists) && s.lists.length) {
    return { lists: s.lists, active: s.lists.some((l) => l.id === s.active) ? s.active : s.lists[0].id };
  }
  const legacy = read<SavedPaper[]>(READING_KEY, []);
  return { active: DEFAULT_LIST_ID, lists: [{ id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME, papers: legacy }] };
}
function saveState(s: ListsState): boolean {
  return write(LISTS_KEY, s);
}
const activeOf = (s: ListsState) => s.lists.find((l) => l.id === s.active)!;

export function readingList(): SavedPaper[] {
  return activeOf(loadState()).papers;
}

export function readingLists(): { id: string; name: string; count: number }[] {
  return loadState().lists.map((l) => ({ id: l.id, name: l.name, count: l.papers.length }));
}

export function activeList(): { id: string; name: string } {
  const l = activeOf(loadState());
  return { id: l.id, name: l.name };
}
export const activeListId = () => activeList().id;

export function setActiveList(id: string) {
  const s = loadState();
  if (!s.lists.some((l) => l.id === id) || s.active === id) return;
  s.active = id;
  saveState(s);
  notify();
}

// Creates an empty list and makes it the active one. Names are trimmed and de-duplicated.
export function createList(name: string): string {
  const s = loadState();
  const base = name.trim().slice(0, 60) || "New list";
  let unique = base;
  for (let i = 2; s.lists.some((l) => l.name.toLowerCase() === unique.toLowerCase()); i++) unique = `${base} (${i})`;
  const id = `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  s.lists.push({ id, name: unique, papers: [] });
  s.active = id;
  saveState(s);
  notify();
  return id;
}

export function renameList(id: string, name: string) {
  const s = loadState();
  const l = s.lists.find((x) => x.id === id);
  const clean = name.trim().slice(0, 60);
  if (!l || !clean) return;
  l.name = clean;
  saveState(s);
  notify();
}

// The last remaining list can't be deleted. Returns false if nothing was deleted.
export function deleteList(id: string): boolean {
  const s = loadState();
  if (s.lists.length < 2 || !s.lists.some((l) => l.id === id)) return false;
  s.lists = s.lists.filter((l) => l.id !== id);
  if (s.active === id) s.active = s.lists[0].id;
  saveState(s);
  try {
    localStorage.removeItem(listKey("opm-matrix-v1", id));
    localStorage.removeItem(listKey("opm-meta-v1", id));
  } catch {
    // Leftover data is harmless.
  }
  notify();
  return true;
}

// Per-list storage keys: the default list keeps the original key, so data saved
// before there were several lists is still found.
export function listKey(base: string, listId: string = activeListId()): string {
  return listId === DEFAULT_LIST_ID ? base : `${base}:${listId}`;
}

// Papers are identified by articleKey(): the PMID for PubMed papers, else the
// DOI (or another source id), so papers found through OpenAlex or Crossref
// can be saved too. All of these act on the active list.
export function isSaved(key: string): boolean {
  return readingList().some((p) => articleKey(p.article) === key);
}

function mutateActive(fn: (papers: SavedPaper[]) => SavedPaper[]) {
  const s = loadState();
  const l = activeOf(s);
  l.papers = fn(l.papers);
  saveState(s);
}

export function toggleSaved(article: Article): boolean {
  const key = articleKey(article);
  let added = false;
  mutateActive((list) => {
    const i = list.findIndex((p) => articleKey(p.article) === key);
    if (i >= 0) list.splice(i, 1);
    else {
      list.unshift({ article, note: "", addedAt: new Date().toISOString() });
      added = true;
    }
    return list;
  });
  notify();
  return added;
}

// Save a paper if it isn't already; returns true when it was added.
export function addSaved(article: Article): boolean {
  if (isSaved(articleKey(article))) return false;
  toggleSaved(article);
  return true;
}

export function removeSaved(key: string) {
  mutateActive((list) => list.filter((p) => articleKey(p.article) !== key));
  notify();
}

export function setNote(key: string, note: string) {
  mutateActive((list) => {
    const p = list.find((x) => articleKey(x.article) === key);
    if (p) p.note = note;
    return list;
  });
}

// Copy (or move) a paper of the active list to another list. Returns false if the
// other list already had it.
export function copyToList(key: string, targetId: string, move = false): boolean {
  const s = loadState();
  const from = activeOf(s);
  const to = s.lists.find((l) => l.id === targetId);
  const paper = from.papers.find((p) => articleKey(p.article) === key);
  if (!to || !paper || to === from) return false;
  const exists = to.papers.some((p) => articleKey(p.article) === key);
  if (!exists) to.papers.unshift({ ...paper });
  if (move) from.papers = from.papers.filter((p) => articleKey(p.article) !== key);
  saveState(s);
  notify();
  return !exists;
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
