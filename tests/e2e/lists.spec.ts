import { expect, test, type Page } from "@playwright/test";
import { installFakeEngine, mockPubMed, mockSources } from "./helpers";

test.beforeEach(async ({ page }) => {
  await installFakeEngine(page);
  await mockSources(page);
  await mockPubMed(page);
});

const picker = (page: Page) => page.getByLabel("Active reading list");

async function newList(page: Page, name: string) {
  page.once("dialog", (d) => void d.accept(name));
  await picker(page).selectOption("__new");
}

test("several reading lists: separate papers, matrix and stats; copy, rename, delete", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("PubMed query").fill("ckd");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".paper")).toHaveCount(2);

  // First paper goes to the default list.
  await page.getByRole("button", { name: "Add to reading list" }).first().click();
  await expect(picker(page).locator("option:checked")).toHaveText("My reading list (1)");
  await expect(page.locator("#reading-btn")).toHaveText("★ Reading list (1)");

  // A second list starts empty; the star on the same paper is off again.
  await newList(page, "Heart failure");
  await expect(picker(page).locator("option:checked")).toHaveText("Heart failure (0)");
  await expect(page.locator("#reading-btn")).toHaveText("☆ Reading list");
  await expect(page.getByRole("button", { name: "Remove from reading list" })).toHaveCount(0);
  await page.getByRole("button", { name: "Add to reading list" }).nth(1).click();
  await expect(picker(page).locator("option:checked")).toHaveText("Heart failure (1)");

  // The matrix and the stats follow the active list.
  await page.getByRole("tab", { name: "Matrix" }).click();
  await expect(page.getByRole("heading", { name: "Literature matrix: Heart failure" })).toBeVisible();
  await expect(page.locator("#panel-matrix tbody tr")).toHaveCount(1);
  await page.getByLabel(/^Decision for/).selectOption("include");
  await page.getByRole("tab", { name: "Stats" }).click();
  await page.getByRole("button", { name: "My reading list", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Heart failure: at a glance" })).toBeVisible();
  await expect(page.getByText("Screening decisions")).toBeVisible();

  // Switching back: the other list has its own paper and no decision.
  await picker(page).selectOption({ label: "My reading list (1)" });
  await expect(page.getByRole("heading", { name: "My reading list: at a glance" })).toBeVisible();
  await expect(page.locator("#panel-stats .bar-label", { hasText: "Include" })).toHaveCount(0);
  await page.getByRole("tab", { name: "Matrix" }).click();
  await expect(page.getByLabel(/^Decision for/)).toHaveValue("");

  // Dialog: copy to another list, then rename and delete.
  await page.locator("#reading-btn").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "My reading list (1)" })).toBeVisible();
  await dialog.getByLabel(/^Copy to…/).selectOption({ label: "Heart failure" });
  await dialog.getByRole("button", { name: "Rename list" }).click({ trial: true });
  page.once("dialog", (d) => void d.accept("Chronic disease"));
  await dialog.getByRole("button", { name: "Rename list" }).click();
  await expect(dialog.getByRole("heading", { name: "Chronic disease (1)" })).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(picker(page).locator("option")).toHaveText(["Chronic disease (1)", "Heart failure (2)", "＋ New list…"]);

  await picker(page).selectOption({ label: "Heart failure (2)" });
  await page.locator("#reading-btn").click();
  page.once("dialog", (d) => void d.accept());
  await dialog.getByRole("button", { name: "Delete list" }).click();
  await expect(picker(page).locator("option")).toHaveText(["Chronic disease (1)", "＋ New list…"]);
  await expect(picker(page).locator("option:checked")).toHaveText("Chronic disease (1)");
  await page.screenshot({ path: "test-results/lists.png" });
});

test("the active list and its contents survive a reload; the old single list is migrated", async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("seeded")) return;
    localStorage.setItem("seeded", "1");
    localStorage.setItem(
      "opm-reading-list-v1",
      JSON.stringify([{ article: { pmid: "5", title: "Old paper", abstract: "", authors: [], journal: "J", year: "2020", pubTypes: [], doi: null, pmcid: null, journalTitle: "J", volume: "", issue: "", pages: "", month: "", authorsFull: [], meshTerms: [], retracted: false, concern: false }, note: "kept", addedAt: "2025-01-01T00:00:00Z" }]),
    );
  });
  await page.goto("/");
  await expect(picker(page).locator("option:checked")).toHaveText("My reading list (1)");
  await newList(page, "Second");
  await page.reload();
  await expect(picker(page).locator("option:checked")).toHaveText("Second (0)");
  await picker(page).selectOption({ label: "My reading list (1)" });
  await page.locator("#reading-btn").click();
  await expect(page.getByRole("dialog").getByLabel(/Your note/)).toHaveValue("kept");
});
