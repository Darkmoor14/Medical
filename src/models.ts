// OpenMed ONNX model catalog used by the app. All of these are published on
// Hugging Face under the OpenMed org with `model_int8.onnx` / `model_fp16.onnx`
// graphs at the repo root (the "onnx-android" layout that openmed's
// `loadOnnxModel` understands).

export const PII_MODEL = "OpenMed/OpenMed-PII-ClinicalE5-Small-33M-v1-onnx-android";

export type ModelSize = "fast" | "accurate";

export interface Detector {
  key: string;
  label: string;
  family: string;
  defaultOn: boolean;
}

export const DETECTORS: Detector[] = [
  { key: "disease", label: "Diseases & conditions", family: "DiseaseDetect", defaultOn: true },
  { key: "drug", label: "Drugs & chemicals", family: "PharmaDetect", defaultOn: true },
  { key: "gene", label: "Genes & proteins", family: "GenomeDetect", defaultOn: false },
  { key: "oncology", label: "Oncology (cancers, cells)", family: "OncologyDetect", defaultOn: false },
  { key: "anatomy", label: "Anatomy", family: "AnatomyDetect", defaultOn: false },
  { key: "species", label: "Organisms & species", family: "SpeciesDetect", defaultOn: false },
];

const SIZE_SUFFIX: Record<ModelSize, string> = {
  fast: "ElectraMed-33M-v1",
  accurate: "PubMed-v2-109M",
};

export function detectorModelId(detector: Detector, size: ModelSize): string {
  return `OpenMed/OpenMed-NER-${detector.family}-${SIZE_SUFFIX[size]}-onnx-android`;
}

export type Category = "condition" | "drug" | "gene" | "anatomy" | "organism" | "cell" | "other";

export const CATEGORY_LABEL: Record<Category, string> = {
  condition: "Condition",
  drug: "Drug / chemical",
  gene: "Gene / protein",
  anatomy: "Anatomy",
  organism: "Organism",
  cell: "Cell",
  other: "Other",
};

// Order categories are combined in when building PubMed queries.
export const CATEGORY_ORDER: Category[] = [
  "condition",
  "drug",
  "gene",
  "anatomy",
  "cell",
  "organism",
  "other",
];

export function categoryFor(label: string): Category {
  const l = label.toUpperCase();
  if (/DISEASE|CONDITION|PATHOLOGY|CANCER/.test(l)) return "condition";
  if (/CHEM|DRUG/.test(l)) return "drug";
  if (/GENE|PROTEIN|DNA|RNA/.test(l)) return "gene";
  if (/ORGAN(?!ISM)|TISSUE|ANATOMY/.test(l)) return "anatomy";
  if (/ORGANISM|SPECIES/.test(l)) return "organism";
  if (/CELL/.test(l)) return "cell";
  return "other";
}
