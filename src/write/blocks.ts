// The editor's document (ProseMirror JSON) reduced to a small neutral model
// that every exporter (Markdown, LaTeX, HTML, Word) renders from. Citations
// become runs carrying both their label and their keys.

import { citationOrder, citeLabel, referenceEntries, type CiteStyle, type DocNode, type Refs, type ReferenceEntry } from "./cite";

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  href?: string;
  // Present on a citation: the cited keys (text is the label).
  cite?: string[];
}

export type Block =
  | { t: "p"; runs: Run[] }
  | { t: "h"; level: 1 | 2 | 3 | 4; runs: Run[] }
  | { t: "list"; ordered: boolean; items: Block[][] }
  | { t: "quote"; blocks: Block[] }
  | { t: "hr" }
  | { t: "code"; text: string };

export interface DocModel {
  title: string;
  style: CiteStyle;
  blocks: Block[];
  references: ReferenceEntry[];
  refs: Refs;
}

function runsOf(nodes: DocNode[] | undefined, style: CiteStyle, order: string[], refs: Refs): Run[] {
  const runs: Run[] = [];
  for (const n of nodes ?? []) {
    if (n.type === "text" && n.text) {
      const marks = new Set((n.marks ?? []).map((m) => m.type));
      const link = n.marks?.find((m) => m.type === "link");
      runs.push({
        text: n.text,
        bold: marks.has("bold") || undefined,
        italic: marks.has("italic") || undefined,
        underline: marks.has("underline") || undefined,
        strike: marks.has("strike") || undefined,
        code: marks.has("code") || undefined,
        href: (link?.attrs?.href as string | undefined) || undefined,
      });
    } else if (n.type === "hardBreak") {
      runs.push({ text: "\n" });
    } else if (n.type === "citation") {
      const keys = (n.attrs?.keys as string[] | undefined) ?? [];
      runs.push({ text: citeLabel(keys, style, order, refs), cite: keys });
    }
  }
  return runs;
}

function blocksOf(nodes: DocNode[] | undefined, style: CiteStyle, order: string[], refs: Refs): Block[] {
  const out: Block[] = [];
  for (const n of nodes ?? []) {
    switch (n.type) {
      case "paragraph":
        out.push({ t: "p", runs: runsOf(n.content, style, order, refs) });
        break;
      case "heading": {
        const level = Math.min(Math.max(Number(n.attrs?.level ?? 1), 1), 4) as 1 | 2 | 3 | 4;
        out.push({ t: "h", level, runs: runsOf(n.content, style, order, refs) });
        break;
      }
      case "bulletList":
      case "orderedList":
        out.push({
          t: "list",
          ordered: n.type === "orderedList",
          items: (n.content ?? []).map((li) => blocksOf(li.content, style, order, refs)),
        });
        break;
      case "blockquote":
        out.push({ t: "quote", blocks: blocksOf(n.content, style, order, refs) });
        break;
      case "horizontalRule":
        out.push({ t: "hr" });
        break;
      case "codeBlock":
        out.push({ t: "code", text: (n.content ?? []).map((c) => c.text ?? "").join("") });
        break;
    }
  }
  return out;
}

export function toModel(doc: DocNode | null | undefined, title: string, style: CiteStyle, refs: Refs): DocModel {
  const order = citationOrder(doc);
  return {
    title,
    style,
    blocks: blocksOf(doc?.content, style, order, refs),
    references: referenceEntries(order, style, refs),
    refs,
  };
}

export const runsText = (runs: Run[]) => runs.map((r) => r.text).join("");

// Plain text of a block (used for word counts and empty-document checks).
export function blockText(b: Block): string {
  switch (b.t) {
    case "p":
    case "h":
      return runsText(b.runs);
    case "list":
      return b.items.map((item) => item.map(blockText).join(" ")).join(" ");
    case "quote":
      return b.blocks.map(blockText).join(" ");
    case "code":
      return b.text;
    default:
      return "";
  }
}
