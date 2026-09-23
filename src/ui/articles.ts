import { h } from "./dom";
import { pubmedUrl, type Article } from "../pubmed";
import type { Entity } from "../entities";

// Render `text` with entity spans wrapped in <mark>. Spans must not overlap.
export function highlight(text: string, entities: Entity[], offset = 0): (Node | string)[] {
  const out: (Node | string)[] = [];
  let pos = 0;
  for (const e of entities) {
    const start = e.start - offset;
    const end = e.end - offset;
    if (start < pos || end > text.length || start < 0) continue;
    out.push(text.slice(pos, start));
    out.push(h("mark", { className: `ent cat-${e.category}`, title: e.label }, text.slice(start, end)));
    pos = end;
  }
  out.push(text.slice(pos));
  return out;
}

export function articleCard(a: Article, entities: Entity[] = []): HTMLElement {
  const titleLen = a.title.length;
  const titleEnts = entities.filter((e) => e.end <= titleLen);
  const absEnts = entities.filter((e) => e.start > titleLen);
  const authors =
    a.authors.length > 4 ? `${a.authors.slice(0, 3).join(", ")}, … ${a.authors.at(-1)}` : a.authors.join(", ");
  const tags = a.pubTypes.filter((t) =>
    /review|meta-analysis|trial|guideline|case report/i.test(t),
  );
  return h(
    "article",
    { className: "paper" },
    h(
      "h3",
      {},
      h("a", { href: pubmedUrl(a.pmid), target: "_blank", rel: "noopener noreferrer" }, ...highlight(a.title, titleEnts)),
    ),
    h(
      "p",
      { className: "meta" },
      [authors, a.journal, a.year].filter(Boolean).join(" · "),
      " · ",
      h("span", { className: "pmid" }, `PMID ${a.pmid}`),
      a.doi && [" · ", h("a", { href: `https://doi.org/${a.doi}`, target: "_blank", rel: "noopener noreferrer" }, "DOI")],
      a.pmcid && [
        " · ",
        h(
          "a",
          { href: `https://pmc.ncbi.nlm.nih.gov/articles/${a.pmcid}/`, target: "_blank", rel: "noopener noreferrer" },
          "Free full text",
        ),
      ],
    ),
    tags.length > 0 && h("p", { className: "tags" }, ...tags.map((t) => h("span", { className: "tag" }, t))),
    a.abstract
      ? h(
          "details",
          {},
          h("summary", {}, "Abstract"),
          h("p", { className: "abstract" }, ...highlight(a.abstract, absEnts, titleLen + 1)),
        )
      : h("p", { className: "muted small" }, "No abstract available."),
  );
}

// Title and abstract are analysed as one string joined by a newline.
export function articleText(a: Article): string {
  return `${a.title}\n${a.abstract}`;
}
