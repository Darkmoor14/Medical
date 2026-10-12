// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  abstractFromInvertedIndex,
  articleFromCrossref,
  articleFromOpenAlex,
  lookupDoi,
  lookupIdentifier,
  parseIdentifier,
  searchOpenAlex,
} from "../../src/search/sources";
import { articleKey } from "../../src/pubmed";
import { EFETCH_XML } from "../fixtures";

const respond = (body: unknown, status = 200) =>
  (async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("parseIdentifier", () => {
  it("finds a DOI or PMID in pasted text", () => {
    expect(parseIdentifier("10.1056/NEJMoa2204233")).toEqual({ kind: "doi", value: "10.1056/nejmoa2204233" });
    expect(parseIdentifier("https://doi.org/10.1000/xyz123.")).toEqual({ kind: "doi", value: "10.1000/xyz123" });
    expect(parseIdentifier("doi: 10.1000/abc(1)")).toEqual({ kind: "doi", value: "10.1000/abc(1" });
    expect(parseIdentifier("PMID: 36331190")).toEqual({ kind: "pmid", value: "36331190" });
    expect(parseIdentifier("https://pubmed.ncbi.nlm.nih.gov/36331190/")).toEqual({ kind: "pmid", value: "36331190" });
    expect(parseIdentifier("heart failure")).toBeNull();
    expect(parseIdentifier("12")).toBeNull();
  });
});

describe("OpenAlex", () => {
  const work = {
    id: "https://openalex.org/W123",
    doi: "https://doi.org/10.1000/ABC",
    title: "Statins in <i>older</i> adults",
    publication_year: 2022,
    type: "article",
    is_retracted: false,
    authorships: [{ author: { display_name: "Maria Elena Popescu" } }, { author: { display_name: "John Smith" } }],
    primary_location: { source: { display_name: "The Lancet" } },
    biblio: { volume: "399", issue: "3", first_page: "100", last_page: "110" },
    abstract_inverted_index: { Statins: [0], reduce: [1], risk: [2], "in": [3], 12000: [4], patients: [5] },
    ids: { pmid: "https://pubmed.ncbi.nlm.nih.gov/35000001", pmcid: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC123456" },
  };

  it("rebuilds the abstract from the inverted index", () => {
    expect(abstractFromInvertedIndex(work.abstract_inverted_index)).toBe("Statins reduce risk in 12000 patients");
    expect(abstractFromInvertedIndex(null)).toBe("");
  });

  it("turns a work into an Article and keeps the PMID when it has one", () => {
    const a = articleFromOpenAlex(work);
    expect(a).toMatchObject({
      pmid: "35000001",
      pmcid: "PMC123456",
      title: "Statins in older adults",
      year: "2022",
      doi: "10.1000/abc",
      journal: "The Lancet",
      volume: "399",
      issue: "3",
      pages: "100-110",
      pubTypes: ["Journal Article"],
      authors: ["Popescu ME", "Smith J"],
    });
    expect(a.authorsFull[0]).toEqual({ last: "Popescu", fore: "Maria Elena", initials: "ME", collective: "" });
    expect(articleKey(a)).toBe("35000001");
  });

  it("falls back to the DOI, or the OpenAlex id, as the paper's key", () => {
    const noPmid = articleFromOpenAlex({ ...work, ids: {} });
    expect(articleKey(noPmid)).toBe("doi:10.1000/abc");
    expect(articleKey(articleFromOpenAlex({ ...work, ids: {}, doi: null }))).toBe("oa:W123");
  });

  it("marks retracted works and maps types", () => {
    expect(articleFromOpenAlex({ ...work, is_retracted: true }).retracted).toBe(true);
    expect(articleFromOpenAlex({ ...work, type: "preprint" }).pubTypes).toEqual(["Preprint"]);
  });

  it("searches and drops works without a title", async () => {
    let url = "";
    const fetchImpl = (async (u: string) => {
      url = u;
      return new Response(JSON.stringify({ results: [work, { id: "x" }] }));
    }) as unknown as typeof fetch;
    const found = await searchOpenAlex("statins elderly", { limit: 5, fetchImpl });
    expect(found).toHaveLength(1);
    expect(url).toContain("search=statins+elderly");
    expect(url).toContain("per-page=5");
    await expect(searchOpenAlex("x", { fetchImpl: respond("", 500) })).rejects.toThrow("OpenAlex request failed (500)");
  });
});

describe("Crossref and identifier lookup", () => {
  const message = {
    DOI: "10.1000/XYZ",
    title: ["A trial of <b>things</b>"],
    author: [{ given: "Ana", family: "Ionescu" }, { name: "TRIAL Group" }],
    "container-title": ["Journal of Things"],
    "short-container-title": ["J Things"],
    issued: { "date-parts": [[2021, 5]] },
    volume: "7",
    issue: "2",
    page: "10–19",
    abstract: "<jats:p>Abstract text here.</jats:p>",
    type: "journal-article",
  };

  it("reads a Crossref record", async () => {
    const a = await lookupDoi("10.1000/xyz", respond({ message }));
    expect(a).toMatchObject({ title: "A trial of things", doi: "10.1000/xyz", journal: "J Things", year: "2021", pages: "10-19", abstract: "Abstract text here." });
    expect(a.authors).toEqual(["Ionescu A", "TRIAL Group"]);
    expect(articleFromCrossref(message).sourceId).toBe("doi:10.1000/xyz");
  });

  it("explains a missing DOI", async () => {
    await expect(lookupDoi("10.1/none", respond("", 404))).rejects.toThrow("no record for that DOI");
  });

  it("looks up a PMID in PubMed and rejects other input", async () => {
    const a = await lookupIdentifier("PMID 111", { fetchImpl: respond(EFETCH_XML) });
    expect(a.pmid).toBe("111");
    await expect(lookupIdentifier("hello")).rejects.toThrow("doesn't look like a DOI");
    await expect(lookupIdentifier("999999", { fetchImpl: respond("<PubmedArticleSet></PubmedArticleSet>") })).rejects.toThrow("no record with PMID 999999");
  });
});
