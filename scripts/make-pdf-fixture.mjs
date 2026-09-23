// Regenerates tests/fixtures/docs/scrisoare.pdf with Chromium (keeps Romanian diacritics).
import { chromium } from "@playwright/test";
const lines = [
  "SCRISOARE MEDICALĂ (exemplu sintetic)",
  "Pacient: Popescu Ion, CNP 1610412400010",
  "Diagnostic: Diabet zaharat tip 2. Fibrilație atrială.",
  "Recomandări: continuă apixaban 5 mg de două ori pe zi.",
];
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const page = await browser.newPage();
await page.setContent(`<meta charset="utf-8">${lines.map((l) => `<p>${l}</p>`).join("")}`);
await page.pdf({ path: "tests/fixtures/docs/scrisoare.pdf" });
await browser.close();
