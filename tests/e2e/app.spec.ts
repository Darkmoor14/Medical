import { expect, test, type Page } from "@playwright/test";
import { EFETCH_XML } from "../fixtures";

// Fake engine: tags a fixed vocabulary with regexes instead of running models.
async function installFakeEngine(page: Page) {
  await page.addInitScript(() => {
    const vocab: [RegExp, string][] = [
      [/chronic kidney disease|CKD/gi, "DISEASE"],
      [/empagliflozin|metformin|SGLT2 inhibitors/gi, "CHEM"],
    ];
    const find = (text: string) => {
      const out: { start: number; end: number; label: string; score: number }[] = [];
      for (const [re, label] of vocab) {
        for (const m of text.matchAll(re)) out.push({ start: m.index!, end: m.index! + m[0].length, label, score: 0.95 });
      }
      return out;
    };
    (window as unknown as Record<string, unknown>).__openmedTestEngine = {
      configure: async () => null,
      preload: async () => null,
      // Tests can hold the analysis back to check that papers show first.
      extractMany: async ({ docs }: { docs: { id: string; text: string }[] }) => {
        const w = window as unknown as { __holdAnalysis?: Promise<void> };
        if (w.__holdAnalysis) await w.__holdAnalysis;
        return docs.map((d) => ({ id: d.id, spans: find(d.text) }));
      },
    };
  });
}

async function mockPubMed(page: Page, opts: { spelling?: string } = {}) {
  const requests: string[] = [];
  await page.route("https://eutils.ncbi.nlm.nih.gov/**", async (route) => {
    const req = route.request();
    const body = req.postData() ?? "";
    const params = new URLSearchParams(body);
    const json = (data: unknown) =>
      route.fulfill({ contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(data) });
    const xml = (data: string) =>
      route.fulfill({ contentType: "text/xml", headers: { "Access-Control-Allow-Origin": "*" }, body: data });
    if (req.url().includes("espell")) {
      return xml(`<eSpellResult><CorrectedQuery>${opts.spelling ?? ""}</CorrectedQuery></eSpellResult>`);
    }
    if (req.url().includes("elink")) {
      return json({ linksets: [{ linksetdbs: [{ linkname: "pubmed_pubmed", links: ["111", "222"] }] }] });
    }
    if (params.get("db") === "mesh") {
      if (req.url().includes("esearch")) return json({ esearchresult: { idlist: ["1", "2"] } });
      return json({ result: { "1": { ds_meshterms: ["Heart Failure"] }, "2": { ds_meshterms: ["Heart Failure, Diastolic"] } } });
    }
    requests.push(body);
    if (req.url().includes("esearch")) {
      return json({ esearchresult: { count: "1234", idlist: ["111", "222"], querytranslation: "translated by pubmed" } });
    }
    return xml(EFETCH_XML);
  });
  await page.route("https://icite.od.nih.gov/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ data: [{ pmid: 111, citation_count: 1200, relative_citation_ratio: 25.3 }, { pmid: 222, citation_count: 3 }] }),
    }),
  );
  return requests;
}

test.beforeEach(async ({ page }) => {
  await installFakeEngine(page);
});

test("opens straight on the PubMed search", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Search PubMed/ })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByText("Load synthetic example")).toHaveCount(0);
});

test("searches PubMed, tallies terms and filters papers", async ({ page }) => {
  const requests = await mockPubMed(page);
  await page.goto("/");
  await page.getByLabel("PubMed query").fill("empagliflozin ckd");
  await page.getByRole("button", { name: "Search", exact: true }).click();

  await expect(page.getByText("1,234")).toBeVisible();
  expect(new URLSearchParams(requests[0]).get("term")).toBe("(empagliflozin ckd)");
  const empa = page.getByRole("button", { name: /Empagliflozin/i }).first();
  await expect(empa).toBeVisible();
  await empa.click();
  await expect(page.getByRole("heading", { name: /Papers mentioning/ })).toBeVisible();
  await expect(page.locator(".paper")).toHaveCount(1);
  await page.screenshot({ path: "test-results/miner-tab.png", fullPage: true });
});

test("shows papers before the on-device analysis finishes", async ({ page }) => {
  await mockPubMed(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __holdAnalysis?: Promise<void>; __release?: () => void };
    w.__holdAnalysis = new Promise((r) => (w.__release = r));
  });
  await page.goto("/");
  await page.getByLabel("PubMed query").fill("empagliflozin");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".paper")).toHaveCount(2);
  await expect(page.locator("progress")).toBeVisible();
  await page.evaluate(() => (window as unknown as { __release: () => void }).__release());
  await expect(page.getByRole("button", { name: /Empagliflozin/i }).first()).toBeVisible();
});

test("filters show as chips and are added to the PubMed search", async ({ page }) => {
  const requests = await mockPubMed(page);
  await page.goto("/");
  await page.getByLabel("PubMed query").fill("asthma");
  await page.getByText("Filters", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Meta-analysis" }).check();
  await page.getByRole("checkbox", { name: "Free full text" }).check();
  await page.getByRole("button", { name: "Last 5 years" }).click();
  await expect(page.locator(".filter-chip")).toHaveCount(3);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("1,234")).toBeVisible();
  const term = new URLSearchParams(requests[0]).get("term")!;
  expect(term).toContain("(asthma) AND meta-analysis[pt]");
  expect(term).toContain("free full text[sb]");
  expect(term).toMatch(/"\d{4}\/01\/01"\[dp\]/);

  await page.locator(".filter-chip", { hasText: "Meta-analysis" }).click();
  await expect(page.locator(".filter-chip")).toHaveCount(2);
});

test("Romanian search terms are searched in English", async ({ page }) => {
  const requests = await mockPubMed(page);
  await page.goto("/");
  await page.getByLabel("PubMed query").fill("insuficiență cardiacă și diabet zaharat");
  await expect(page.getByText("Searching in English:")).toContainText("heart failure AND diabetes mellitus");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("1,234")).toBeVisible();
  expect(new URLSearchParams(requests[0]).get("term")).toBe("(heart failure AND diabetes mellitus)");
});

test("MeSH suggestions and spelling corrections", async ({ page }) => {
  await mockPubMed(page, { spelling: "heart failure" });
  await page.goto("/");
  await page.getByLabel("PubMed query").fill("heart failur");
  await page.getByRole("button", { name: "Heart Failure, Diastolic" }).click();
  await expect(page.getByLabel("PubMed query")).toHaveValue('"Heart Failure, Diastolic"[MeSH Terms]');

  await page.getByLabel("PubMed query").fill("heart failur");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("Did you mean")).toBeVisible();
  await page.getByRole("button", { name: "heart failure", exact: true }).click();
  await expect(page.getByLabel("PubMed query")).toHaveValue("heart failure");
});

test("clinical question builder writes the search", async ({ page }) => {
  const requests = await mockPubMed(page);
  await page.goto("/");
  await page.getByText("Clinical question (PICO)").click();
  await page.getByLabel("Patient / problem").fill("heart failure, cardiac failure");
  await page.getByLabel("Intervention").fill("dapagliflozin");
  await page.getByLabel("Outcome (optional)").fill("mortality");
  await page.getByLabel("Clinical question type").selectOption("therapy");
  await page.getByRole("button", { name: "Build search and run" }).click();
  await expect(page.getByText("1,234")).toBeVisible();
  const term = new URLSearchParams(requests[0]).get("term")!;
  expect(term).toBe("(((heart failure) OR (cardiac failure)) AND dapagliflozin AND mortality) AND Therapy/Broad[filter]");
  await expect(page.locator(".filter-chip")).toContainText("Clinical query: Therapy (broad)");
});

test("a shared link reopens and reruns the search", async ({ page }) => {
  const requests = await mockPubMed(page);
  await page.goto("/");
  await page.getByLabel("PubMed query").fill("copd");
  await page.getByText("Filters", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Randomized controlled trial" }).check();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("1,234")).toBeVisible();
  const url = page.url();
  expect(url).toContain("#q=copd");

  const other = await page.context().newPage();
  const otherRequests = await mockPubMed(other);
  await other.goto(url);
  await expect(other.getByLabel("PubMed query")).toHaveValue("copd");
  await expect(other.locator(".filter-chip")).toContainText("Randomized controlled trial");
  await expect(other.locator(".paper")).toHaveCount(2);
  expect(new URLSearchParams(otherRequests[0]).get("term")).toBe(new URLSearchParams(requests[0]).get("term"));
});

test("evidence badges, retraction warning, citations and ordering", async ({ page }) => {
  await mockPubMed(page);
  await page.goto("/");
  await page.getByLabel("PubMed query").fill("ckd");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const first = page.locator(".paper").first();
  await expect(first.locator(".level")).toHaveText("Randomized trial");
  await expect(first).toContainText("1,200 citations · RCR 25.3");
  const retracted = page.locator(".paper", { hasText: "Metformin and eGFR" });
  await expect(retracted.locator(".warning.danger")).toContainText("Retracted");

  await page.getByLabel("Order papers by").selectOption("newest");
  await expect(page.locator(".paper h3").first()).toContainText("Empagliflozin");
  await page.getByRole("button", { name: "Randomized trial 1" }).click();
  await expect(page.locator(".paper")).toHaveCount(1);
});

test("similar articles open as a new list with a way back", async ({ page }) => {
  await mockPubMed(page);
  await page.goto("/");
  await page.getByLabel("PubMed query").fill("ckd");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.locator(".paper").first().getByRole("button", { name: "Similar articles" }).click();
  await expect(page.getByRole("heading", { name: /Similar to “Empagliflozin/ })).toBeVisible();
  await expect(page.locator(".paper")).toHaveCount(1);
  await page.getByRole("button", { name: "← Back to search results" }).click();
  await expect(page.getByRole("heading", { name: "Papers (2)" })).toBeVisible();
});

test("highlight legend turns categories on and off", async ({ page }) => {
  await mockPubMed(page);
  await page.goto("/");
  await page.getByLabel("PubMed query").fill("ckd");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const legend = page.getByRole("group", { name: "Highlight categories" });
  await expect(legend).toBeVisible();
  await legend.getByRole("checkbox", { name: /Drug/ }).uncheck();
  await expect(page.locator(".papers")).toHaveClass(/hide-cat-drug/);
  await page.screenshot({ path: "test-results/stage2.png", fullPage: true });
});

test("trends, merged synonyms and terms mentioned together", async ({ page }) => {
  await mockPubMed(page);
  await page.goto("/");
  await page.getByLabel("PubMed query").fill("ckd");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  // "chronic kidney disease" and "CKD" (defined in the abstract as SGLT2… CKD) count as one term.
  await expect(page.getByRole("button", { name: /Empagliflozin/i }).first()).toBeVisible();
  const conditions = page.locator(".term-col", { hasText: "Condition" });
  await expect(conditions.locator(".bar-row")).toHaveCount(1);
  await expect(conditions.locator(".bar-row")).toContainText("chronic kidney disease");
  await expect(conditions.locator(".bar-value")).toHaveText("1");
  const trends = page.locator("section", { has: page.getByRole("heading", { name: "Trends" }) });
  await expect(trends.getByText("Papers per year (the 2 shown)")).toBeVisible();
  await expect(trends.getByText("Top journals among the papers shown")).toBeVisible();
  await trends.getByText("Show as table").first().click();
  await expect(trends.locator("table").first()).toContainText("2023");

  await page.getByRole("button", { name: /Empagliflozin/i }).first().click();
  await expect(page.getByText(/Often mentioned together with/)).toBeVisible();

  await trends.getByRole("button", { name: /Show the trend for all 1,234 results/ }).click();
  await expect(trends.getByText(/All 1,234 PubMed results per year/)).toBeVisible({ timeout: 25_000 });
  await page.screenshot({ path: "test-results/stage3.png", fullPage: true });
});

test("settings dialog saves choices", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByText("Romanian notes")).toHaveCount(0);
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
});
