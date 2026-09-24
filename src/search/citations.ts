// Citation export: RIS (Zotero, EndNote, Mendeley), BibTeX, CSV and
// formatted references (Vancouver, APA).

import type { Article } from "../pubmed";

const stripPeriod = (s: string) => s.replace(/\.\s*$/, "");

function authorsOf(a: Article) {
  return a.authorsFull.length
    ? a.authorsFull
    : a.authors.map((name) => {
        const [last, initials = ""] = name.split(" ");
        return { last, fore: "", initials, collective: "" };
      });
}

export function toRis(articles: Article[]): string {
  return articles
    .map((a) => {
      const lines = ["TY  - JOUR"];
      for (const au of authorsOf(a)) {
        lines.push(`AU  - ${au.collective || [au.last, au.fore || au.initials].filter(Boolean).join(", ")}`);
      }
      lines.push(`TI  - ${stripPeriod(a.title)}`);
      if (a.journalTitle || a.journal) lines.push(`T2  - ${a.journalTitle || a.journal}`);
      if (a.journal) lines.push(`J2  - ${a.journal}`);
      if (a.year) lines.push(`PY  - ${a.year}`);
      if (a.volume) lines.push(`VL  - ${a.volume}`);
      if (a.issue) lines.push(`IS  - ${a.issue}`);
      if (a.pages) {
        const [sp, ep] = a.pages.split("-");
        lines.push(`SP  - ${sp}`);
        if (ep) lines.push(`EP  - ${ep}`);
      }
      if (a.doi) lines.push(`DO  - ${a.doi}`);
      if (a.abstract) lines.push(`AB  - ${a.abstract.replace(/\n/g, " ")}`);
      for (const kw of a.meshTerms) lines.push(`KW  - ${kw}`);
      lines.push(`AN  - PMID:${a.pmid}`);
      lines.push(`UR  - https://pubmed.ncbi.nlm.nih.gov/${a.pmid}/`);
      lines.push("ER  - ");
      return lines.join("\r\n");
    })
    .join("\r\n\r\n");
}

function bibEscape(s: string): string {
  return s.replace(/([{}&%$#_])/g, "\\$1");
}

export function toBibtex(articles: Article[]): string {
  return articles
    .map((a) => {
      const first = authorsOf(a)[0];
      const key = `${(first?.last || first?.collective || "pmid").replace(/[^A-Za-z]/g, "")}${a.year}_${a.pmid}`;
      const fields: [string, string][] = [
        [
          "author",
          authorsOf(a)
            .map((au) => (au.collective ? `{${bibEscape(au.collective)}}` : bibEscape(`${au.last}, ${au.fore || au.initials}`)))
            .join(" and "),
        ],
        // Double braces keep the title's capitalisation.
        ["title", `{${bibEscape(stripPeriod(a.title))}}`],
        ["journal", a.journalTitle || a.journal],
        ["year", a.year],
        ["volume", a.volume],
        ["number", a.issue],
        ["pages", a.pages.replace("-", "--")],
        ["doi", a.doi ?? ""],
        ["pmid", a.pmid],
      ];
      const body = fields
        .filter(([, v]) => v)
        .map(([k, v]) => `  ${k} = {${k === "title" || k === "author" ? v : bibEscape(v)}}`)
        .join(",\n");
      return `@article{${key},\n${body}\n}`;
    })
    .join("\n\n");
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(articles: Article[]): string {
  const header = ["pmid", "title", "authors", "journal", "year", "volume", "issue", "pages", "doi", "publication_types", "url"];
  const rows = articles.map((a) => [
    a.pmid,
    stripPeriod(a.title),
    a.authors.join("; "),
    a.journal,
    a.year,
    a.volume,
    a.issue,
    a.pages,
    a.doi ?? "",
    a.pubTypes.join("; "),
    `https://pubmed.ncbi.nlm.nih.gov/${a.pmid}/`,
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}

// Vancouver (ICMJE / NLM) style.
export function vancouver(a: Article): string {
  const names = authorsOf(a).map((au) => au.collective || `${au.last} ${au.initials}`.trim());
  const authors = names.length > 6 ? `${names.slice(0, 6).join(", ")}, et al.` : `${names.join(", ")}.`;
  const month = a.month ? ` ${a.month}` : "";
  const vol = a.volume ? `;${a.volume}${a.issue ? `(${a.issue})` : ""}` : "";
  const pages = a.pages ? `:${a.pages}` : "";
  const doi = a.doi ? ` doi:${a.doi}.` : "";
  return `${authors} ${stripPeriod(a.title)}. ${a.journal}. ${a.year}${month}${vol}${pages}.${doi} PMID: ${a.pmid}.`.replace(/\s+/g, " ");
}

// APA 7th edition style.
export function apa(a: Article): string {
  const authors = authorsOf(a).map((au) =>
    au.collective ? au.collective : `${au.last}, ${(au.initials || "").split("").map((c) => `${c}.`).join(" ")}`,
  );
  const list =
    authors.length === 0
      ? ""
      : authors.length === 1
        ? authors[0]
        : authors.length <= 20
          ? `${authors.slice(0, -1).join(", ")}, & ${authors.at(-1)}`
          : `${authors.slice(0, 19).join(", ")}, … ${authors.at(-1)}`;
  const vol = a.volume ? `, ${a.volume}${a.issue ? `(${a.issue})` : ""}` : "";
  const pages = a.pages ? `, ${a.pages}` : "";
  const doi = a.doi ? ` https://doi.org/${a.doi}` : ` https://pubmed.ncbi.nlm.nih.gov/${a.pmid}/`;
  return `${list} (${a.year || "n.d."}). ${stripPeriod(a.title)}. ${a.journalTitle || a.journal}${vol}${pages}.${doi}`.trim();
}

export function referenceList(articles: Article[], style: "vancouver" | "apa"): string {
  return articles.map((a, i) => (style === "vancouver" ? `${i + 1}. ${vancouver(a)}` : apa(a))).join("\n");
}

