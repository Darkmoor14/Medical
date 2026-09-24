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
      extractMany: async ({ docs }: { docs: { id: string; text: string }[] }) =>
        docs.map((d) => ({ id: d.id, spans: find(d.text) })),
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
  await page.getByRole("button", { name: "Search & analyze" }).click();

  await expect(page.getByText(/Analyzed 2 of 1,234/)).toBeVisible();
  expect(requests[0]).toContain("term=empagliflozin+ckd");
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
