import { h } from "../ui/dom";
import type { Block } from "./model";

export function renderPreview(blocks: Block[]): HTMLElement {
  return h(
    "div",
    { className: "doc-preview", lang: "ro" },
    ...blocks.map((b) => {
      switch (b.kind) {
        case "draftNote":
          return h("p", { className: "doc-draft" }, b.text);
        case "meta":
          return h("p", { className: "doc-meta" }, b.text);
        case "title":
          return h("h3", { className: "doc-title" }, b.text);
        case "heading":
          return h("h4", {}, b.text);
        case "para":
          return h("p", {}, b.text);
        case "list":
          return h("ol", {}, ...b.items.map((i) => h("li", {}, i)));
        case "table":
          return h(
            "table",
            {},
            h("thead", {}, h("tr", {}, ...b.header.map((c) => h("th", {}, c)))),
            h("tbody", {}, ...b.rows.map((r) => h("tr", {}, ...r.map((c) => h("td", {}, c))))),
          );
        case "checks":
          return h(
            "div",
            { className: "doc-checks" },
            ...b.groups.map((g) =>
              h("div", {}, ...g.options.map((o) => h("p", {}, `${o.on ? "[x]" : "[ ]"} ${o.label}`))),
            ),
          );
        case "signature":
          return h("div", { className: "doc-signature" }, ...b.lines.map((l) => h("p", {}, l)));
      }
    }),
  );
}

export async function renderDocx(blocks: Block[]): Promise<Blob> {
  const docx = await import("docx");
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType } = docx;
  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];
  const lines = (text: string, opts: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}) =>
    text.split("\n").map((t, i) => new TextRun({ text: t, break: i > 0 ? 1 : undefined, ...opts }));

  for (const b of blocks) {
    switch (b.kind) {
      case "draftNote":
        children.push(
          new Paragraph({
            children: lines(b.text, { italics: true, size: 18, color: "B42318" }),
            spacing: { after: 200 },
          }),
        );
        break;
      case "meta":
        children.push(new Paragraph({ children: lines(b.text, { bold: true }), spacing: { after: 200 } }));
        break;
      case "title":
        children.push(
          new Paragraph({
            children: [new TextRun({ text: b.text, bold: true, size: 28 })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 240 },
          }),
        );
        break;
      case "heading":
        children.push(new Paragraph({ text: b.text, heading: HeadingLevel.HEADING_3, spacing: { before: 240, after: 80 } }));
        break;
      case "para":
        children.push(new Paragraph({ children: lines(b.text), spacing: { after: 120 } }));
        break;
      case "list":
        b.items.forEach((item, i) =>
          children.push(new Paragraph({ children: [new TextRun(`${i + 1}. ${item}`)], indent: { left: 360 } })),
        );
        break;
      case "table": {
        const row = (cells: string[], bold = false) =>
          new TableRow({
            children: cells.map(
              (c) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: c, bold })] })] }),
            ),
          });
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [row(b.header, true), ...b.rows.map((r) => row(r))],
          }),
        );
        break;
      }
      case "checks":
        children.push(new Paragraph({ text: "", spacing: { after: 120 } }));
        for (const g of b.groups) {
          for (const o of g.options) {
            children.push(new Paragraph({ children: [new TextRun(`${o.on ? "[x]" : "[ ]"} ${o.label}`)] }));
          }
          children.push(new Paragraph({ text: "" }));
        }
        break;
      case "signature":
        children.push(
          new Paragraph({
            children: lines(b.lines.join("\n")),
            alignment: AlignmentType.RIGHT,
            spacing: { before: 400 },
          }),
        );
        break;
    }
  }
  const doc = new Document({
    creator: "OpenMed PubMed Explorer (draft)",
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{ children }],
  });
  return Packer.toBlob(doc);
}
