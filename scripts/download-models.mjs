#!/usr/bin/env node
// Download OpenMed models into public/models/ so the app can run fully
// offline (Settings → "Where models load from" → Local folder).
//
//   npm run download-models                       # disease + drug detectors, fast size
//   npm run download-models -- --size accurate --detectors disease,drug,gene
//   npm run download-models -- --fp16             # also fetch fp16 graphs for WebGPU

import { mkdir, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

const FAMILIES = {
  disease: "DiseaseDetect",
  drug: "PharmaDetect",
  gene: "GenomeDetect",
  oncology: "OncologyDetect",
  anatomy: "AnatomyDetect",
  species: "SpeciesDetect",
};
const SIZES = { fast: "ElectraMed-33M-v1", accurate: "PubMed-v2-109M" };

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const size = opt("size", "fast");
const detectors = opt("detectors", "disease,drug").split(",").filter(Boolean);
const withFp16 = args.includes("--fp16");
const outDir = opt("out", "public/models");

if (!SIZES[size]) throw new Error(`--size must be one of ${Object.keys(SIZES).join(", ")}`);
for (const d of detectors) {
  if (!FAMILIES[d]) throw new Error(`Unknown detector "${d}". Options: ${Object.keys(FAMILIES).join(", ")}`);
}

const models = detectors.map((d) => `OpenMed/OpenMed-NER-${FAMILIES[d]}-${SIZES[size]}-onnx-android`);

const wanted = (file) =>
  (file.endsWith(".json") && !file.includes("/")) ||
  file === "model_int8.onnx" ||
  (withFp16 && file === "model_fp16.onnx");

const headers = process.env.HF_TOKEN ? { Authorization: `Bearer ${process.env.HF_TOKEN}` } : {};

for (const id of models) {
  const info = await fetch(`https://huggingface.co/api/models/${id}`, { headers });
  if (!info.ok) throw new Error(`${id}: ${info.status} ${info.statusText}`);
  const files = (await info.json()).siblings.map((s) => s.rfilename).filter(wanted);
  console.log(`\n${id}`);
  for (const file of files) {
    const dest = join(outDir, id, file);
    if (await stat(dest).catch(() => null)) {
      console.log(`  ✓ ${file} (already downloaded)`);
      continue;
    }
    const res = await fetch(`https://huggingface.co/${id}/resolve/main/${file}`, { headers });
    if (!res.ok) throw new Error(`${id}/${file}: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, buf);
    console.log(`  ↓ ${file} (${(buf.length / 1e6).toFixed(1)} MB)`);
  }
}
console.log(`\nDone. In the app, open Settings and choose "Local folder" (path /models/).`);
