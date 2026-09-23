// Minimal NCBI E-utilities client (esearch + efetch) for PubMed.
// Only the query string, paging and optional API key are ever sent.

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
    return {
      pmid: text(a.querySelector("MedlineCitation > PMID")),
      title: text(a.querySelector("Article > ArticleTitle")),
      abstract: abstractParts.join("\n"),
      authors,
      journal:
        text(a.querySelector("Article > Journal > ISOAbbreviation")) ||
        text(a.querySelector("Article > Journal > Title")),
      year,
      pubTypes: [...a.querySelectorAll("PublicationTypeList > PublicationType")].map((p) => text(p)),
      doi: idOf("doi"),
      pmcid: idOf("pmc"),
    };
  });
}

export function pubmedUrl(pmid: string): string {
  return `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(pmid)}/`;
}

export function pubmedSearchUrl(query: string): string {
  return `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(query)}`;
}
