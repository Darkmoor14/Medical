// Reference sources beyond a PubMed search: OpenAlex (search), Crossref
// (look up a DOI) and PubMed (look up a PMID). Every source is turned into the
// same Article record the rest of the app uses.

import { fetchArticles, type Article } from "../pubmed";

export type Identifier = { kind: "pmid"; value: string } | { kind: "doi"; value: string };

// Recognise a DOI or PMID in whatever a person pastes: a bare identifier,
// "doi:…", "PMID: …" or a doi.org / pubmed link.
export function parseIdentifier(input: string): Identifier | null {
  const text = input.trim();
  const doi = /\b(10\.\d{4,9}\/[^\s"<>]+)/i.exec(text);
  if (doi) return { kind: "doi", value: doi[1].replace(/[.,;)\]]+$/, "").toLowerCase() };
  // A labelled PMID can be short; a bare number needs at least four digits.
  const pmid =
    /^pmid:?\s*(\d{1,9})$/i.exec(text) ?? /^(\d{4,9})$/.exec(text) ?? /pubmed\.ncbi\.nlm\.nih\.gov\/(\d{1,9})/i.exec(text);
  return pmid ? { kind: "pmid", value: pmid[1] } : null;
}

function blank(): Article {
  return {
    pmid: "",
    title: "",
    abstract: "",
    authors: [],
    journal: "",
    year: "",
    pubTypes: [],
    doi: null,
    pmcid: null,
    journalTitle: "",
    volume: "",
    issue: "",
    pages: "",
    month: "",
    authorsFull: [],
    meshTerms: [],
    retracted: false,
    concern: false,
  };
}

function initialsOf(given: string): string {
  return given
    .split(/[\s.-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join("");
}

// "Maria Elena Popescu" → { last: "Popescu", fore: "Maria Elena", initials: "ME" }.
function personFromDisplayName(name: string) {
  const parts = name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts.pop()! : (parts[0] ?? "");
  const fore = parts.join(" ");
  return { last, fore, initials: initialsOf(fore), collective: "" };
}

function setAuthors(a: Article, people: { last: string; fore: string; initials: string; collective: string }[]) {
  a.authorsFull = people;
  a.authors = people.map((p) => p.collective || [p.last, p.initials].filter(Boolean).join(" "));
}

// --- OpenAlex ---------------------------------------------------------------

interface OpenAlexWork {
  id?: string;
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  type?: string | null;
  is_retracted?: boolean;
  authorships?: { author?: { display_name?: string } }[];
  primary_location?: { source?: { display_name?: string } | null } | null;
  biblio?: { volume?: string | null; issue?: string | null; first_page?: string | null; last_page?: string | null };
  abstract_inverted_index?: Record<string, number[]> | null;
  ids?: { pmid?: string | null; pmcid?: string | null };
}

export function abstractFromInvertedIndex(index: Record<string, number[]> | null | undefined): string {
  if (!index) return "";
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) for (const p of positions) words[p] = word;
  return words.filter((w) => w !== undefined).join(" ");
}

const OPENALEX_TYPES: Record<string, string> = {
  article: "Journal Article",
  review: "Review",
  preprint: "Preprint",
  letter: "Letter",
  editorial: "Editorial",
  "book-chapter": "Book Chapter",
  book: "Book",
  dissertation: "Dissertation",
};

function stripDoiUrl(doi: string | null | undefined): string | null {
  return doi ? doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").toLowerCase() : null;
}

export function articleFromOpenAlex(w: OpenAlexWork): Article {
  const a = blank();
  a.title = (w.title ?? w.display_name ?? "").replace(/<[^>]+>/g, "").trim();
  a.abstract = abstractFromInvertedIndex(w.abstract_inverted_index);
  a.year = w.publication_year ? String(w.publication_year) : "";
  a.doi = stripDoiUrl(w.doi);
  a.pmid = /(\d{4,9})\/?$/.exec(w.ids?.pmid ?? "")?.[1] ?? "";
  a.pmcid = /(PMC\d+)/i.exec(w.ids?.pmcid ?? "")?.[1] ?? null;
  a.journal = a.journalTitle = w.primary_location?.source?.display_name ?? "";
  a.volume = w.biblio?.volume ?? "";
  a.issue = w.biblio?.issue ?? "";
  const { first_page: fp, last_page: lp } = w.biblio ?? {};
  a.pages = fp ? (lp && lp !== fp ? `${fp}-${lp}` : fp) : "";
  a.pubTypes = [OPENALEX_TYPES[w.type ?? ""] ?? "Journal Article"];
  a.retracted = Boolean(w.is_retracted);
  a.sourceId = w.id ? `oa:${w.id.split("/").pop()}` : undefined;
  setAuthors(a, (w.authorships ?? []).map((s) => personFromDisplayName(s.author?.display_name ?? "")).filter((p) => p.last));
  return a;
}

export async function searchOpenAlex(
  query: string,
  opts: { limit?: number; fetchImpl?: typeof fetch } = {},
): Promise<Article[]> {
  const params = new URLSearchParams({
    search: query,
    "per-page": String(opts.limit ?? 20),
    select: "id,doi,title,display_name,publication_year,type,is_retracted,authorships,primary_location,biblio,abstract_inverted_index,ids",
  });
  const res = await (opts.fetchImpl ?? fetch)(`https://api.openalex.org/works?${params}`);
  if (!res.ok) throw new Error(`OpenAlex request failed (${res.status})`);
  const json = await res.json();
  return ((json.results ?? []) as OpenAlexWork[]).map(articleFromOpenAlex).filter((a) => a.title);
}

// --- Crossref ---------------------------------------------------------------

interface CrossrefWork {
  DOI?: string;
  title?: string[];
  author?: { given?: string; family?: string; name?: string }[];
  "container-title"?: string[];
  "short-container-title"?: string[];
  issued?: { "date-parts"?: (number | null)[][] };
  volume?: string;
  issue?: string;
  page?: string;
  abstract?: string;
  type?: string;
}

const CROSSREF_TYPES: Record<string, string> = {
  "journal-article": "Journal Article",
  "posted-content": "Preprint",
  "book-chapter": "Book Chapter",
  book: "Book",
  "proceedings-article": "Conference Paper",
};

export function articleFromCrossref(w: CrossrefWork): Article {
  const a = blank();
  a.title = (w.title?.[0] ?? "").replace(/<[^>]+>/g, "").trim();
  a.doi = w.DOI ? w.DOI.toLowerCase() : null;
  a.journalTitle = w["container-title"]?.[0] ?? "";
  a.journal = w["short-container-title"]?.[0] ?? a.journalTitle;
  a.year = String(w.issued?.["date-parts"]?.[0]?.[0] ?? "");
  a.volume = w.volume ?? "";
  a.issue = w.issue ?? "";
  a.pages = (w.page ?? "").replace(/–|—/g, "-");
  a.abstract = (w.abstract ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/^abstract\s*/i, "").trim();
  a.pubTypes = [CROSSREF_TYPES[w.type ?? ""] ?? "Journal Article"];
  a.sourceId = a.doi ? `doi:${a.doi}` : undefined;
  setAuthors(
    a,
    (w.author ?? []).map((p) =>
      p.name ? { last: "", fore: "", initials: "", collective: p.name } : { last: p.family ?? "", fore: p.given ?? "", initials: initialsOf(p.given ?? ""), collective: "" },
    ),
  );
  return a;
}

export async function lookupDoi(doi: string, fetchImpl: typeof fetch = fetch): Promise<Article> {
  const res = await fetchImpl(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  if (res.status === 404) throw new Error("Crossref has no record for that DOI.");
  if (!res.ok) throw new Error(`Crossref request failed (${res.status})`);
  const a = articleFromCrossref((await res.json()).message ?? {});
  if (!a.title) throw new Error("Crossref returned no title for that DOI.");
  return a;
}

// Resolve a pasted DOI or PMID to a full record.
export async function lookupIdentifier(
  input: string,
  opts: { apiKey?: string | null; fetchImpl?: typeof fetch } = {},
): Promise<Article> {
  const id = parseIdentifier(input);
  if (!id) throw new Error("That doesn't look like a DOI (10.xxxx/…) or a PubMed ID (digits).");
  if (id.kind === "doi") return lookupDoi(id.value, opts.fetchImpl);
  const [a] = await fetchArticles([id.value], { apiKey: opts.apiKey ?? null, fetchImpl: opts.fetchImpl });
  if (!a) throw new Error(`PubMed has no record with PMID ${id.value}.`);
  return a;
}
