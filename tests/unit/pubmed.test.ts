// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { fetchArticles, parseArticlesXml, searchPubMed } from "../../src/pubmed";
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
