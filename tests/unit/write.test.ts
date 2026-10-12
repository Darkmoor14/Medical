import { describe, expect, it } from "vitest";
import mammoth from "mammoth";
import { Packer } from "docx";
import { citationOrder, citeLabel, referenceEntries, yearSuffixes, type DocNode, type Refs } from "../../src/write/cite";
import { toModel } from "../../src/write/blocks";
import { buildDocx, referencesBibtex, texEscape, toHtml, toLatex, toMarkdown, wordCount } from "../../src/write/export";
import type { Article } from "../../src/pubmed";

const person = (last: string, fore: string) => ({ last, fore, initials: fore[0] ?? "", collective: "" });
const art = (pmid: string, title: string, year: string, authors: ReturnType<typeof person>[], extra: Partial<Article> = {}): Article => ({
  pmid,
  title,
  abstract: "",
  authors: authors.map((a) => `${a.last} ${a.initials}`),
  journal: "N Engl J Med",
  year,
  pubTypes: ["Journal Article"],
  doi: null,
  pmcid: null,
  journalTitle: "N Engl J Med",
  volume: "388",
  issue: "2",
  pages: "117-127",
  month: "",
  authorsFull: authors,
  meshTerms: [],
  retracted: false,
  concern: false,
  ...extra,
});

const refs: Refs = {
  "111": art("111", "Empagliflozin in chronic kidney disease.", "2023", [person("Herrington", "William"), person("Baker", "Anna")]),
  "222": art("222", "Metformin and eGFR.", "2019", [person("Smith", "John")], { doi: "10.1000/xyz" }),
  "333": art("333", "Third paper", "2021", [person("Lee", "A"), person("Kim", "B"), person("Park", "C")]),
};

const text = (t: string, marks?: { type: string; attrs?: Record<string, unknown> }[]): DocNode => ({ type: "text", text: t, marks });
const cite = (...keys: string[]): DocNode => ({ type: "citation", attrs: { keys } });
const doc: DocNode = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [text("Introduction")] },
    { type: "paragraph", content: [text("SGLT2 inhibitors slow progression "), cite("222"), text(" and "), text("matter", [{ type: "bold" }]), text(" a lot "), cite("111", "222")] },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [text("First point ")] }] }, { type: "listItem", content: [{ type: "paragraph", content: [text("Second & more "), cite("333")] }] }] },
    { type: "orderedList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [text("Step one")] }] }] },
    { type: "blockquote", content: [{ type: "paragraph", content: [text("A quote")] }] },
    { type: "paragraph", content: [text("See "), text("the site", [{ type: "link", attrs: { href: "https://example.org/a_b" } }])] },
  ],
};

describe("citation numbering and labels", () => {
  it("numbers citations in order of first appearance", () => {
    expect(citationOrder(doc)).toEqual(["222", "111", "333"]);
  });

  it("formats Vancouver labels with ranges", () => {
    const order = ["222", "111", "333", "444"];
    expect(citeLabel(["111"], "vancouver", order, refs)).toBe("[2]");
    expect(citeLabel(["111", "222"], "vancouver", order, refs)).toBe("[1,2]");
    expect(citeLabel(["222", "111", "333"], "vancouver", order, refs)).toBe("[1–3]");
    expect(citeLabel(["444", "222"], "vancouver", order, refs)).toBe("[1,4]");
    expect(citeLabel([], "vancouver", order, refs)).toBe("[?]");
  });

  it("formats APA labels and sorts multiple citations", () => {
    const order = ["222", "111", "333"];
    expect(citeLabel(["111"], "apa", order, refs)).toBe("(Herrington & Baker, 2023)");
    expect(citeLabel(["333"], "apa", order, refs)).toBe("(Lee et al., 2021)");
    expect(citeLabel(["222", "111"], "apa", order, refs)).toBe("(Herrington & Baker, 2023; Smith, 2019)");
  });

  it("adds a, b to papers with the same first author and year", () => {
    const same: Refs = {
      a: art("a", "Beta study", "2020", [person("Smith", "J")]),
      b: art("b", "Alpha study", "2020", [person("Smith", "J")]),
    };
    const sfx = yearSuffixes(["a", "b"], same);
    expect(sfx.get("b")).toBe("a");
    expect(sfx.get("a")).toBe("b");
    expect(citeLabel(["a"], "apa", ["a", "b"], same)).toBe("(Smith, 2020b)");
    expect(referenceEntries(["a", "b"], "apa", same)[0].text).toContain("(2020a).");
  });

  it("orders references by use (Vancouver) or alphabetically (APA)", () => {
    const order = citationOrder(doc);
    expect(referenceEntries(order, "vancouver", refs).map((r) => `${r.number}:${r.key}`)).toEqual(["1:222", "2:111", "3:333"]);
    expect(referenceEntries(order, "apa", refs).map((r) => r.key)).toEqual(["111", "333", "222"]);
    expect(referenceEntries(["999"], "vancouver", refs)[0].missing).toBe(true);
  });
});

describe("exports", () => {
  const model = toModel(doc, "My review", "vancouver", refs);

  it("writes Markdown with numbered references", () => {
    const md = toMarkdown(model);
    expect(md).toContain("# My review");
    expect(md).toContain("# Introduction");
    expect(md).toContain("SGLT2 inhibitors slow progression [1] and **matter** a lot [1,2]");
    expect(md).toContain("- First point \n- Second & more [3]");
    expect(md).toContain("1. Step one");
    expect(md).toContain("> A quote");
    expect(md).toContain("[the site](https://example.org/a_b)");
    expect(md).toMatch(/## References\n\n1\. Smith J\. Metformin and eGFR\./);
  });

  it("writes LaTeX with \\cite and a bibliography", () => {
    const tex = toLatex(model);
    expect(tex).toContain("\\title{My review}");
    expect(tex).toContain("\\section{Introduction}");
    expect(tex).toContain("\\cite{Smith2019_222}");
    expect(tex).toContain("\\cite{Herrington2023_111,Smith2019_222}");
    expect(tex).toContain("\\begin{thebibliography}{9}");
    expect(tex).toContain("\\bibitem{Smith2019_222}");
    expect(tex).toContain("Second \\& more");
    expect(tex).toContain("\\href{https://example.org/a_b}{the site}");
    expect(tex).not.toContain("natbib");
    expect(texEscape("50% of #1_a")).toBe("50\\% of \\#1\\_a");
  });

  it("uses natbib for author–year LaTeX", () => {
    const tex = toLatex(toModel(doc, "", "apa", refs));
    expect(tex).toContain("\\usepackage[round]{natbib}");
    expect(tex).toContain("\\citep{Smith2019_222}");
    expect(tex).toContain("\\bibitem[Herrington \\& Baker(2023)]{Herrington2023_111}");
  });

  it("renders escaped HTML and counts words", () => {
    const html = toHtml(model);
    expect(html).toContain('<span class="cite">[1]</span>');
    expect(html).toContain("<strong>matter</strong>");
    expect(html).toContain("<h2>References</h2>");
    expect(toHtml(toModel({ type: "doc", content: [{ type: "paragraph", content: [text("<script>x</script>")] }] }, "", "apa", {}))).toContain("&lt;script&gt;");
    expect(wordCount(model)).toBeGreaterThan(15);
  });

  it("exports the cited references as BibTeX", () => {
    const bib = referencesBibtex(model);
    expect(bib.match(/@article/g)).toHaveLength(3);
    expect(bib).toContain("@article{Smith2019_222,");
  });

  it("builds a Word file with the text, citations and reference list", async () => {
    const buf = await Packer.toBuffer(await buildDocx(model));
    const { value } = await mammoth.extractRawText({ buffer: buf });
    expect(value).toContain("My review");
    expect(value).toContain("Introduction");
    expect(value).toContain("SGLT2 inhibitors slow progression [1] and matter a lot [1,2]");
    expect(value).toContain("First point");
    expect(value).toContain("References");
    expect(value).toContain("1. Smith J. Metformin and eGFR.");
    expect(value).toContain("3. Lee A, Kim B, Park C.");
    const html = (await mammoth.convertToHtml({ buffer: buf })).value;
    expect(html).toContain("<strong>matter</strong>");
    expect(html).toContain('<a href="https://example.org/a_b">the site</a>');
    expect(html).toMatch(/<ul>.*First point.*<\/ul>/s);
    expect(html).toMatch(/<ol>.*Step one.*<\/ol>/s);
  });
});
