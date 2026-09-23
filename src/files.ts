// Read text out of dropped/selected documents, entirely in the browser.
// Parsers are loaded on first use to keep the initial page small.

export interface ExtractedFile {
  text: string;
  warning: string | null;
}

export const ACCEPTED_FILES = ".txt,.md,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function extractText(file: File): Promise<ExtractedFile> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx")) return { text: await docxText(file), warning: null };
  if (name.endsWith(".pdf") || file.type === "application/pdf") return pdfText(file);
  if (name.endsWith(".doc")) {
    throw new Error("Old .doc files are not supported. Save the document as .docx or PDF and try again.");
  }
  if (file.type.startsWith("text/") || /\.(txt|md|csv)$/.test(name) || !file.type) {
    return { text: await file.text(), warning: null };
  }
  throw new Error(`Unsupported file type: ${file.name}. Use .docx, .pdf or .txt.`);
}

// Word documents are converted to HTML first so tables keep their rows:
// each row becomes one line with cells separated by " | ".
async function docxText(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await (mammoth.default ?? mammoth).convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  return normalize(htmlToText(value));
}

export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const out: string[] = [];
  // Paragraphs inside one cell (e.g. role, title and name in a signature
  // table) are kept apart with " / " instead of running together.
  const cellText = (el: Element) => {
    const parts = Array.from(el.querySelectorAll("p, li")).map((p) => (p.textContent ?? "").replace(/\s+/g, " ").trim());
    const text = parts.length ? parts.filter(Boolean).join(" / ") : (el.textContent ?? "");
    return text.replace(/\s+/g, " ").trim();
  };
  const walk = (node: Element) => {
    for (const el of Array.from(node.children)) {
      const tag = el.tagName.toLowerCase();
      if (tag === "table") {
        for (const row of Array.from(el.querySelectorAll("tr"))) {
          const cells = Array.from(row.children).map(cellText);
          if (cells.some(Boolean)) out.push(cells.join(" | "));
        }
        out.push("");
      } else if (tag === "ul" || tag === "ol") {
        for (const li of Array.from(el.children)) out.push(`- ${cellText(li)}`);
        out.push("");
      } else if (/^(p|h[1-6])$/.test(tag)) {
        out.push((el.textContent ?? "").trim(), "");
      } else {
        walk(el);
      }
    }
  };
  walk(doc.body);
  return out.join("\n");
}

async function pdfText(file: File): Promise<ExtractedFile> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const pages: string[] = [];
  let emptyPages = 0;
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += item.str + (item.hasEOL ? "\n" : "");
      }
      if (text.trim().length < 20) emptyPages++;
      pages.push(text.trim());
    }
  } finally {
    await task.destroy();
  }
  const warning =
    emptyPages === doc.numPages
      ? "This PDF has no text layer (it looks like a scan or photo), so nothing could be read. Use a PDF exported from a word processor, or a .docx."
      : emptyPages > 0
        ? `${emptyPages} of ${doc.numPages} pages had no readable text (possibly scanned) and were skipped.`
        : null;
  return { text: normalize(pages.filter(Boolean).join("\n\n")), warning };
}

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
