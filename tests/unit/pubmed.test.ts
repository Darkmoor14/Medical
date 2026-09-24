// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
  citationMetrics,
  fetchArticles,
  linkedArticles,
  meshSuggestions,
  parseArticlesXml,
  searchPubMed,
  spellCheck,
} from "../../src/pubmed";
import { EFETCH_XML } from "../fixtures";

describe("parseArticlesXml", () => {
  it("extracts citation fields and structured abstracts", () => {
    const [a, b] = parseArticlesXml(EFETCH_XML);
    expect(a).toMatchObject({
      pmid: "111",
      title: "Empagliflozin in chronic kidney disease.",
      journal: "N Engl J Med",
      year: "2023",
      doi: "10.1056/example",
      pmcid: "PMC999",
      authors: ["Herrington WG", "EMPA-KIDNEY Group"],
      pubTypes: ["Journal Article", "Randomized Controlled Trial"],
    });
    expect(a.abstract).toBe("BACKGROUND: SGLT2 inhibitors slow CKD.\nRESULTS: Fewer events with empagliflozin.");
    expect(b.year).toBe("2019");
    expect(b.abstract).toBe("");
    expect(a).toMatchObject({
      journalTitle: "The New England journal of medicine",
      volume: "388",
      issue: "2",
      pages: "117-127",
      month: "Jan",
      meshTerms: ["Renal Insufficiency, Chronic", "Humans"],
      retracted: false,
    });
    expect(a.authorsFull[0]).toEqual({ last: "Herrington", fore: "William G", initials: "WG", collective: "" });
    expect(b.retracted).toBe(true);
  });
});

describe("E-utilities calls", () => {
  it("POSTs the query and parses esearch JSON", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = init.body as URLSearchParams;
      expect(body.get("term")).toBe("asthma");
      expect(body.get("db")).toBe("pubmed");
      expect(body.has("api_key")).toBe(false);
      return new Response(
        JSON.stringify({ esearchresult: { count: "2", idlist: ["222", "111"], querytranslation: "asthma[All]" } }),
      );
    });
    const r = await searchPubMed("asthma", { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toEqual({ count: 2, ids: ["222", "111"], queryTranslation: "asthma[All]" });
    expect(fetchImpl.mock.calls[0][0]).toMatch(/esearch\.fcgi$/);
  });

  it("returns efetch results in search-rank order", async () => {
    const fetchImpl = vi.fn(async () => new Response(EFETCH_XML));
    const arts = await fetchArticles(["222", "111"], {
      apiKey: "k",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(arts.map((a) => a.pmid)).toEqual(["222", "111"]);
    const body = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams;
    expect(body.get("api_key")).toBe("k");
  });

  it("surfaces esearch errors", async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ esearchresult: { ERROR: "Invalid query" } }));
    await expect(searchPubMed("((", { fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toThrow(
      "Invalid query",
    );
  });
});

describe("search helpers", () => {
  const respond = (body: string | object) =>
    (async () => new Response(typeof body === "string" ? body : JSON.stringify(body))) as unknown as typeof fetch;

  it("returns PubMed's spelling correction only when it differs", async () => {
    const xml = (q: string) => `<eSpellResult><Query>x</Query><CorrectedQuery>${q}</CorrectedQuery></eSpellResult>`;
    expect(await spellCheck("diabtes", { fetchImpl: respond(xml("diabetes")) })).toBe("diabetes");
    expect(await spellCheck("diabetes", { fetchImpl: respond(xml("diabetes")) })).toBe("");
    expect(await spellCheck("zzz", { fetchImpl: respond(xml("")) })).toBe("");
  });

  it("looks up MeSH headings", async () => {
    let call = 0;
    const fetchImpl = (async () => {
      call++;
      return new Response(
        JSON.stringify(
          call === 1
            ? { esearchresult: { idlist: ["1", "2"] } }
            : { result: { "1": { ds_meshterms: ["Heart Failure", "Cardiac Failure"] }, "2": { ds_meshterms: ["Heart Failure, Diastolic"] } } },
        ),
      );
    }) as unknown as typeof fetch;
    expect(await meshSuggestions("heart fail", { fetchImpl })).toEqual(["Heart Failure", "Heart Failure, Diastolic"]);
    expect(await meshSuggestions("he", { fetchImpl })).toEqual([]);
  });

  it("reads similar and citing articles from elink", async () => {
    const json = {
      linksets: [{ linksetdbs: [{ linkname: "pubmed_pubmed_citedin", links: ["5", "6"] }, { linkname: "pubmed_pubmed", links: ["111", "7"] }] }],
    };
    expect(await linkedArticles("111", "similar", { fetchImpl: respond(json) })).toEqual(["7"]);
    expect(await linkedArticles("111", "citedBy", { fetchImpl: respond(json) })).toEqual(["5", "6"]);
  });

  it("reads iCite metrics and tolerates failures", async () => {
    const ok = respond({ data: [{ pmid: 111, citation_count: 42, relative_citation_ratio: 3.1 }] });
    expect((await citationMetrics(["111"], ok)).get("111")).toEqual({ citations: 42, rcr: 3.1 });
    const broken = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect((await citationMetrics(["111"], broken)).size).toBe(0);
  });
});
