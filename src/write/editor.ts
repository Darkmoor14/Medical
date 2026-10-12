// The rich-text editor (Tiptap/ProseMirror) with an inline citation node.
// A citation stores only the keys of the papers it cites; its visible label
// ("[2]" or "(Smith, 2023)") is computed from the whole document, so
// numbers update by themselves when citations are added, moved or removed.

import { Editor, Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { citationOrder, citeLabel, type CiteStyle, type DocNode, type Refs } from "./cite";

export interface EditorContext {
  style: CiteStyle;
  refs: Refs;
}

const labelKey = new PluginKey("citation-labels");

function citationExtension(getContext: () => EditorContext) {
  return Node.create({
    name: "citation",
    group: "inline",
    inline: true,
    atom: true,
    selectable: true,

    addAttributes() {
      return {
        keys: {
          default: [] as string[],
          parseHTML: (el) => (el.getAttribute("data-keys") ?? "").split("|").filter(Boolean),
          renderHTML: (attrs) => ({ "data-keys": (attrs.keys as string[]).join("|") }),
        },
      };
    },

    parseHTML() {
      return [{ tag: "span[data-citation]" }];
    },

    renderHTML({ HTMLAttributes }) {
      // The visible label is added by a decoration (see below).
      return ["span", mergeAttributes(HTMLAttributes, { "data-citation": "", class: "citation" })];
    },

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: labelKey,
          props: {
            decorations: (state) => {
              const ctx = getContext();
              const json = state.doc.toJSON() as DocNode;
              const order = citationOrder(json);
              const decos: Decoration[] = [];
              state.doc.descendants((node, pos) => {
                if (node.type.name !== "citation") return;
                const keys = (node.attrs.keys as string[]) ?? [];
                const label = citeLabel(keys, ctx.style, order, ctx.refs);
                const title = keys.map((k) => ctx.refs[k]?.title ?? k).join("\n");
                decos.push(Decoration.node(pos, pos + node.nodeSize, { "data-label": label, title, "aria-label": `Citation ${label}` }));
              });
              return DecorationSet.create(state.doc, decos);
            },
          },
        }),
      ];
    },
  });
}

export interface WriteEditor {
  editor: Editor;
  setContent(json: DocNode | null): void;
  insertCitation(keys: string[]): void;
  // Re-draw citation labels after the style or references changed.
  refreshCitations(): void;
  wordCount(): number;
  destroy(): void;
}

export function createWriteEditor(opts: {
  element: HTMLElement;
  content: DocNode | null;
  getContext: () => EditorContext;
  onChange: () => void;
}): WriteEditor {
  const editor = new Editor({
    element: opts.element,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } } }),
      Placeholder.configure({ placeholder: "Start writing. Use “Cite” to add references from your reading list." }),
      CharacterCount,
      citationExtension(opts.getContext),
    ],
    content: opts.content ?? { type: "doc", content: [{ type: "paragraph" }] },
    editorProps: { attributes: { class: "write-surface", role: "textbox", "aria-multiline": "true", "aria-label": "Document" } },
    onUpdate: () => opts.onChange(),
  });

  return {
    editor,
    setContent(json) {
      editor.commands.setContent(json ?? { type: "doc", content: [{ type: "paragraph" }] }, { emitUpdate: false });
    },
    insertCitation(keys) {
      editor.chain().focus().insertContent([{ type: "citation", attrs: { keys } }, { type: "text", text: " " }]).run();
    },
    refreshCitations() {
      editor.view.dispatch(editor.state.tr.setMeta(labelKey, "refresh"));
    },
    wordCount: () => editor.storage.characterCount.words() as number,
    destroy: () => editor.destroy(),
  };
}
