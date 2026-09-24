import { h } from "./dom";
import { pubmedUrl, type Article, type LinkKind, type Metrics } from "../pubmed";
import { evidenceLevel, isPreprint } from "../search/evidence";
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
    out.push(
      h(
        "mark",
        { className: `ent cat-${e.category}${e.negated ? " negated" : ""}`, title: e.negated ? `${e.label} (negated)` : e.label },
        text.slice(start, end),
      ),
    );
    pos = end;
  }
  out.push(text.slice(pos));
  return out;
}

export interface CardOptions {
  metrics?: Metrics;
  onLinked?: (a: Article, kind: LinkKind) => void;
  starred?: boolean;
  onStar?: (a: Article) => void;
  selected?: boolean;
  onSelect?: (a: Article, on: boolean) => void;
  isNew?: boolean;
}

export function articleCard(a: Article, entities: Entity[] = [], opts: CardOptions = {}): HTMLElement {
  const titleLen = a.title.length;
  const titleEnts = entities.filter((e) => e.end <= titleLen);
  const absEnts = entities.filter((e) => e.start > titleLen);
  const authors =
    a.authors.length > 4 ? `${a.authors.slice(0, 3).join(", ")}, … ${a.authors.at(-1)}` : a.authors.join(", ");
  const level = evidenceLevel(a.pubTypes);
  const preprint = isPreprint(a);
  const m = opts.metrics;
  return h(
    "article",
    { className: `paper${a.retracted ? " retracted" : ""}`, "data-pmid": a.pmid },
    a.retracted &&
      h("p", { className: "warning danger", role: "note" }, "⚠ Retracted: this article has been retracted. Do not rely on its findings."),
    a.concern && h("p", { className: "warning", role: "note" }, "⚠ Expression of concern published for this article."),
    preprint && h("p", { className: "warning", role: "note" }, "Preprint: not peer reviewed."),
    h(
      "div",
      { className: "paper-head" },
      opts.onSelect &&
        h("input", {
          type: "checkbox",
          className: "select-paper",
          "aria-label": `Select “${a.title}”`,
          checked: Boolean(opts.selected),
          onchange: (e: Event) => opts.onSelect!(a, (e.target as HTMLInputElement).checked),
        }),
      h(
        "h3",
        {},
        opts.isNew && h("span", { className: "new-badge" }, "New"),
        h("a", { href: pubmedUrl(a.pmid), target: "_blank", rel: "noopener noreferrer" }, ...highlight(a.title, titleEnts)),
      ),
      opts.onStar &&
        h(
          "button",
          {
            type: "button",
            className: `star${opts.starred ? " on" : ""}`,
            "aria-pressed": opts.starred ? "true" : "false",
            "aria-label": opts.starred ? "Remove from reading list" : "Add to reading list",
            title: opts.starred ? "Remove from reading list" : "Add to reading list",
            onclick: () => opts.onStar!(a),
          },
          opts.starred ? "★" : "☆",
        ),
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
    h(
      "p",
      { className: "tags" },
      h("span", { className: `level level-${level.rank}`, title: "Strength of evidence from the publication type" }, level.label),
      m &&
        h(
          "span",
          {
            className: "tag metric",
            title: m.rcr != null ? "Relative Citation Ratio: 1.0 is the field average (NIH iCite)" : "Citations (NIH iCite)",
          },
          `${m.citations.toLocaleString()} citation${m.citations === 1 ? "" : "s"}`,
          m.rcr != null && ` · RCR ${m.rcr.toFixed(1)}`,
        ),
    ),
    a.abstract
      ? h(
          "details",
          {},
          h("summary", {}, "Abstract"),
          h("p", { className: "abstract" }, ...highlight(a.abstract, absEnts, titleLen + 1)),
        )
      : h("p", { className: "muted small" }, "No abstract available."),
    opts.onLinked &&
      h(
        "div",
        { className: "paper-actions" },
        h("button", { type: "button", className: "small-btn", onclick: () => opts.onLinked!(a, "similar") }, "Similar articles"),
        h("button", { type: "button", className: "small-btn", onclick: () => opts.onLinked!(a, "citedBy") }, "Cited by"),
      ),
  );
}

// Title and abstract are analysed as one string joined by a newline.
export function articleText(a: Article): string {
  return `${a.title}\n${a.abstract}`;
}
