// The Write tab: documents saved in this browser, a rich-text editor, inline
// citations picked from the reading list (or found through PubMed, OpenAlex or a
// DOI), an automatic reference list, and export to Word, Markdown, LaTeX and PDF.

import { h, replace } from "./dom";
import { downloadBlob, downloadText, fileSlug } from "./download";
import type { Finder } from "./finder";
import { articleKey } from "../pubmed";
import { toModel } from "../write/blocks";
import { addRefs, type CiteStyle, type DocNode } from "../write/cite";
import { createDoc, deleteDoc, lastDocId, listDocs, loadDoc, saveDoc, setLastDocId, type WriteDoc } from "../write/doc-store";
import { createWriteEditor, type WriteEditor } from "../write/editor";
import { referencesBibtex, referencesRis, toDocxBlob, toHtml, toLatex, toMarkdown, wordCount } from "../write/export";
import { TEMPLATES, template } from "../write/templates";

export function writeTab(deps: { finder: Finder; apiKey: () => string | null }): HTMLElement {
  let doc: WriteDoc;
  let writer: WriteEditor;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;

  const saveState = h("span", { className: "muted small save-state", role: "status" });
  const docSelect = h("select", { "aria-label": "Choose document", onchange: (e: Event) => open((e.target as HTMLSelectElement).value) });
  const templateSelect = h(
    "select",
    { "aria-label": "Template for a new document" },
    ...TEMPLATES.map((t) => h("option", { value: t.id, title: t.description }, t.label)),
  );
  const titleInput = h("input", {
    type: "text",
    className: "doc-title-input",
    placeholder: "Document title",
    "aria-label": "Document title",
    oninput: (e: Event) => {
      doc.title = (e.target as HTMLInputElement).value;
      scheduleSave();
    },
    onchange: () => renderDocSelect(),
  });
  const styleSelect = h(
    "select",
    {
      "aria-label": "Citation style",
      onchange: (e: Event) => {
        doc.style = (e.target as HTMLSelectElement).value as CiteStyle;
        writer.refreshCitations();
        renderReferences();
        scheduleSave();
      },
    },
    h("option", { value: "vancouver" }, "Vancouver (numbered)"),
    h("option", { value: "apa" }, "APA (author–year)"),
  );
  const words = h("span", { className: "muted small" });
  const host = h("div", { className: "editor-host" });
  const refsEl = h("section", { className: "write-refs", "aria-label": "References" });
  const exportStatus = h("span", { className: "muted small", role: "status" });

  // --- Toolbar ---------------------------------------------------------------
  const toolbarButtons: { el: HTMLButtonElement; active?: () => boolean }[] = [];
  const tb = (label: string, title: string, run: () => void, active?: () => boolean) => {
    const el = h("button", { type: "button", className: "tb", title, "aria-label": title, onclick: run }, label);
    toolbarButtons.push({ el, active });
    return el;
  };
  const ed = () => writer.editor;
  const headingSelect = h(
    "select",
    {
      "aria-label": "Text style",
      className: "tb-select",
      onchange: (e: Event) => {
        const v = (e.target as HTMLSelectElement).value;
        const chain = ed().chain().focus();
        if (v === "p") chain.setParagraph().run();
        else chain.setHeading({ level: Number(v) as 1 | 2 | 3 | 4 }).run();
      },
    },
    h("option", { value: "p" }, "Paragraph"),
    h("option", { value: "1" }, "Heading 1"),
    h("option", { value: "2" }, "Heading 2"),
    h("option", { value: "3" }, "Heading 3"),
  );
  const refreshToolbar = () => {
    for (const b of toolbarButtons) {
      const on = b.active?.() ?? false;
      b.el.classList.toggle("on", on);
      b.el.setAttribute("aria-pressed", String(on));
    }
    const level = [1, 2, 3].find((l) => ed().isActive("heading", { level: l }));
    headingSelect.value = level ? String(level) : "p";
    const undo = toolbarButtons[0].el;
    const redo = toolbarButtons[1].el;
    undo.disabled = !ed().can().undo();
    redo.disabled = !ed().can().redo();
  };

  const setLink = () => {
    const previous = ed().getAttributes("link").href as string | undefined;
    const input = window.prompt("Link address (leave empty to remove the link)", previous ?? "https://");
    if (input === null) return;
    const href = input.trim();
    if (!href || href === "https://") {
      ed().chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const full = /^[a-z][a-z0-9+.-]*:/i.test(href) ? href : `https://${href}`;
    if (!/^(https?:|mailto:)/i.test(full)) return;
    ed().chain().focus().extendMarkRange("link").setLink({ href: full }).run();
  };

  const toolbar = h(
    "div",
    { className: "toolbar", role: "toolbar", "aria-label": "Formatting" },
    tb("↶", "Undo", () => ed().chain().focus().undo().run()),
    tb("↷", "Redo", () => ed().chain().focus().redo().run()),
    h("span", { className: "tb-sep", "aria-hidden": "true" }),
    headingSelect,
    tb("B", "Bold", () => ed().chain().focus().toggleBold().run(), () => ed().isActive("bold")),
    tb("I", "Italic", () => ed().chain().focus().toggleItalic().run(), () => ed().isActive("italic")),
    tb("U", "Underline", () => ed().chain().focus().toggleUnderline().run(), () => ed().isActive("underline")),
    h("span", { className: "tb-sep", "aria-hidden": "true" }),
    tb("• List", "Bulleted list", () => ed().chain().focus().toggleBulletList().run(), () => ed().isActive("bulletList")),
    tb("1. List", "Numbered list", () => ed().chain().focus().toggleOrderedList().run(), () => ed().isActive("orderedList")),
    tb("❝", "Quote", () => ed().chain().focus().toggleBlockquote().run(), () => ed().isActive("blockquote")),
    tb("Link", "Link", setLink, () => ed().isActive("link")),
    tb("―", "Horizontal line", () => ed().chain().focus().setHorizontalRule().run()),
    h("span", { className: "tb-sep", "aria-hidden": "true" }),
    h(
      "button",
      {
        type: "button",
        className: "primary tb-cite",
        title: "Cite papers from your reading list, PubMed, OpenAlex or a DOI",
        onclick: () =>
          deps.finder.open({
            title: "Cite papers",
            confirmLabel: (n) => (n ? `Cite ${n} paper${n === 1 ? "" : "s"}` : "Cite"),
            apiKey: deps.apiKey,
            onPick: (articles) => {
              doc.refs = addRefs(doc.refs, articles);
              writer.insertCitation(articles.map(articleKey));
              renderReferences();
              scheduleSave();
            },
          }),
      },
      "Cite…",
    ),
  );

  // --- Document model and saving ---------------------------------------------
  const model = () => toModel(writer.editor.getJSON() as DocNode, doc.title, doc.style, doc.refs);

  function renderReferences() {
    const m = model();
    words.textContent = `${wordCount(m).toLocaleString()} words`;
    replace(
      refsEl,
      h("h2", {}, m.references.length ? `References (${m.references.length})` : "References"),
      m.references.length
        ? h(
            "ol",
            { className: `refs${doc.style === "apa" ? " apa" : ""}` },
            ...m.references.map((r) => h("li", { className: r.missing ? "missing" : "", "data-key": r.key }, r.text)),
          )
        : h("p", { className: "muted small" }, "Papers you cite appear here automatically, in the chosen style."),
    );
  }

  function flush() {
    clearTimeout(saveTimer);
    if (!dirty) return;
    dirty = false;
    doc.json = writer.editor.getJSON() as DocNode;
    const ok = saveDoc(doc);
    saveState.classList.toggle("error", !ok);
    saveState.textContent = ok
      ? `Saved in this browser · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : "Could not save: the browser's storage is full. Export your work now.";
  }

  function scheduleSave() {
    dirty = true;
    saveState.classList.remove("error");
    saveState.textContent = "Saving…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 400);
  }

  function renderDocSelect() {
    replace(
      docSelect,
      ...listDocs().map((d) => h("option", { value: d.id, selected: d.id === doc.id }, d.id === doc.id ? doc.title || "Untitled" : d.title || "Untitled")),
    );
  }

  function open(id: string) {
    flush();
    const next = loadDoc(id);
    if (!next) return;
    doc = next;
    setLastDocId(doc.id);
    titleInput.value = doc.title;
    styleSelect.value = doc.style;
    writer.setContent(doc.json);
    writer.refreshCitations();
    renderDocSelect();
    renderReferences();
    refreshToolbar();
    saveState.textContent = "";
  }

  function create(templateId: string) {
    flush();
    const t = template(templateId);
    const d = createDoc(t.title, t.build());
    open(d.id);
    titleInput.select();
  }

  // --- Export -----------------------------------------------------------------
  const exportBtn = (label: string, title: string, run: () => void | Promise<void>) =>
    h(
      "button",
      {
        type: "button",
        className: "small-btn",
        title,
        onclick: async () => {
          flush();
          exportStatus.textContent = "";
          try {
            await run();
          } catch (err) {
            exportStatus.textContent = `Export failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        },
      },
      label,
    );
  const slug = () => fileSlug(doc.title);

  const exportBar = h(
    "div",
    { className: "export-menu", role: "group", "aria-label": "Export" },
    h("span", { className: "muted small" }, "Export: "),
    exportBtn("Word (.docx)", "Opens in Word, with the reference list", async () => downloadBlob(`${slug()}.docx`, await toDocxBlob(model()))),
    exportBtn("Markdown", "Plain text with formatting marks", () => downloadText(`${slug()}.md`, toMarkdown(model()), "text/markdown")),
    exportBtn("LaTeX", "A complete .tex file with its bibliography", () => downloadText(`${slug()}.tex`, toLatex(model()), "application/x-tex")),
    exportBtn("PDF (print)", "Opens the print dialog; choose “Save as PDF”", () => {
      const root = h("div", { className: "print-root" });
      root.innerHTML = toHtml(model());
      document.body.append(root);
      document.body.classList.add("printing-write");
      const done = () => {
        document.body.classList.remove("printing-write");
        root.remove();
        window.removeEventListener("afterprint", done);
      };
      window.addEventListener("afterprint", done);
      window.print();
    }),
    exportBtn("References (.bib)", "BibTeX file of the cited papers", () => downloadText(`${slug()}-references.bib`, referencesBibtex(model()), "application/x-bibtex")),
    exportBtn("References (.ris)", "For Zotero, EndNote or Mendeley", () => downloadText(`${slug()}-references.ris`, referencesRis(model()), "application/x-research-info-systems")),
    exportStatus,
  );

  // --- Assemble ---------------------------------------------------------------
  const first = (lastDocId() && loadDoc(lastDocId()!)) || listDocs()[0] || createDoc(TEMPLATES[0].title, TEMPLATES[0].build());
  doc = first;
  writer = createWriteEditor({
    element: host,
    content: doc.json,
    getContext: () => ({ style: doc.style, refs: doc.refs }),
    onChange: () => {
      scheduleSave();
      renderReferences();
    },
  });
  writer.editor.on("transaction", refreshToolbar);
  titleInput.value = doc.title;
  styleSelect.value = doc.style;
  setLastDocId(doc.id);
  renderDocSelect();
  renderReferences();
  refreshToolbar();
  window.addEventListener("pagehide", flush);

  return h(
    "div",
    { className: "tab-body write" },
    h(
      "section",
      { className: "card write-bar" },
      h("label", { className: "field inline" }, "Document ", docSelect),
      h("span", { className: "write-new" }, templateSelect, h("button", { type: "button", onclick: () => create(templateSelect.value) }, "New document")),
      h(
        "button",
        {
          type: "button",
          className: "danger-btn",
          onclick: () => {
            if (!window.confirm(`Delete “${doc.title || "Untitled"}”? This cannot be undone.`)) return;
            const id = doc.id;
            deleteDoc(id);
            dirty = false;
            const next = listDocs()[0];
            if (next) open(next.id);
            else create("blank");
          },
        },
        "Delete",
      ),
      saveState,
    ),
    h(
      "section",
      { className: "card write-card" },
      titleInput,
      toolbar,
      host,
      h("div", { className: "write-footer" }, words, h("label", { className: "field inline" }, "Citation style ", styleSelect)),
      refsEl,
    ),
    h("section", { className: "card" }, exportBar, h("p", { className: "muted small" }, "Documents are saved in this browser only. Export to keep a copy or share it.")),
  );
}
