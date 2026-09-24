# OpenMed PubMed Explorer

Search PubMed and see what the literature says. Each search downloads up to 200 abstracts from [PubMed](https://pubmed.ncbi.nlm.nih.gov/) and runs [OpenMed](https://github.com/maziyarpanahi/openmed) models over them **in your browser**, to show which conditions, signs and symptoms, drugs and genes the papers mention most. Click a term to filter the papers, refine the search with it, or export the counts as CSV.

**Live site:** https://darkmoor14.github.io/Medical/ (rebuilt on every push by `.github/workflows/pages.yml`).

## Features

**Searching**
- **Filters:** date range, article type, free full text, humans, language, age group and sex. Active filters show as removable chips.
- **Clinical question (PICO):** patient, intervention, comparison and outcome fields, plus PubMed Clinical Queries (therapy, diagnosis, etiology, prognosis, prediction).
- **Romanian search terms:** rewritten in English with a clinical glossary ("insuficiență cardiacă și diabet" → "heart failure AND diabetes").
- **Search aids:** MeSH heading suggestions while typing, "Did you mean…?" spelling corrections, and how PubMed read the search.
- **Shareable links:** the whole search lives in the URL.

**Results**
- **Papers first:** they appear as soon as PubMed answers, and the on-device analysis follows.
- **Strength of evidence:** a badge on each paper (meta-analysis → guideline → RCT → … → case report), with an evidence filter and a "strongest evidence first" order.
- **Warnings** for retracted papers, expressions of concern and preprints.
- **Citation counts** and Relative Citation Ratio from NIH iCite, with a "most cited" order.
- **Similar articles** and **Cited by** open inside the app.

**Analysis**
- **Terms chart** (conditions, signs and symptoms, drugs, genes…). Synonyms are merged, so "CKD" and "chronic kidney disease" count as one. Click a term to filter the papers and see what it's mentioned with.
- **Trends:** papers per year, or PubMed counts per year for all results, plus the top journals.
- **Up to 1,000 papers** per search.
- **Highlight legend** to switch categories on and off in abstracts.

**Saving** (in this browser only)
- **Reading list:** ☆ papers and add your own notes.
- **Export** selected or shown papers as RIS (Zotero/EndNote/Mendeley), BibTeX or CSV, or copy Vancouver/APA references.
- **Recent searches**, with papers that are new since the last run marked "New".

## How it works

- **PubMed** is queried through the NCBI E-utilities (`esearch`, then `efetch` for abstracts). Only your search text, paging options and an optional API key are sent.
- **OpenMed** token-classification models (ONNX, via Transformers.js) run in a Web Worker to tag terms in titles and abstracts. Models download once from Hugging Face and are then cached by the browser.
- **Signs & symptoms** are matched from a curated list of 400+ findings (`src/findings.ts`), because the OpenMed models tag named diseases and drugs, not findings.
- **Negation** is detected ("no significant bleeding"), and negated mentions are left out of the counts.

## Run it locally

Requires Node 20+.

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # static files in dist/
```

For fully offline model loading, run `npm run download-models` and choose **Settings → Where models load from → Local folder**.

## Settings

| Setting | Notes |
| --- | --- |
| Detectors | Diseases, drugs/chemicals, genes/proteins, oncology, anatomy, species (each a separate OpenMed model), plus the rule-based signs & symptoms list. |
| Model size | Fast (ElectraMed 33M) or Accurate (PubMed-v2 109M). |
| Confidence | Minimum score for detected terms. |
| Compute | CPU (WebAssembly) or GPU (WebGPU). |
| NCBI API key | Optional. Raises the PubMed rate limit from 3 to 10 requests per second. |

## Development

```bash
npm test             # unit tests (Vitest)
npm run typecheck
npm run test:e2e     # Playwright; set PW_CHROMIUM_PATH to reuse a system Chromium
```

End-to-end tests use a fake model engine and mocked PubMed responses, so they run without network access.

For research and education. Not a medical device.
