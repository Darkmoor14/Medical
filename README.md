# OpenMed PubMed Explorer

Search PubMed and see what the literature says. Each search downloads up to 200 abstracts from [PubMed](https://pubmed.ncbi.nlm.nih.gov/) and runs [OpenMed](https://github.com/maziyarpanahi/openmed) models over them **in your browser**, to show which conditions, signs and symptoms, drugs and genes the papers mention most. Click a term to filter the papers, refine the search with it, or export the counts as CSV.

**Live site:** https://darkmoor14.github.io/Medical/ (rebuilt on every push by `.github/workflows/pages.yml`).

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
