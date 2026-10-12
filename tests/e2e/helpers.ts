import { type Page } from "@playwright/test";
import { EFETCH_XML } from "../fixtures";

// Fake engine: tags a fixed vocabulary with regexes instead of running models.
export async function installFakeEngine(page: Page) {
  await page.addInitScript(() => {
    const vocab: [RegExp, string][] = [
      [/chronic kidney disease|CKD/gi, "DISEASE"],
      [/empagliflozin|metformin|SGLT2 inhibitors/gi, "CHEM"],
    ];
    const find = (text: string) => {
      const out: { start: number; end: number; label: string; score: number }[] = [];
      for (const [re, label] of vocab) {
        for (const m of text.matchAll(re)) out.push({ start: m.index!, end: m.index! + m[0].length, label, score: 0.95 });
      }
      return out;
    };
    (window as unknown as Record<string, unknown>).__openmedTestEngine = {
      configure: async () => null,
      preload: async () => null,
      // Tests can hold the analysis back to check that papers show first.
      extractMany: async ({ docs }: { docs: { id: string; text: string }[] }) => {
        const w = window as unknown as { __holdAnalysis?: Promise<void> };
        if (w.__holdAnalysis) await w.__holdAnalysis;
        return docs.map((d) => ({ id: d.id, spans: find(d.text) }));
      },
    };
  });
}

export async function mockPubMed(page: Page, opts: { spelling?: string } = {}) {
  const requests: string[] = [];
  await page.route("https://eutils.ncbi.nlm.nih.gov/**", async (route) => {
    const req = route.request();
    const body = req.postData() ?? "";
    const params = new URLSearchParams(body);
    const json = (data: unknown) =>
      route.fulfill({ contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(data) });
    const xml = (data: string) =>
      route.fulfill({ contentType: "text/xml", headers: { "Access-Control-Allow-Origin": "*" }, body: data });
    if (req.url().includes("espell")) {
      return xml(`<eSpellResult><CorrectedQuery>${opts.spelling ?? ""}</CorrectedQuery></eSpellResult>`);
    }
    if (req.url().includes("elink")) {
      return json({ linksets: [{ linksetdbs: [{ linkname: "pubmed_pubmed", links: ["111", "222"] }] }] });
    }
    if (params.get("db") === "mesh") {
      if (req.url().includes("esearch")) return json({ esearchresult: { idlist: ["1", "2"] } });
      return json({ result: { "1": { ds_meshterms: ["Heart Failure"] }, "2": { ds_meshterms: ["Heart Failure, Diastolic"] } } });
    }
    requests.push(body);
    if (req.url().includes("esearch")) {
      return json({ esearchresult: { count: "1234", idlist: ["111", "222"], querytranslation: "translated by pubmed" } });
    }
    return xml(EFETCH_XML);
  });
  await page.route("https://icite.od.nih.gov/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ data: [{ pmid: 111, citation_count: 1200, relative_citation_ratio: 25.3 }, { pmid: 222, citation_count: 3 }] }),
    }),
  );
  return requests;
}


// OpenAlex and Crossref answers for the reference finder.
export async function mockSources(page: Page) {
  const cors = { "Access-Control-Allow-Origin": "*" };
  await page.route("https://api.openalex.org/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      headers: cors,
      body: JSON.stringify({
        results: [
          {
            id: "https://openalex.org/W123",
            doi: "https://doi.org/10.1000/statin",
            title: "Statins in older adults",
            publication_year: 2022,
            type: "article",
            authorships: [{ author: { display_name: "Maria Popescu" } }, { author: { display_name: "John Smith" } }],
            primary_location: { source: { display_name: "The Lancet" } },
            biblio: { volume: "399", issue: "3", first_page: "100", last_page: "110" },
            abstract_inverted_index: { Statins: [0], help: [1] },
            ids: {},
          },
        ],
      }),
    }),
  );
  await page.route("https://api.crossref.org/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      headers: cors,
      body: JSON.stringify({
        message: {
          DOI: "10.1000/xyz",
          title: ["A trial of things"],
          author: [{ given: "Ana", family: "Ionescu" }],
          "container-title": ["Journal of Things"],
          issued: { "date-parts": [[2021]] },
          volume: "7",
          type: "journal-article",
        },
      }),
    }),
  );
}
