// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { apa, referenceList, toBibtex, toCsv, toRis, vancouver } from "../../src/search/citations";
import { parseArticlesXml } from "../../src/pubmed";
import { EFETCH_XML } from "../fixtures";

const [a, b] = parseArticlesXml(EFETCH_XML);

describe("citation export", () => {
  it("writes RIS records", () => {
    const ris = toRis([a]);
    expect(ris).toContain("TY  - JOUR");
    expect(ris).toContain("AU  - Herrington, William G");
    expect(ris).toContain("AU  - EMPA-KIDNEY Group");
    expect(ris).toContain("TI  - Empagliflozin in chronic kidney disease");
    expect(ris).toContain("VL  - 388\r\nIS  - 2\r\nSP  - 117\r\nEP  - 127");
    expect(ris).toContain("DO  - 10.1056/example");
    expect(ris.trimEnd().endsWith("ER  -")).toBe(true);
  });

  it("writes BibTeX entries", () => {
    const bib = toBibtex([a]);
    expect(bib).toMatch(/^@article\{Herrington2023_111,/);
    expect(bib).toContain("author = {Herrington, William G and {EMPA-KIDNEY Group}}");
    expect(bib).toContain("pages = {117--127}");
  });

  it("writes CSV with a header", () => {
    const csv = toCsv([a, b]).split("\n");
    expect(csv[0]).toBe("pmid,title,authors,journal,year,volume,issue,pages,doi,publication_types,url");
    expect(csv).toHaveLength(3);
  });

  it("formats Vancouver and APA references", () => {
    expect(vancouver(a)).toBe(
      "Herrington WG, EMPA-KIDNEY Group. Empagliflozin in chronic kidney disease. N Engl J Med. 2023 Jan;388(2):117-127. doi:10.1056/example. PMID: 111.",
    );
    expect(apa(a)).toBe(
      "Herrington, W. G., & EMPA-KIDNEY Group (2023). Empagliflozin in chronic kidney disease. The New England journal of medicine, 388(2), 117-127. https://doi.org/10.1056/example",
    );
    expect(referenceList([a, b], "vancouver").split("\n")[1]).toMatch(/^2\. Smith J\. Metformin and eGFR\. Example Journal\. 2019\. PMID: 222\.$/);
  });
});
