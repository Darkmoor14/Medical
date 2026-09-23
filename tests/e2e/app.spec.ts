import { expect, test, type Page } from "@playwright/test";
import { EFETCH_XML } from "../fixtures";
import mammoth from "mammoth";

// Fake engine: tags a fixed vocabulary with regexes instead of running models.
async function installFakeEngine(page: Page) {
  await page.addInitScript(() => {
    const vocab: [RegExp, string][] = [
      [/Jordan Avery|Casey Morgan|04\/12\/1961|00482913|\(555\) 201-7788|Riverside General Hospital/g, "PII"],
      [/type 2 diabetes mellitus|chronic kidney disease|community-acquired pneumonia|atrial fibrillation/gi, "DISEASE"],
      // Sub-word fragments, as a real token classifier can return them.
      [/men(?=ingeal)|l irritation/g, "DISEASE"],
      [/apixaban|ceftriaxone|azithromycin|metformin|empagliflozin/gi, "CHEM"],
    ];
    const find = (text: string, kind: "pii" | "ner") => {
      const out: { start: number; end: number; label: string; score: number }[] = [];
      for (const [re, label] of vocab) {
        if ((label === "PII") !== (kind === "pii")) continue;
        for (const m of text.matchAll(re)) {
          out.push({ start: m.index!, end: m.index! + m[0].length, label: kind === "pii" ? "NAME" : label, score: 0.95 });
        }
      }
      return out;
    };
    (window as unknown as Record<string, unknown>).__openmedTestEngine = {
      configure: async () => null,
      preload: async () => null,
      analyzeNote: async ({ text }: { text: string }) => ({ pii: find(text, "pii"), clinical: find(text, "ner") }),
      // Phrase-table "translation" standing in for the NLLB model.
      translate: async ({ segments }: { segments: string[] }) => {
        const table: [RegExp, string][] = [
          [/Diabet zaharat tip 2/gi, "Type 2 diabetes mellitus"],
          [/Boală cronică de rinichi/gi, "Chronic kidney disease"],
          [/Fibrilație atrială/gi, "Atrial fibrillation"],
          [/Pneumonie comunitară/gi, "Community-acquired pneumonia"],
          [/ceftriaxonă/gi, "ceftriaxone"],
          [/azitromicină/gi, "azithromycin"],
          [/Metforminul/gi, "Metformin"],
        ];
        return segments.map((seg) => table.reduce((t, [re, en]) => t.replace(re, en), seg));
      },
      extractMany: async ({ docs }: { docs: { id: string; text: string }[] }) =>
        docs.map((d) => ({ id: d.id, spans: find(d.text, "ner") })),
    };
  });
}

async function mockPubMed(page: Page) {
  const requests: string[] = [];
  await page.route("https://eutils.ncbi.nlm.nih.gov/**", async (route) => {
    const req = route.request();
    requests.push(req.postData() ?? "");
    if (req.url().includes("esearch")) {
      await route.fulfill({
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ esearchresult: { count: "1234", idlist: ["111", "222"], querytranslation: "" } }),
      });
    } else {
      await route.fulfill({ contentType: "text/xml", headers: { "Access-Control-Allow-Origin": "*" }, body: EFETCH_XML });
    }
  });
  return requests;
}

test.beforeEach(async ({ page }) => {
  await installFakeEngine(page);
});

test("note → de-identify → PubMed evidence, without leaking identifiers", async ({ page }) => {
  const requests = await mockPubMed(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Load synthetic example" }).click();
  await page.getByRole("button", { name: "Analyze note" }).click();

  const view = page.locator(".note-view");
  await expect(view).toContainText("[");
  await expect(view).not.toContainText("Jordan Avery");
  await expect(view.locator(".redacted")).toHaveCount(6);

  await expect(page.getByRole("checkbox", { name: /chronic kidney disease/i })).toBeChecked();
  // Fragments are joined into one negated term that is not pre-selected.
  const negated = page.getByRole("checkbox", { name: /meningeal irritation/i });
  await expect(negated).not.toBeChecked();
  await expect(page.locator(".chip.negated")).toContainText("negated");
  await expect(view.locator("mark.negated")).toHaveText("meningeal irritation");
  const query = page.getByLabel("PubMed query");
  await expect(query).toHaveValue(/"chronic kidney disease"\[tiab\]/);

  // Typing an identifier into the query blocks the search.
  const generated = await query.inputValue();
  await query.fill(`${generated} AND Jordan Avery`);
  await expect(page.getByRole("alert")).toContainText("Jordan Avery");
  await expect(page.getByRole("button", { name: "Search PubMed" })).toBeDisabled();
  await page.getByRole("button", { name: "Reset to generated query" }).click();

  await page.getByRole("button", { name: "Search PubMed" }).click();
  await expect(page.locator(".paper")).toHaveCount(2);
  await expect(page.getByText("Showing 2 of 1,234 results.")).toBeVisible();
  await expect(page.locator(".paper").first()).toContainText("Empagliflozin in chronic kidney disease.");

  // Nothing from the note except the query should have reached NCBI.
  for (const body of requests) {
    for (const phi of ["Jordan", "Avery", "00482913", "Riverside"]) expect(body).not.toContain(phi);
  }
  await page.screenshot({ path: "test-results/note-tab.png", fullPage: true });
});

test("Romanian note: rule-based identifiers, on-device translation, English terms", async ({ page }) => {
  const requests = await mockPubMed(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Exemplu sintetic (RO)" }).click();
  await page.getByRole("button", { name: "Analyze note" }).click();

  await expect(page.getByText(/Romanian note\. Found/)).toBeVisible();
  const view = page.locator(".note-view").first();
  for (const phi of ["Popescu", "1610412400010", "RX nr. 123456", "Eminescu", "0722 123 456", "4821/2024", "Ionescu", "18.03.2024", "București"]) {
    await expect(view).not.toContainText(phi);
  }
  await expect(view).toContainText("[CNP]");

  const translation = page.locator("section", { hasText: "English translation" });
  await expect(translation).toContainText("Type 2 diabetes mellitus");
  await expect(translation).not.toContainText("Popescu");

  const query = page.getByLabel("PubMed query");
  await expect(query).toHaveValue(/"Atrial fibrillation"\[tiab\]/);
  await page.getByRole("button", { name: "Search PubMed" }).click();
  await expect(page.locator(".paper")).toHaveCount(2);
  for (const body of requests) {
    for (const phi of ["Popescu", "Ionescu", "1610412400010", "Eminescu"]) expect(body).not.toContain(phi);
  }
  await page.screenshot({ path: "test-results/romanian.png", fullPage: true });
});

for (const file of ["scrisoare.docx", "scrisoare.pdf"]) {
  test(`reads ${file} in the browser and de-identifies it`, async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Open document").setInputFiles(`tests/fixtures/docs/${file}`);
    const note = page.getByLabel("Clinical note");
    await expect(note).toHaveValue(/Fibrilație atrială/);
    await expect(note).toHaveValue(/Pacient: Popescu Ion, CNP 1610412400010/);
    await expect(page.getByText(new RegExp(`Loaded ${file.replace(".", "\\.")}`))).toBeVisible();

    await page.getByRole("button", { name: "Analyze note" }).click();
    const view = page.locator(".note-view").first();
    await expect(view).toContainText("[CNP]");
    await expect(view).not.toContainText("Popescu");
  });
}

test("rejects old .doc files with a clear message", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Open document").setInputFiles({
    name: "vechi.doc",
    mimeType: "application/msword",
    buffer: Buffer.from("x"),
  });
  await expect(page.getByText(/Old \.doc files are not supported/)).toBeVisible();
});

test("drafts a discharge letter from a Romanian note and downloads it as .docx", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Exemplu sintetic (RO)" }).click();
  await page.getByRole("button", { name: "Analyze note" }).click();

  const card = page.locator("section", { has: page.getByRole("heading", { name: "Draft a document" }) });
  await expect(card).toBeVisible();
  await expect(card.getByLabel("Patient name")).toHaveValue("Popescu Ion");
  await expect(card.getByLabel("CNP")).toHaveValue("1610412400010");
  await expect(card.getByLabel("Diagnosis 1", { exact: true })).toHaveValue("Diabet zaharat tip 2");
  await expect(card.getByLabel("Diagnosis 4", { exact: true })).toHaveValue("Fibrilație atrială");

  await card.getByLabel("ICD-10 code for diagnosis 1").fill("E11.9");
  await card.getByRole("radio", { name: "Not needed" }).first().check();
  const preview = card.locator(".doc-preview");
  await expect(preview).toContainText("pacientul Popescu Ion");
  await expect(preview).toContainText("Diabet zaharat tip 2 (E11.9)");
  await expect(preview).toContainText("[x] Nu s-a eliberat prescripție medicală deoarece nu a fost necesar");

  // Editing the query above must not reset the draft.
  await page.getByRole("checkbox", { name: /Atrial fibrillation/ }).uncheck();
  await expect(card.getByLabel("ICD-10 code for diagnosis 1")).toHaveValue("E11.9");

  const [download] = await Promise.all([page.waitForEvent("download"), card.getByRole("button", { name: "Download .docx" }).click()]);
  expect(download.suggestedFilename()).toBe("scrisoare-medicala-PROIECT.docx");
  const { value } = await mammoth.extractRawText({ path: await download.path() });
  expect(value).toContain("SCRISOARE MEDICALĂ / BILET DE EXTERNARE");
  expect(value).toContain("PROIECT generat automat");
  expect(value).toContain("Diabet zaharat tip 2 (E11.9)");
  expect(value).toContain("Popescu Ion");

  await card.getByLabel("Document type").selectOption("referral");
  await card.getByLabel("Refer to (specialty)").fill("nefrologie");
  await expect(preview).toContainText("Către: specialitatea nefrologie");
  await card.screenshot({ path: "test-results/draft.png" });
});

test("literature miner tallies terms and filters papers", async ({ page }) => {
  await mockPubMed(page);
  await page.goto("/");
  await page.getByRole("tab", { name: "Literature miner" }).click();
  await page.getByLabel("PubMed query").fill("empagliflozin ckd");
  await page.getByRole("button", { name: "Search & analyze" }).click();

  await expect(page.getByText(/Analyzed 2 of 1,234/)).toBeVisible();
  const empa = page.getByRole("button", { name: /Empagliflozin/i }).first();
  await expect(empa).toBeVisible();
  await empa.click();
  await expect(page.getByRole("heading", { name: /Papers mentioning/ })).toBeVisible();
  await expect(page.locator(".paper")).toHaveCount(1);
  await page.screenshot({ path: "test-results/miner-tab.png", fullPage: true });
});

test("settings dialog saves choices", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("checkbox", { name: /Genes & proteins/ }).check();
  await page.getByRole("radio", { name: /Accurate/ }).check();
  await page.getByRole("button", { name: "Save" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("checkbox", { name: /Genes & proteins/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: /Accurate/ })).toBeChecked();
});

test("fits a phone-width screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/mobile.png" });
});
