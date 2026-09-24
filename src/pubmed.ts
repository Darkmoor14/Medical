// NCBI E-utilities client for PubMed (esearch, efetch, espell, elink, MeSH
// lookups) plus citation metrics from NIH iCite. Only search terms, PMIDs,
// paging and the optional API key are ever sent.

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const TOOL = "openmed-pubmed-explorer";

export interface Article {
  pmid: string;
  title: string;
  abstract: string;
  authors: string[];
  journal: string;
  year: string;
  pubTypes: string[];
  doi: string | null;
  pmcid: string | null;
  // Full citation details (for export and reference formatting).
  journalTitle: string;
  volume: string;
  issue: string;
  pages: string;
  month: string;
  authorsFull: { last: string; fore: string; initials: string; collective: string }[];
  meshTerms: string[];
  // Integrity notices linked to this article.
  retracted: boolean;
  concern: boolean;
}

export interface SearchResult {
  count: number;
  ids: string[];
  queryTranslation: string;
}

export type Sort = "relevance" | "pub_date";

let lastRequest = 0;

// NCBI allows 3 requests/second without a key and 10/second with one.
async function throttle(apiKey: string | null) {
  const gap = apiKey ? 110 : 350;
  const wait = lastRequest + gap - Date.now();
  lastRequest = Math.max(Date.now(), lastRequest + gap);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

async function eutils(
  path: string,
  params: Record<string, string>,
  apiKey: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  await throttle(apiKey);
  const body = new URLSearchParams({ ...params, tool: TOOL });
  if (apiKey) body.set("api_key", apiKey);
  // POST keeps long queries and id lists out of URLs and server logs.
  const res = await fetchImpl(`${EUTILS}/${path}`, { method: "POST", body });
  if (!res.ok) throw new Error(`PubMed request failed (${res.status})`);
  return res;
}

export async function searchPubMed(
  query: string,
  opts: { retmax?: number; sort?: Sort; apiKey?: string | null; fetchImpl?: typeof fetch } = {},
): Promise<SearchResult> {
  const res = await eutils(
    "esearch.fcgi",
    {
      db: "pubmed",
      term: query,
      retmode: "json",
      retmax: String(opts.retmax ?? 20),
      sort: opts.sort ?? "relevance",
    },
    opts.apiKey ?? null,
    opts.fetchImpl,
  );
  const json = await res.json();
  const r = json.esearchresult;
  if (!r) throw new Error("Unexpected PubMed response");
  if (r.ERROR) throw new Error(r.ERROR);
  return {
    count: Number(r.count ?? 0),
    ids: r.idlist ?? [],
    queryTranslation: r.querytranslation ?? "",
  };
}

export async function fetchArticles(
  ids: string[],
  opts: { apiKey?: string | null; fetchImpl?: typeof fetch } = {},
): Promise<Article[]> {
  const out: Article[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200);
    const res = await eutils(
      "efetch.fcgi",
      { db: "pubmed", id: batch.join(","), retmode: "xml" },
      opts.apiKey ?? null,
      opts.fetchImpl,
    );
    out.push(...parseArticlesXml(await res.text()));
  }
  // efetch does not guarantee order; restore the search ranking.
  const rank = new Map(ids.map((id, i) => [id, i]));
  return out.sort((a, b) => (rank.get(a.pmid) ?? 0) - (rank.get(b.pmid) ?? 0));
}

export function parseArticlesXml(xml: string): Article[] {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
  return [...doc.getElementsByTagName("PubmedArticle")].map((a) => {
    const abstractParts = [...a.querySelectorAll("Abstract > AbstractText")].map((p) => {
      const label = p.getAttribute("Label");
      const body = text(p);
      return label ? `${label}: ${body}` : body;
    });
    const authors = [...a.querySelectorAll("AuthorList > Author")]
      .map((au) => {
        const collective = text(au.querySelector("CollectiveName"));
        if (collective) return collective;
        const last = text(au.querySelector("LastName"));
        const initials = text(au.querySelector("Initials"));
        return [last, initials].filter(Boolean).join(" ");
      })
      .filter(Boolean);
    const pubDate = a.querySelector("Article > Journal > JournalIssue > PubDate");
    const year =
      text(pubDate?.querySelector("Year")) ||
      (text(pubDate?.querySelector("MedlineDate")).match(/\d{4}/)?.[0] ?? "");
    const idOf = (type: string) =>
      text(a.querySelector(`PubmedData > ArticleIdList > ArticleId[IdType="${type}"]`)) || null;
    const pubTypes = [...a.querySelectorAll("PublicationTypeList > PublicationType")].map((p) => text(p));
    const refTypes = [...a.querySelectorAll("CommentsCorrectionsList > CommentsCorrections")].map(
      (c) => c.getAttribute("RefType") ?? "",
    );
    return {
      pmid: text(a.querySelector("MedlineCitation > PMID")),
      title: text(a.querySelector("Article > ArticleTitle")),
      abstract: abstractParts.join("\n"),
      authors,
      journal:
        text(a.querySelector("Article > Journal > ISOAbbreviation")) ||
        text(a.querySelector("Article > Journal > Title")),
      year,
      pubTypes,
      doi: idOf("doi"),
      pmcid: idOf("pmc"),
      journalTitle: text(a.querySelector("Article > Journal > Title")),
      volume: text(a.querySelector("Article > Journal > JournalIssue > Volume")),
      issue: text(a.querySelector("Article > Journal > JournalIssue > Issue")),
      pages: text(a.querySelector("Article > Pagination > MedlinePgn")),
      month: text(pubDate?.querySelector("Month")),
      authorsFull: [...a.querySelectorAll("AuthorList > Author")].map((au) => ({
        last: text(au.querySelector("LastName")),
        fore: text(au.querySelector("ForeName")),
        initials: text(au.querySelector("Initials")),
        collective: text(au.querySelector("CollectiveName")),
      })),
      meshTerms: [...a.querySelectorAll("MeshHeadingList > MeshHeading > DescriptorName")].map((d) => text(d)),
      retracted: pubTypes.includes("Retracted Publication") || refTypes.includes("RetractionIn"),
      concern: refTypes.includes("ExpressionOfConcernIn"),
    };
  });
}

export function pubmedUrl(pmid: string): string {
  return `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(pmid)}/`;
}

export function pubmedSearchUrl(query: string): string {
  return `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(query)}`;
}

// PubMed's spelling suggestion for a query ("" when it has none).
export async function spellCheck(
  query: string,
  opts: { apiKey?: string | null; fetchImpl?: typeof fetch } = {},
): Promise<string> {
  const res = await eutils("espell.fcgi", { db: "pubmed", term: query }, opts.apiKey ?? null, opts.fetchImpl);
  const doc = new DOMParser().parseFromString(await res.text(), "text/xml");
  const corrected = doc.querySelector("CorrectedQuery")?.textContent?.trim() ?? "";
  return corrected && corrected.toLowerCase() !== query.trim().toLowerCase() ? corrected : "";
}

// MeSH headings matching what the user is typing.
export async function meshSuggestions(
  prefix: string,
  opts: { apiKey?: string | null; fetchImpl?: typeof fetch; limit?: number } = {},
): Promise<string[]> {
  const term = prefix.trim();
  if (term.length < 3) return [];
  const search = await eutils(
    "esearch.fcgi",
    { db: "mesh", term: `${term}*`, retmode: "json", retmax: String(opts.limit ?? 8) },
    opts.apiKey ?? null,
    opts.fetchImpl,
  );
  const ids: string[] = (await search.json()).esearchresult?.idlist ?? [];
  if (!ids.length) return [];
  const summary = await eutils(
    "esummary.fcgi",
    { db: "mesh", id: ids.join(","), retmode: "json" },
    opts.apiKey ?? null,
    opts.fetchImpl,
  );
  const result = (await summary.json()).result ?? {};
  return ids
    .map((id) => result[id]?.ds_meshterms?.[0] as string | undefined)
    .filter((t): t is string => Boolean(t));
}

export type LinkKind = "similar" | "citedBy";

// Related PubMed records: similar articles, or articles citing this one.
export async function linkedArticles(
  pmid: string,
  kind: LinkKind,
  opts: { apiKey?: string | null; fetchImpl?: typeof fetch; limit?: number } = {},
): Promise<string[]> {
  const linkname = kind === "similar" ? "pubmed_pubmed" : "pubmed_pubmed_citedin";
  const res = await eutils(
    "elink.fcgi",
    { dbfrom: "pubmed", db: "pubmed", id: pmid, linkname, retmode: "json" },
    opts.apiKey ?? null,
    opts.fetchImpl,
  );
  const json = await res.json();
  const ids: string[] =
    json.linksets?.[0]?.linksetdbs?.find((l: { linkname: string }) => l.linkname === linkname)?.links ?? [];
  return ids.filter((id) => id !== pmid).slice(0, opts.limit ?? 50);
}

export interface Metrics {
  citations: number;
  rcr: number | null;
}

// Citation counts and Relative Citation Ratio from NIH iCite. Returns an
// empty map if iCite is unreachable, so results still work without it.
export async function citationMetrics(
  pmids: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, Metrics>> {
  const out = new Map<string, Metrics>();
  for (let i = 0; i < pmids.length; i += 200) {
    const batch = pmids.slice(i, i + 200);
    try {
      const res = await fetchImpl(
        `https://icite.od.nih.gov/api/pubs?pmids=${batch.join(",")}&fl=pmid,citation_count,relative_citation_ratio`,
      );
      if (!res.ok) continue;
      const json = await res.json();
      for (const d of json.data ?? []) {
        out.set(String(d.pmid), { citations: Number(d.citation_count ?? 0), rcr: d.relative_citation_ratio ?? null });
      }
    } catch {
      // iCite is optional.
    }
  }
  return out;
}
