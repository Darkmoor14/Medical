// Documents written in the Write tab, saved in this browser only.

import type { Article } from "../pubmed";
import type { CiteStyle, DocNode, Refs } from "./cite";

const KEY = "opm-write-docs-v1";
const LAST_KEY = "opm-write-last-v1";

export interface WriteDoc {
  id: string;
  title: string;
  json: DocNode | null;
  style: CiteStyle;
  // Copies of the cited papers, so citations survive changes to the reading list.
  refs: Refs;
  updatedAt: string;
}

function read(): WriteDoc[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((d) => d && typeof d.id === "string") : [];
  } catch {
    return [];
  }
}

function write(list: WriteDoc[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function listDocs(): WriteDoc[] {
  return read().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function loadDoc(id: string): WriteDoc | null {
  return read().find((d) => d.id === id) ?? null;
}

// Returns false when the browser refused to store it (for example, it is full).
export function saveDoc(doc: WriteDoc): boolean {
  const list = read();
  const next = { ...doc, updatedAt: new Date().toISOString() };
  const i = list.findIndex((d) => d.id === doc.id);
  if (i >= 0) list[i] = next;
  else list.push(next);
  return write(list);
}

export function createDoc(title: string, json: DocNode | null): WriteDoc {
  const doc: WriteDoc = {
    id: `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    json,
    style: "vancouver",
    refs: {},
    updatedAt: new Date().toISOString(),
  };
  saveDoc(doc);
  return doc;
}

export function deleteDoc(id: string) {
  write(read().filter((d) => d.id !== id));
  if (lastDocId() === id) setLastDocId(null);
}

export function lastDocId(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

export function setLastDocId(id: string | null) {
  try {
    if (id) localStorage.setItem(LAST_KEY, id);
    else localStorage.removeItem(LAST_KEY);
  } catch {
    // Remembering the last document is a convenience only.
  }
}

export type { Article };
