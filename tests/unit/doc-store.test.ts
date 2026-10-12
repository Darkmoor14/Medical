// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createDoc, deleteDoc, lastDocId, listDocs, loadDoc, saveDoc, setLastDocId } from "../../src/write/doc-store";
import { TEMPLATES, template } from "../../src/write/templates";
import { citationOrder } from "../../src/write/cite";

beforeEach(() => localStorage.clear());

describe("document store", () => {
  it("creates, updates, lists and deletes documents", async () => {
    const a = createDoc("First", template("article").build());
    await new Promise((r) => setTimeout(r, 5));
    const b = createDoc("Second", null);
    expect(listDocs().map((d) => d.title)).toEqual(["Second", "First"]);
    saveDoc({ ...a, title: "First (edited)", style: "apa" });
    expect(loadDoc(a.id)).toMatchObject({ title: "First (edited)", style: "apa" });
    expect(listDocs()[0].id).toBe(a.id);
    setLastDocId(b.id);
    expect(lastDocId()).toBe(b.id);
    deleteDoc(b.id);
    expect(loadDoc(b.id)).toBeNull();
    expect(lastDocId()).toBeNull();
  });

  it("survives broken storage", () => {
    localStorage.setItem("opm-write-docs-v1", "not json");
    expect(listDocs()).toEqual([]);
    localStorage.setItem("opm-write-docs-v1", JSON.stringify({ not: "a list" }));
    expect(listDocs()).toEqual([]);
  });
});

describe("templates", () => {
  it("offers a blank page, IMRaD, CARE and a review, each with headings", () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(["blank", "article", "case", "review"]);
    const headings = (id: string) => (template(id).build().content ?? []).filter((n) => n.type === "heading").map((n) => n.content?.[0].text);
    expect(headings("article")).toEqual(["Abstract", "Introduction", "Methods", "Results", "Discussion", "Conclusion"]);
    expect(headings("case")).toContain("Informed consent");
    expect(headings("review")).toContain("Search strategy");
    expect(citationOrder(template("article").build())).toEqual([]);
  });
});
