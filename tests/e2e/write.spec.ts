import { expect, test, type Page } from "@playwright/test";
import mammoth from "mammoth";
import { installFakeEngine, mockPubMed, mockSources } from "./helpers";

test.beforeEach(async ({ page }) => {
  await installFakeEngine(page);
  await mockSources(page);
});

// Search and star both sample papers (Empagliflozin… and Metformin…).
async function starBothPapers(page: Page) {
  await page.goto("/");
  await page.getByLabel("PubMed query").fill("ckd");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".paper")).toHaveCount(2);
  // Each click turns its button into "Remove…", so always take the first remaining one.
  for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Add to reading list" }).first().click();
  await expect(page.locator("#reading-btn")).toHaveText("★ Reading list (2)");
}

async function openWrite(page: Page) {
  await page.getByRole("tab", { name: "Write" }).click();
  await expect(page.locator(".write-surface")).toBeVisible();
}

test("write with citations: numbering, references, styles, Word export, reload", async ({ page }) => {
  await mockPubMed(page);
  await starBothPapers(page);
  await openWrite(page);

  const editor = page.locator(".write-surface");
  await page.getByLabel("Document title").fill("SGLT2 inhibitors in CKD");
  await editor.click();
  await page.keyboard.type("SGLT2 inhibitors slow progression ");

  // First citation: Empagliflozin from the reading list.
  await page.getByRole("button", { name: "Cite…" }).click();
  const finder = page.getByRole("dialog", { name: "Cite papers" });
  await expect(finder.getByRole("tab", { name: "Reading list" })).toHaveAttribute("aria-selected", "true");
  await expect(finder.locator(".finder-item")).toHaveCount(2);
  await finder.getByRole("checkbox", { name: /Empagliflozin in chronic kidney disease/ }).check();
  await finder.getByRole("button", { name: "Cite 1 paper" }).click();
  await expect(editor.locator("span.citation")).toHaveAttribute("data-label", "[1]");

  await page.keyboard.type("while metformin needs dose changes ");
  await page.getByRole("button", { name: "Cite…" }).click();
  await finder.getByRole("checkbox", { name: /Metformin and eGFR/ }).check();
  await finder.getByRole("button", { name: "Cite 1 paper" }).click();
  await expect(editor.locator("span.citation").nth(1)).toHaveAttribute("data-label", "[2]");

  // Citing the first paper again reuses its number; two keys become a list.
  await page.getByRole("button", { name: "Cite…" }).click();
  await finder.getByRole("checkbox", { name: /Empagliflozin in chronic kidney disease/ }).check();
  await finder.getByRole("checkbox", { name: /Metformin and eGFR/ }).check();
  await finder.getByRole("button", { name: "Cite 2 papers" }).click();
  await expect(editor.locator("span.citation").nth(2)).toHaveAttribute("data-label", "[1,2]");

  const refs = page.locator(".write-refs li");
  await expect(refs).toHaveCount(2);
  await expect(refs.first()).toContainText("Herrington WG, EMPA-KIDNEY Group. Empagliflozin in chronic kidney disease.");
  await expect(refs.nth(1)).toContainText("Smith J. Metformin and eGFR.");
  await expect(page.locator(".write-footer")).toContainText(/\d+ words/);

  // Switching to APA relabels every citation and sorts the references.
  await page.getByLabel("Citation style").selectOption("apa");
  await expect(editor.locator("span.citation").first()).toHaveAttribute("data-label", "(Herrington & EMPA-KIDNEY Group, 2023)");
  await expect(editor.locator("span.citation").nth(2)).toHaveAttribute("data-label", "(Herrington & EMPA-KIDNEY Group, 2023; Smith, 2019)");
  await expect(refs.first()).toContainText("Herrington");
  await page.getByLabel("Citation style").selectOption("vancouver");

  // Word export contains the typed text, numbered citations and the reference list.
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Word (.docx)" }).click()]);
  expect(download.suggestedFilename()).toBe("sglt2-inhibitors-in-ckd.docx");
  const { value } = await mammoth.extractRawText({ path: await download.path() });
  expect(value).toContain("SGLT2 inhibitors in CKD");
  expect(value).toContain("SGLT2 inhibitors slow progression [1] while metformin needs dose changes [2] [1,2]");
  expect(value).toContain("References");
  expect(value).toContain("2. Smith J. Metformin and eGFR.");

  // Markdown and BibTeX exports.
  const [md] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Markdown" }).click()]);
  const fs = await import("node:fs/promises");
  const mdText = await fs.readFile(await md.path(), "utf8");
  expect(mdText).toContain("# SGLT2 inhibitors in CKD");
  expect(mdText).toContain("## References");
  const [bib] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "References (.bib)" }).click()]);
  expect((await fs.readFile(await bib.path(), "utf8")).match(/@article/g)).toHaveLength(2);

  // Everything is still there after a reload.
  await expect(page.locator(".save-state")).toContainText("Saved in this browser");
  await page.reload();
  await expect(page.getByRole("tab", { name: "Write" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Document title")).toHaveValue("SGLT2 inhibitors in CKD");
  await expect(page.locator(".write-surface")).toContainText("SGLT2 inhibitors slow progression");
  await expect(page.locator(".write-surface span.citation").nth(1)).toHaveAttribute("data-label", "[2]");
  await expect(page.locator(".write-refs li")).toHaveCount(2);
  await page.screenshot({ path: "test-results/write.png", fullPage: true });
});

test("citing a paper found through OpenAlex or a DOI", async ({ page }) => {
  await mockPubMed(page);
  await page.goto("/");
  await openWrite(page);
  const editor = page.locator(".write-surface");
  await editor.click();
  await page.keyboard.type("Statins help ");

  await page.getByRole("button", { name: "Cite…" }).click();
  const finder = page.getByRole("dialog", { name: "Cite papers" });
  // An empty reading list opens on the PubMed tab; use OpenAlex instead.
  await finder.getByRole("tab", { name: "OpenAlex" }).click();
  await finder.getByLabel("Search OpenAlex").fill("statins");
  await finder.getByRole("button", { name: "Search" }).click();
  await finder.getByRole("checkbox", { name: "Statins in older adults" }).check();
  await expect(finder.getByText("DOI 10.1000/statin")).toBeVisible();
  await finder.getByRole("button", { name: "Cite 1 paper" }).click();
  await expect(editor.locator("span.citation")).toHaveAttribute("data-label", "[1]");
  // Saved to the reading list too ("Also save" is on by default).
  await expect(page.locator("#reading-btn")).toHaveText("★ Reading list (1)");

  await page.keyboard.type("and so do other things ");
  await page.getByRole("button", { name: "Cite…" }).click();
  await finder.getByRole("tab", { name: "DOI / PMID" }).click();
  await finder.getByLabel("DOI or PMID").fill("https://doi.org/10.1000/xyz");
  await finder.getByRole("button", { name: "Look up" }).click();
  await finder.getByRole("checkbox", { name: "A trial of things" }).check();
  await finder.getByRole("button", { name: "Cite 1 paper" }).click();
  await expect(editor.locator("span.citation").nth(1)).toHaveAttribute("data-label", "[2]");
  const refs = page.locator(".write-refs li");
  await expect(refs.first()).toContainText("Popescu M, Smith J. Statins in older adults. The Lancet. 2022;399(3):100-110. doi:10.1000/statin.");
  await expect(refs.nth(1)).toContainText("Journal of Things");
  // Not-in-PubMed papers get no PMID in their reference.
  await expect(refs.first()).not.toContainText("PMID");
});

test("templates, formatting toolbar, links, and several documents", async ({ page }) => {
  await mockPubMed(page);
  await page.goto("/");
  await openWrite(page);

  await page.getByLabel("Template for a new document").selectOption("case");
  await page.getByRole("button", { name: "New document" }).click();
  await expect(page.getByLabel("Document title")).toHaveValue("Untitled case report");
  const editor = page.locator(".write-surface");
  await expect(editor.locator("h2")).toContainText(["Abstract", "Introduction", "Patient information"]);
  await expect(page.getByLabel("Choose document").locator("option")).toHaveCount(2);

  // Formatting: heading + bold + list.
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.getByLabel("Text style").selectOption("3");
  await page.keyboard.type("Extra heading");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Bold" }).click();
  await expect(page.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.type("important");
  await page.getByRole("button", { name: "Bold" }).click();
  await expect(page.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.type(" text");
  await expect(editor.locator("h3", { hasText: "Extra heading" })).toBeVisible();
  await expect(editor.locator("strong")).toHaveText("important");
  await page.getByRole("button", { name: "Bulleted list" }).click();
  await expect(editor.locator("ul li")).toHaveCount(1);

  // Link via the prompt.
  page.once("dialog", (d) => void d.accept("example.org/page"));
  await page.keyboard.press("Control+a");
  await page.getByRole("button", { name: "Link" }).click();
  await expect(editor.locator("a").first()).toHaveAttribute("href", "https://example.org/page");

  // A second, blank document; switching back restores the first.
  await page.getByLabel("Template for a new document").selectOption("blank");
  await page.getByRole("button", { name: "New document" }).click();
  await expect(page.getByLabel("Document title")).toHaveValue("Untitled document");
  await page.getByLabel("Choose document").selectOption({ label: "Untitled case report" });
  await expect(page.getByLabel("Document title")).toHaveValue("Untitled case report");
  await expect(editor.locator("h3", { hasText: "Extra heading" })).toBeVisible();

  // Deleting asks first.
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByLabel("Document title")).toHaveValue("Untitled document");
  // The blank documents remain: the first one opened with the tab and the one made above.
  await expect(page.getByLabel("Choose document").locator("option")).toHaveCount(2);
});

test("print view contains the document and hides the app", async ({ page }) => {
  await mockPubMed(page);
  await starBothPapers(page);
  await openWrite(page);
  await page.getByLabel("Document title").fill("Printable");
  await page.locator(".write-surface").click();
  await page.keyboard.type("Hello <b>world</b> ");
  await page.getByRole("button", { name: "Cite…" }).click();
  const finder = page.getByRole("dialog", { name: "Cite papers" });
  await finder.getByRole("checkbox", { name: /Metformin/ }).check();
  await finder.getByRole("button", { name: "Cite 1 paper" }).click();

  // Capture what would be printed instead of opening the print dialog.
  await page.evaluate(() => {
    const w = window as unknown as { __printed?: { html: string; bodyClass: string } };
    window.print = () => {
      w.__printed = { html: document.querySelector(".print-root")!.innerHTML, bodyClass: document.body.className };
    };
  });
  await page.getByRole("button", { name: "PDF (print)" }).click();
  const printed = await page.evaluate(() => (window as unknown as { __printed: { html: string; bodyClass: string } }).__printed);
  expect(printed.bodyClass).toContain("printing-write");
  expect(printed.html).toContain("<h1 class=\"doc-title\">Printable</h1>");
  expect(printed.html).toContain("Hello &lt;b&gt;world&lt;/b&gt;");
  expect(printed.html).toContain('<span class="cite">[1]</span>');
  expect(printed.html).toContain("Smith J. Metformin and eGFR.");

  // With the print stylesheet, only the print root is visible.
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("header.top")).toBeHidden();
  await expect(page.locator(".print-root")).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator(".print-root")).toHaveCount(0);
  await expect(page.locator("header.top")).toBeVisible();
});

test("matrix: rows from the reading list, decisions, suggestions, columns, export", async ({ page }) => {
  await mockPubMed(page);
  await starBothPapers(page);
  await page.getByRole("tab", { name: "Matrix" }).click();
  const rows = page.locator("table.matrix tbody tr");
  const empaRow = page.locator('tr[data-key="111"]');
  await expect(rows).toHaveCount(2);
  await expect(empaRow).toContainText("Herrington & EMPA-KIDNEY Group, 2023");

  await page.getByLabel("Decision for Herrington & EMPA-KIDNEY Group, 2023").selectOption("include");
  await expect(empaRow).toHaveClass(/decision-include/);
  await page.getByLabel("Decision for Smith, 2019").selectOption("exclude");
  await expect(page.locator(".matrix-tab p.muted.small[role=status]")).toContainText("1 included · 1 excluded");

  // Suggestions fill the design cell from the publication type; own text is kept.
  await page.getByLabel("Key finding for Smith, 2019").fill("No effect on eGFR");
  await page.getByRole("button", { name: "Suggest design and size" }).click();
  await expect(page.getByLabel("Study design for Herrington & EMPA-KIDNEY Group, 2023")).toHaveValue("Randomized controlled trial");
  await expect(page.getByLabel("Key finding for Smith, 2019")).toHaveValue("No effect on eGFR");

  // A new column.
  page.once("dialog", (d) => void d.accept("Funding"));
  await page.getByRole("button", { name: "Add column" }).click();
  await page.getByLabel("Funding for Smith, 2019").fill("Industry");
  await page.locator("#panel-matrix").getByLabel("Show", { exact: true }).selectOption("include");
  await expect(rows).toHaveCount(1);
  await page.locator("#panel-matrix").getByLabel("Show", { exact: true }).selectOption("all");

  const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "CSV" }).click()]);
  const fs = await import("node:fs/promises");
  const text = await fs.readFile(await csv.path(), "utf8");
  expect(text).toContain("Decision,Study design,Population / setting,Sample size,Intervention / exposure,Main outcome,Key finding,Limitations / risk of bias,Funding");
  expect(text).toContain("No effect on eGFR");
  expect(text).toContain("Industry");
  expect(text).toContain("Include,Randomized controlled trial");

  const [docx] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Word table" }).click()]);
  const { value } = await mammoth.extractRawText({ path: await docx.path() });
  expect(value).toContain("Literature matrix");
  expect(value).toContain("Industry");

  // The matrix is saved; so is the reading list it is built from.
  await page.reload();
  await page.getByRole("tab", { name: "Matrix" }).click();
  await expect(page.getByLabel("Funding for Smith, 2019")).toHaveValue("Industry");
  await expect(page.getByLabel("Decision for Smith, 2019")).toHaveValue("exclude");
  await page.screenshot({ path: "test-results/matrix.png", fullPage: true });

  // Removing a paper from the reading list removes its row.
  page.once("dialog", (d) => void d.accept());
  await page.locator('tr[data-key="222"]').getByRole("button", { name: "Remove" }).click();
  await expect(rows).toHaveCount(1);
});

test("matrix: add papers from OpenAlex, and the empty state", async ({ page }) => {
  await mockPubMed(page);
  await page.goto("/");
  await page.getByRole("tab", { name: "Matrix" }).click();
  await expect(page.getByText("No papers yet.")).toBeVisible();
  await page.getByRole("button", { name: "Add papers" }).click();
  const finder = page.getByRole("dialog", { name: "Add papers to the matrix" });
  await expect(finder.getByText("Also save to my reading list")).toHaveCount(0);
  await finder.getByRole("tab", { name: "OpenAlex" }).click();
  await finder.getByLabel("Search OpenAlex").fill("statins");
  await finder.getByRole("button", { name: "Search" }).click();
  await finder.getByRole("checkbox", { name: "Statins in older adults" }).check();
  await finder.getByRole("button", { name: "Add 1 paper" }).click();
  await expect(page.locator("table.matrix tbody tr")).toHaveCount(1);
  await expect(page.locator("table.matrix tbody tr")).toContainText("Popescu & Smith, 2022");
});

test("tabs keep the shared search link, and a reload stays on the open tab", async ({ page }) => {
  await mockPubMed(page);
  await page.goto("/");
  await page.getByLabel("PubMed query").fill("ckd");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".paper")).toHaveCount(2);
  expect(page.url()).toContain("#q=ckd");

  await page.getByRole("tab", { name: "Matrix" }).click();
  expect(page.url()).not.toContain("#q=");
  await page.getByRole("tab", { name: "Search" }).click();
  expect(page.url()).toContain("#q=ckd");
  await expect(page.locator(".paper")).toHaveCount(2);

  // A shared link opens the Search tab even if another tab was open last time.
  await page.getByRole("tab", { name: "Matrix" }).click();
  await page.goto(page.url() + "#q=asthma");
  await page.reload();
  await expect(page.getByRole("tab", { name: "Search" })).toHaveAttribute("aria-selected", "true");

  // Arrow keys move between tabs.
  await page.getByRole("tab", { name: "Search" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Matrix" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Search" })).toHaveAttribute("aria-selected", "true");
});
