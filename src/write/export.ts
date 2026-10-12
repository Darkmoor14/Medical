// Renderers for the document model: Markdown, LaTeX, HTML (preview and print)
// and Word. Word is built lazily, so its library is only loaded on export.

import type { Block, DocModel, Run } from "./blocks";
import { blockText, runsText } from "./blocks";
import { authorPart, yearSuffixes } from "./cite";
import { bibKey, toBibtex, toRis } from "../search/citations";

// --- Markdown ---------------------------------------------------------------

const mdEscape = (s: string) => s.replace(/([\\*_`])/g, "\\$1");

function mdRun(r: Run): string {
  if (r.cite) return r.text;
  if (r.code) return `\`${r.text}\``;
  let t = mdEscape(r.text);
  if (r.bold) t = `**${t}**`;
  if (r.italic) t = `*${t}*`;
  if (r.strike) t = `~~${t}~~`;
  if (r.href) t = `[${t}](${r.href})`;
  return t;
}

function mdBlock(b: Block): string {
  switch (b.t) {
    case "p":
      return b.runs.map(mdRun).join("").replace(/\n/g, "  \n");
    case "h":
      return `${"#".repeat(b.level)} ${b.runs.map(mdRun).join("")}`;
    case "list":
      return b.items
        .map((item, i) => {
          const marker = b.ordered ? `${i + 1}. ` : "- ";
          const lines = item.map(mdBlock).join("\n").split("\n");
          return lines.map((line, j) => (j === 0 ? marker + line : " ".repeat(marker.length) + line)).join("\n");
        })
        .join("\n");
    case "quote":
      return b.blocks
        .map(mdBlock)
        .join("\n\n")
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
    case "hr":
      return "---";
    case "code":
      return "```\n" + b.text + "\n```";
  }
}

export function toMarkdown(m: DocModel): string {
  const parts: string[] = [];
  if (m.title.trim()) parts.push(`# ${mdEscape(m.title.trim())}`);
  parts.push(...m.blocks.map(mdBlock));
  if (m.references.length) {
    parts.push("## References");
    parts.push(m.references.map((r) => (r.number ? `${r.number}. ${r.text}` : r.text)).join(m.style === "apa" ? "\n\n" : "\n"));
  }
  return parts.join("\n\n") + "\n";
}

// --- LaTeX ------------------------------------------------------------------

const TEX_SPECIAL: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  $: "\\$",
  "&": "\\&",
  "#": "\\#",
  "^": "\\textasciicircum{}",
  _: "\\_",
  "%": "\\%",
  "~": "\\textasciitilde{}",
};
export const texEscape = (s: string) => s.replace(/[\\{}$&#^_%~]/g, (c) => TEX_SPECIAL[c]);

function texRun(r: Run, style: DocModel["style"], keyOf: (k: string) => string): string {
  if (r.cite) {
    const keys = r.cite.map(keyOf).join(",");
    return style === "apa" ? `\\citep{${keys}}` : `\\cite{${keys}}`;
  }
  if (r.code) return `\\texttt{${texEscape(r.text)}}`;
  let t = texEscape(r.text).replace(/\n/g, "\\\\\n");
  if (r.bold) t = `\\textbf{${t}}`;
  if (r.italic) t = `\\textit{${t}}`;
  if (r.underline) t = `\\underline{${t}}`;
  if (r.strike) t = `\\sout{${t}}`;
  if (r.href) t = `\\href{${r.href.replace(/([#%\\])/g, "\\$1")}}{${t}}`;
  return t;
}

const SECTION = ["", "\\section", "\\subsection", "\\subsubsection", "\\paragraph"];

function texBlocks(blocks: Block[], m: DocModel, keyOf: (k: string) => string): string[] {
  const runs = (rs: Run[]) => rs.map((r) => texRun(r, m.style, keyOf)).join("");
  const out: string[] = [];
  for (const b of blocks) {
    switch (b.t) {
      case "p":
        out.push(runs(b.runs));
        break;
      case "h":
        out.push(`${SECTION[b.level]}{${runs(b.runs)}}`);
        break;
      case "list": {
        const env = b.ordered ? "enumerate" : "itemize";
        out.push(
          `\\begin{${env}}\n${b.items.map((item) => `  \\item ${texBlocks(item, m, keyOf).join("\n\n  ")}`).join("\n")}\n\\end{${env}}`,
        );
        break;
      }
      case "quote":
        out.push(`\\begin{quote}\n${texBlocks(b.blocks, m, keyOf).join("\n\n")}\n\\end{quote}`);
        break;
      case "hr":
        out.push("\\noindent\\rule{\\linewidth}{0.4pt}");
        break;
      case "code":
        out.push(`\\begin{verbatim}\n${b.text}\n\\end{verbatim}`);
        break;
    }
  }
  return out;
}

export function toLatex(m: DocModel): string {
  const keyOf = (k: string) => (m.refs[k] ? bibKey(m.refs[k]) : k.replace(/[^A-Za-z0-9]/g, "_"));
  const apaStyle = m.style === "apa";
  const preamble = [
    "\\documentclass[11pt]{article}",
    "\\usepackage[T1]{fontenc}",
    "\\usepackage[utf8]{inputenc}",
    "\\usepackage[normalem]{ulem}",
    "\\usepackage{hyperref}",
    ...(apaStyle ? ["\\usepackage[round]{natbib}"] : []),
  ];
  const body = texBlocks(m.blocks, m, keyOf).join("\n\n");
  const suffix = yearSuffixes(m.references.map((r) => r.key), m.refs);
  const bib = m.references.length
    ? [
        `\\begin{thebibliography}{${m.references.length >= 10 ? "99" : "9"}}`,
        ...m.references.map((r) => {
          const a = m.refs[r.key];
          // natbib wants "Author(Year)" as the optional label of each \bibitem.
          const label = apaStyle && a ? `[${texEscape(authorPart(a))}(${a.year || "n.d."}${suffix.get(r.key) ?? ""})]` : "";
          return `\\bibitem${label}{${keyOf(r.key)}} ${texEscape(r.text)}`;
        }),
        "\\end{thebibliography}",
      ].join("\n")
    : "";
  return (
    [
      preamble.join("\n"),
      m.title.trim() ? `\\title{${texEscape(m.title.trim())}}\n\\date{}` : "",
      "\\begin{document}",
      m.title.trim() ? "\\maketitle" : "",
      body,
      bib,
      "\\end{document}",
    ]
      .filter(Boolean)
      .join("\n\n") + "\n"
  );
}

// --- HTML (preview, print, tests) ------------------------------------------

export const htmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function htmlRun(r: Run): string {
  let t = htmlEscape(r.text).replace(/\n/g, "<br>");
  if (r.cite) return `<span class="cite">${t}</span>`;
  if (r.code) t = `<code>${t}</code>`;
  if (r.bold) t = `<strong>${t}</strong>`;
  if (r.italic) t = `<em>${t}</em>`;
  if (r.underline) t = `<u>${t}</u>`;
  if (r.strike) t = `<s>${t}</s>`;
  if (r.href && /^(https?:|mailto:)/i.test(r.href)) t = `<a href="${htmlEscape(r.href)}">${t}</a>`;
  return t;
}

function htmlBlocks(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.t) {
        case "p":
          return `<p>${b.runs.map(htmlRun).join("") || "<br>"}</p>`;
        case "h":
          return `<h${b.level}>${b.runs.map(htmlRun).join("")}</h${b.level}>`;
        case "list": {
          const tag = b.ordered ? "ol" : "ul";
          return `<${tag}>${b.items.map((i) => `<li>${htmlBlocks(i)}</li>`).join("")}</${tag}>`;
        }
        case "quote":
          return `<blockquote>${htmlBlocks(b.blocks)}</blockquote>`;
        case "hr":
          return "<hr>";
        case "code":
          return `<pre><code>${htmlEscape(b.text)}</code></pre>`;
      }
    })
    .join("\n");
}

export function toHtml(m: DocModel): string {
  const refs = m.references.length
    ? `<h2>References</h2>\n<ol class="refs${m.style === "apa" ? " apa" : ""}">${m.references
        .map((r) => `<li${r.missing ? ' class="missing"' : ""}>${htmlEscape(r.text)}</li>`)
        .join("")}</ol>`
    : "";
  return `${m.title.trim() ? `<h1 class="doc-title">${htmlEscape(m.title.trim())}</h1>\n` : ""}${htmlBlocks(m.blocks)}\n${refs}`;
}

// --- Word -------------------------------------------------------------------

export async function toDocxBlob(m: DocModel): Promise<Blob> {
  const { Packer } = await import("docx");
  return Packer.toBlob(await buildDocx(m));
}

export async function buildDocx(m: DocModel) {
  const docx = await import("docx");
  const { Document, Paragraph, TextRun, HeadingLevel, ExternalHyperlink, AlignmentType, LevelFormat, BorderStyle } = docx;

  const headingLevels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];
  type Para = InstanceType<typeof Paragraph>;
  let listInstance = 0;

  type Child = InstanceType<typeof TextRun> | InstanceType<typeof ExternalHyperlink>;
  const runOf = (r: Run, extra: { italics?: boolean } = {}): Child[] => {
    const text = r.text.split("\n").map(
      (t, i) =>
        new TextRun({
          text: t,
          break: i > 0 ? 1 : undefined,
          bold: r.bold,
          italics: r.italic || extra.italics,
          underline: r.underline ? {} : undefined,
          strike: r.strike,
          font: r.code ? "Courier New" : undefined,
        }),
    );
    if (r.href && /^(https?:|mailto:)/i.test(r.href)) return [new ExternalHyperlink({ link: r.href, children: text })];
    return text;
  };
  const runsOfAll = (rs: Run[], extra: { italics?: boolean } = {}): Child[] => rs.flatMap((r) => runOf(r, extra));

  const blocks = (bs: Block[], ctx: { quote?: boolean; list?: { ref: string; level: number; instance: number } } = {}): Para[] => {
    const out: Para[] = [];
    for (const b of bs) {
      switch (b.t) {
        case "p":
          out.push(
            new Paragraph({
              children: runsOfAll(b.runs, { italics: ctx.quote }),
              spacing: { after: 120 },
              indent: ctx.quote ? { left: 720 } : undefined,
              numbering: ctx.list ? { reference: ctx.list.ref, level: ctx.list.level, instance: ctx.list.instance } : undefined,
              border: ctx.quote ? { left: { style: BorderStyle.SINGLE, size: 12, color: "999999", space: 8 } } : undefined,
            }),
          );
          break;
        case "h":
          out.push(new Paragraph({ children: runsOfAll(b.runs), heading: headingLevels[b.level], spacing: { before: 240, after: 80 } }));
          break;
        case "list": {
          const instance = ++listInstance;
          const level = ctx.list ? Math.min(ctx.list.level + 1, 3) : 0;
          for (const item of b.items) {
            // The first paragraph of an item carries the bullet/number; the
            // rest (and nested lists) follow without one.
            const [first, ...rest] = item;
            const ref = b.ordered ? "numbers" : "bullets";
            const here = { ref, level, instance };
            if (first?.t === "p") {
              out.push(...blocks([first], { ...ctx, list: here }));
              for (const blk of rest) {
                // Nested lists keep the parent so their level is right; other
                // continuation paragraphs carry no bullet or number.
                out.push(...blocks([blk], blk.t === "list" ? { ...ctx, list: here } : { ...ctx, list: undefined }));
              }
            } else {
              out.push(...blocks(item, { ...ctx, list: here }));
            }
          }
          break;
        }
        case "quote":
          out.push(...blocks(b.blocks, { ...ctx, quote: true }));
          break;
        case "hr":
          out.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 1 } }, spacing: { after: 120 } }));
          break;
        case "code":
          out.push(
            ...b.text.split("\n").map((line) => new Paragraph({ children: [new TextRun({ text: line, font: "Courier New", size: 20 })] })),
          );
          break;
      }
    }
    return out;
  };

  const children: Para[] = [];
  if (m.title.trim()) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: m.title.trim(), bold: true, size: 36 })],
        alignment: AlignmentType.LEFT,
        spacing: { after: 240 },
      }),
    );
  }
  children.push(...blocks(m.blocks));
  if (m.references.length) {
    children.push(new Paragraph({ text: "References", heading: HeadingLevel.HEADING_2, spacing: { before: 360, after: 120 } }));
    for (const r of m.references) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: r.number ? `${r.number}. ${r.text}` : r.text })],
          indent: { left: 540, hanging: 540 },
          spacing: { after: 80 },
        }),
      );
    }
  }

  const levels = (format: (typeof LevelFormat)[keyof typeof LevelFormat], text: (i: number) => string) =>
    [0, 1, 2, 3].map((level) => ({
      level,
      format,
      text: text(level),
      alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 720 + level * 360, hanging: 360 } } },
    }));

  return new Document({
    creator: "OpenMed PubMed Explorer",
    title: m.title || undefined,
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    numbering: {
      config: [
        { reference: "bullets", levels: levels(LevelFormat.BULLET, () => "•") },
        { reference: "numbers", levels: levels(LevelFormat.DECIMAL, (l) => `%${l + 1}.`) },
      ],
    },
    sections: [{ children }],
  });
}

// --- References only ---------------------------------------------------------

export function referencesBibtex(m: DocModel): string {
  return toBibtex(m.references.map((r) => m.refs[r.key]).filter(Boolean));
}

export function referencesRis(m: DocModel): string {
  return toRis(m.references.map((r) => m.refs[r.key]).filter(Boolean));
}

export const wordCount = (m: DocModel) =>
  m.blocks.reduce((n, b) => n + blockText(b).split(/\s+/).filter(Boolean).length, 0);
