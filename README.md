# OpenMed PubMed Explorer

A browser app that combines [OpenMed](https://github.com/maziyarpanahi/openmed) (on-device clinical NLP) with [PubMed](https://pubmed.ncbi.nlm.nih.gov/) (biomedical literature).

**Note → Evidence**: paste a clinical note. OpenMed removes identifiers and pulls out diseases, drugs and other terms. You pick the terms, check the generated PubMed query, and get matching papers.

**Literature miner**: search PubMed, download up to 200 abstracts, and run OpenMed over them to see which conditions, drugs and genes they mention most. Click a term to filter the papers, or export a CSV.

## Privacy model

- Notes are processed **only in your browser**, inside a Web Worker running OpenMed ONNX models through Transformers.js. There is no backend.
- The only data that leaves the browser:
  - **Model downloads** from Hugging Face (once, then cached). Use the offline mode below to avoid even this.
  - **The PubMed query**, and only when you click *Search PubMed*. It is shown to you and can be edited first. Terms that overlap a detected identifier are never offered, and the search is blocked if the query contains any text the PII model flagged.
- De-identification is done by a machine-learning model and **can miss identifiers**. Always read the query before you send it. This tool is for research and education. It is not a medical device.

## Run it

Requires Node 20+.

```bash
npm install
npm run dev          # http://localhost:5173
```

The first analysis downloads the models, about 35 MB each at the default "Fast" size.

### Fully offline (recommended for real patient notes)

```bash
npm run download-models                                   # PII + disease + drug, fast size
npm run download-models -- --size accurate --detectors disease,drug,gene
npm run dev
```

Then open **Settings → Where models load from → Local folder** (`/models/`). The ONNX runtime's WebAssembly files are bundled with the app, so after this no model or runtime files are fetched from the internet.

### Build static files

```bash
npm run build        # outputs dist/, which can be served from any static host or opened via `npm run preview`
```

## Settings

| Setting | Notes |
| --- | --- |
| Detectors | Diseases, drugs/chemicals, genes/proteins, oncology, anatomy, species. Each is a separate OpenMed model. |
| Model size | Fast (ElectraMed 33M) or Accurate (PubMed-v2 109M). |
| Confidence | Minimum score for clinical terms and for identifiers. Keep the identifier threshold low. |
| Compute | CPU (WebAssembly) or GPU (WebGPU, which uses the fp16 graphs). |
| NCBI API key | Optional. Raises the PubMed rate limit from 3 to 10 requests per second. |

## Models used

- Identifiers: `OpenMed/OpenMed-PII-ClinicalE5-Small-33M-v1-onnx-android`
- Clinical terms: `OpenMed/OpenMed-NER-<Family>-<Size>-onnx-android` (see `src/models.ts`)

Check each model's license on Hugging Face before you use it.

## Development

```bash
npm test             # unit tests (Vitest)
npm run typecheck
npm run test:e2e     # Playwright; set PW_CHROMIUM_PATH to reuse a system Chromium
```

The end-to-end tests stand in a fake model engine and mocked PubMed responses, so they run without network access.

| Path | Purpose |
| --- | --- |
| `src/worker.ts` | Loads OpenMed models and runs de-identification and NER off the main thread |
| `src/pubmed.ts` | NCBI E-utilities client (esearch/efetch, rate-limited, POST) |
| `src/query.ts` | PubMed query builder and the identifier guard |
| `src/entities.ts` | Chunking, span cleanup, dedup, and term tallies |
| `src/ui/` | The two screens and the settings dialog |
