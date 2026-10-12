import { expect, test, type Page } from "@playwright/test";
import { installFakeEngine, mockPubMed, mockSources } from "./helpers";

test.beforeEach(async ({ page }) => {
  await installFakeEngine(page);
  await mockSources(page);
});

async function openStats(page: Page, section?: string) {
  await page.getByRole("tab", { name: "Stats" }).click();
  await expect(page.getByRole("group", { name: "Statistics tools" })).toBeVisible();
  if (section) await page.getByRole("button", { name: section, exact: true }).click();
}

test("calculators: risk comparison and test accuracy", async ({ page }) => {
  await page.goto("/");
  await openStats(page);

  await expect(page.getByText("Enter the four counts").first()).toBeVisible();
  await page.getByLabel("Treated / exposed, Outcome").fill("20");
  await page.getByLabel("Treated / exposed, No outcome").fill("80");
  await page.getByLabel("Control / unexposed, Outcome").fill("10");
  await page.getByLabel("Control / unexposed, No outcome").fill("90");
  const risk = page.locator("section.card", { hasText: "Compare two groups" });
  await expect(risk.getByRole("row", { name: /Risk ratio/ })).toContainText("2 (");
  await expect(risk.getByRole("row", { name: /Odds ratio/ })).toContainText("2.25 (0.99 to 5.09)");
  await expect(risk.getByRole("row", { name: /Number needed/ })).toContainText("10");
  await expect(risk.getByRole("row", { name: /Fisher/ })).toContainText("p = ");

  // Bad input is reported, not calculated.
  await page.getByLabel("Treated / exposed, Outcome").fill("2.5");
  await expect(risk.getByRole("status")).toContainText("whole numbers");

  const dx = page.locator("section.card", { hasText: "Test accuracy" });
  await dx.getByLabel("Test positive, Disease", { exact: true }).fill("90");
  await dx.getByLabel("Test positive, No disease").fill("20");
  await dx.getByLabel("Test negative, Disease", { exact: true }).fill("10");
  await dx.getByLabel("Test negative, No disease").fill("80");
  await expect(dx.getByRole("row", { name: /Sensitivity/ })).toContainText("90.0%");
  await expect(dx.getByRole("row", { name: /Positive likelihood/ })).toContainText("4.5");
  await dx.getByLabel("Pre-test probability (%)").fill("50");
  await expect(dx.getByText(/positive test gives 81\.8%/)).toBeVisible();
  // Typing in an extra field must not lose focus.
  await dx.getByLabel("Prevalence in your population (%)").pressSequentially("5");
  await expect(dx.getByText(/At a prevalence of 5%/)).toBeVisible();
});

test("my data: paste a table, summarise, compare groups, correlate", async ({ page }) => {
  await page.goto("/");
  await openStats(page, "My data");
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.getByText("10 rows, 5 columns (3 numeric)")).toBeVisible();
  await expect(page.getByRole("row", { name: /^sbp_before/ })).toContainText("±");

  // Default comparison is a numeric column by a category column.
  const cmp = page.locator("section.card", { hasText: "Compare groups" });
  await cmp.getByLabel("Variable").selectOption("sbp_after");
  await cmp.getByLabel("Compare by").selectOption("treatment");
  await expect(cmp.getByRole("row", { name: /Welch/ })).toContainText("p = ");
  await expect(cmp.getByRole("row", { name: /Mann/ })).toContainText("U = ");
  // A categorical variable gives a cross-table and chi-square.
  await cmp.getByLabel("Variable").selectOption("sex");
  await cmp.getByLabel("Compare by").selectOption("treatment");
  await expect(cmp.getByRole("row", { name: /Chi-square/ })).toContainText("χ²(1)");

  const rel = page.locator("section.card", { hasText: "Relationship between" });
  await rel.getByLabel("X axis").selectOption("sbp_before");
  await rel.getByLabel("Y axis").selectOption("sbp_after");
  await expect(rel.getByRole("row", { name: /Pearson r/ })).toContainText("p = ");
  await expect(rel.locator("svg.chart circle.dot")).toHaveCount(10);

  // Errors and clearing.
  await page.getByLabel("Data table").fill("only a header");
  await page.getByRole("button", { name: "Analyse" }).click();
  await expect(page.getByRole("status").filter({ hasText: /header row/ })).toBeVisible();
  await expect(page.getByText("Compare groups")).toHaveCount(0);
});

test("my data: semicolon file with decimal commas", async ({ page }) => {
  await page.goto("/");
  await openStats(page, "My data");
  await page.getByLabel("Data table").fill("grupa;greutate\nA;70,5\nA;72,5\nB;80,0\nB;82,0\nB;81,0");
  await page.getByRole("button", { name: "Analyse" }).click();
  await expect(page.getByText("5 rows, 2 columns (1 numeric)")).toBeVisible();
  await expect(page.getByRole("row", { name: /^greutate/ })).toContainText("77.2 ± 5.");
});

test("meta-analysis: pooled result, forest plot, heterogeneity, paste, reload", async ({ page }) => {
  await page.goto("/");
  await openStats(page, "Meta-analysis");
  await expect(page.getByText("Needs at least two studies")).toBeVisible();
  await page.getByRole("button", { name: "Add study by hand" }).click();

  const fill = async (i: number, v: [string, string, string, string]) => {
    await page.getByLabel(`Name of study ${i}`).fill(v[0]);
    await page.getByLabel(`Estimate of study ${i}`).fill(v[1]);
    await page.getByLabel(`Lower limit of study ${i}`).fill(v[2]);
    await page.getByLabel(`Upper limit of study ${i}`).fill(v[3]);
  };
  await fill(1, ["Smith 2019", "0.50", "0.40", "0.625"]);
  await fill(2, ["Jones 2020", "1.50", "1.20", "1.875"]);
  await page.getByRole("button", { name: "Add study by hand" }).click();
  await fill(3, ["Popa 2021", "1.00", "0.80", "1.25"]);

  const result = page.locator("section.card", { hasText: "Result" }).last();
  await expect(result.getByRole("row", { name: /Random effects/ })).toContainText("0.909");
  await expect(result.getByRole("row", { name: /^I²/ })).toContainText("%");
  await expect(result.getByText(/Heterogeneity is high/)).toBeVisible();
  await expect(result.locator("svg.forest")).toBeVisible();
  await expect(result.locator("svg.forest rect.box")).toHaveCount(3);
  await expect(result.locator("svg.forest polygon")).toHaveCount(2);

  // Paste more rows.
  await page.getByText("Paste several studies at once").click();
  await page.getByLabel("Rows to paste").fill("Ionescu 2022; 0.9; 0.7; 1.16\nbad line");
  await page.getByRole("button", { name: "Add these rows" }).click();
  await expect(page.getByLabel("Name of study 4")).toHaveValue("Ionescu 2022");

  // An unusable row is reported and left out.
  await page.getByRole("button", { name: "Add study by hand" }).click();
  await fill(5, ["Broken", "5", "6", "7"]);
  await expect(result.getByText(/Left out.*Broken/)).toBeVisible();

  // Survives a reload.
  await page.reload();
  await openStats(page);
  await expect(page.getByRole("tab", { name: "Stats" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Meta-analysis", exact: true }).click();
  await expect(page.getByLabel("Name of study 1")).toHaveValue("Smith 2019");

  // Difference scale switches the measures.
  await page.getByLabel("Type of result").selectOption("difference");
  await expect(page.getByLabel("Measure")).toHaveValue("Mean difference");
});

test("reading list overview and meta rows from the matrix", async ({ page }) => {
  await mockPubMed(page);
  await page.goto("/");
  await openStats(page, "My reading list");
  await expect(page.getByText("Your reading list is empty")).toBeVisible();

  await page.getByRole("tab", { name: "Search" }).click();
  await page.getByLabel("PubMed query").fill("ckd");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".paper")).toHaveCount(2);
  for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Add to reading list" }).first().click();

  // Mark one paper "Include" in the matrix.
  await page.getByRole("tab", { name: "Matrix" }).click();
  await page.getByLabel(/^Decision for/).first().selectOption("include");

  await openStats(page, "My reading list");
  await expect(page.locator(".stat-tile").first()).toContainText("2");
  await expect(page.getByText("Strength of evidence")).toBeVisible();
  await expect(page.getByText("Screening decisions")).toBeVisible();

  await page.screenshot({ path: "test-results/stats.png", fullPage: true });
});

function seedList(page: Page) {
  const paper = (pmid: string, author: string, year: string, abstract: string) => ({
    article: {
      pmid, title: `${author} trial of therapy ${pmid}`, abstract, authors: [`${author} A`], journal: "J Test", year,
      pubTypes: ["Randomized Controlled Trial"], doi: null, pmcid: null, journalTitle: "J Test", volume: "", issue: "", pages: "", month: "",
      authorsFull: [{ last: author, fore: "A", initials: "A", collective: "" }], meshTerms: [], retracted: false, concern: false,
    },
    note: "",
    addedAt: "2026-01-01T00:00:00Z",
  });
  return page.addInitScript((papers) => {
    if (localStorage.getItem("opm-reading-lists-v2")) return;
    localStorage.setItem("opm-reading-lists-v2", JSON.stringify({ active: "default", lists: [{ id: "default", name: "My reading list", papers }] }));
  }, [
    paper("901", "Smith", "2019", "We randomised 400 patients. Mortality fell (HR 0.72, 95% CI 0.61-0.85)."),
    paper("902", "Jones", "2020", "In 1,200 patients, events were more common (HR 1.30; 95% CI 1.05 to 1.61)."),
    paper("903", "Lee", "2021", "A trial of 90 patients with no effect size reported."),
  ]);
}

test("meta-analysis builds itself from the reading list, with corrections", async ({ page }) => {
  await seedList(page);
  await page.goto("/");
  await openStats(page, "Meta-analysis");

  await expect(page.getByText(/Effect sizes were read from 2 of 3 abstracts/)).toBeVisible();
  await expect(page.getByLabel("Name of study 1")).toHaveValue(/Lee|Smith|Jones/);
  const ids: Record<string, string> = { Smith: "901", Jones: "902", Lee: "903" };
  const row = (name: string) => page.locator(`#panel-stats tr[data-key="${ids[name]}"]`);
  await expect(row("Smith").getByLabel(/Estimate of study/)).toHaveValue("0.72");
  await expect(row("Smith").getByLabel(/Lower limit/)).toHaveValue("0.61");
  await expect(row("Smith")).toContainText("Mortality fell");
  await expect(row("Jones").getByLabel(/Upper limit/)).toHaveValue("1.61");
  await expect(row("Lee")).toContainText("No effect size");

  // Pooled result appears without typing anything; the header names the measure found.
  const result = page.locator("section.card", { hasText: "Result" }).last();
  await expect(result.getByRole("columnheader", { name: "Hazard ratio" })).toBeVisible();
  await expect(result.locator("svg.forest rect.box")).toHaveCount(2);

  // Correct the third paper by hand, then reset it.
  await row("Lee").getByLabel(/Estimate of study/).fill("0.9");
  await row("Lee").getByLabel(/Lower limit/).fill("0.7");
  await row("Lee").getByLabel(/Upper limit/).fill("1.2");
  await expect(result.locator("svg.forest rect.box")).toHaveCount(3);

  // Leave one out.
  await page.getByLabel(/^Use study \d+ \(Jones/).uncheck();
  await expect(result.locator("svg.forest rect.box")).toHaveCount(2);

  // Corrections and the unticked row survive a reload.
  await page.reload();
  await openStats(page, "Meta-analysis");
  await expect(row("Lee").getByLabel(/Estimate of study/)).toHaveValue("0.9");
  await expect(page.getByLabel(/^Use study \d+ \(Jones/)).not.toBeChecked();
  await row("Lee").getByRole("button", { name: /Reset study/ }).click();
  await expect(row("Lee").getByLabel(/Estimate of study/)).toHaveValue("");

  // Turning it off leaves only hand-typed rows.
  await page.getByLabel("Take studies from my reading list automatically").uncheck();
  await expect(page.locator("#panel-stats tr[data-key=\"901\"]")).toHaveCount(0);

  // The overview tab reads the sample sizes from the same abstracts.
  await page.getByRole("button", { name: "My reading list", exact: true }).click();
  await expect(page.locator(".stat-tile", { hasText: "median sample size" })).toContainText("400");
});
