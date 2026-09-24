// Merge different spellings of the same term before counting: abbreviations
// defined in the abstracts ("chronic kidney disease (CKD)"), plurals
// ("SGLT2 inhibitors" / "SGLT2 inhibitor") and case.

import { normalizeTerm } from "../entities";

// Schwartz & Hearst (2003) long-form matching: walk the short form backwards,
// matching each character inside the preceding words; the first character
// must start a word.
function findLongForm(shortForm: string, candidate: string): string | null {
  let s = shortForm.length - 1;
  let l = candidate.length - 1;
  const sf = shortForm.toLowerCase();
  const lf = candidate.toLowerCase();
  for (; s >= 0; s--) {
    const c = sf[s];
    if (!/[a-z0-9]/.test(c)) continue;
    while (l >= 0 && (lf[l] !== c || (s === 0 && l > 0 && /[a-z0-9]/.test(lf[l - 1])))) l--;
    if (l < 0) return null;
    l--;
  }
  const start = lf.lastIndexOf(" ", l) + 1;
  return candidate.slice(start).trim();
}

// Abbreviation → long form pairs defined in a text.
export function findAbbreviations(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of text.matchAll(/\(([^()\s,;]{2,10})\)/g)) {
    const sf = m[1];
    if (!/[A-Za-z]/.test(sf) || !/^[A-Za-z0-9-]+$/.test(sf) || !/[A-Z]/.test(sf)) continue;
    const before = text.slice(0, m.index).trimEnd();
    const words = before.split(/\s+/);
    const maxWords = Math.min(sf.length + 5, sf.length * 2);
    const candidate = words.slice(-maxWords).join(" ").replace(/^.*[.;:!?]\s+/, "");
    const lf = findLongForm(sf, candidate);
    if (!lf || lf.length <= sf.length || lf.split(/\s+/).length > maxWords) continue;
    out.set(sf.toLowerCase(), normalizeTerm(lf));
  }
  return out;
}

// Common clinical abbreviations, used when a paper does not define them.
// Definitions found in the abstracts take priority.
const COMMON: Record<string, string> = {
  ckd: "chronic kidney disease", aki: "acute kidney injury", esrd: "end-stage renal disease", eskd: "end-stage kidney disease",
  t2d: "type 2 diabetes", t2dm: "type 2 diabetes mellitus", t1d: "type 1 diabetes", t1dm: "type 1 diabetes mellitus",
  dm: "diabetes mellitus", hf: "heart failure", chf: "congestive heart failure", hfref: "heart failure with reduced ejection fraction",
  hfpef: "heart failure with preserved ejection fraction", af: "atrial fibrillation", afib: "atrial fibrillation",
  mi: "myocardial infarction", ami: "acute myocardial infarction", cad: "coronary artery disease", chd: "coronary heart disease",
  acs: "acute coronary syndrome", htn: "hypertension", copd: "chronic obstructive pulmonary disease", dvt: "deep vein thrombosis",
  vte: "venous thromboembolism", pe: "pulmonary embolism", uti: "urinary tract infection", cap: "community-acquired pneumonia",
  ibd: "inflammatory bowel disease", ibs: "irritable bowel syndrome", gerd: "gastroesophageal reflux disease",
  nafld: "non-alcoholic fatty liver disease", nash: "non-alcoholic steatohepatitis", masld: "metabolic dysfunction-associated steatotic liver disease",
  hcc: "hepatocellular carcinoma", nsclc: "non-small cell lung cancer", sclc: "small cell lung cancer", crc: "colorectal cancer",
  aml: "acute myeloid leukemia", all: "acute lymphoblastic leukemia", cll: "chronic lymphocytic leukemia", cml: "chronic myeloid leukemia",
  ra: "rheumatoid arthritis", sle: "systemic lupus erythematosus", ms: "multiple sclerosis", ad: "alzheimer disease",
  pd: "parkinson disease", tbi: "traumatic brain injury", ards: "acute respiratory distress syndrome", osa: "obstructive sleep apnea",
  pcos: "polycystic ovary syndrome", hiv: "human immunodeficiency virus", tb: "tuberculosis", ptsd: "post-traumatic stress disorder",
  adhd: "attention deficit hyperactivity disorder", mdd: "major depressive disorder", ocd: "obsessive-compulsive disorder",
  sglt2i: "sglt2 inhibitor", "sglt2 inhibitor": "sglt2 inhibitor", "glp-1 ra": "glp-1 receptor agonist", glp1ra: "glp-1 receptor agonist",
  "ace inhibitor": "angiotensin-converting enzyme inhibitor", acei: "angiotensin-converting enzyme inhibitor", arb: "angiotensin receptor blocker",
  ppi: "proton pump inhibitor", nsaid: "non-steroidal anti-inflammatory drug", nsaids: "non-steroidal anti-inflammatory drug",
  doac: "direct oral anticoagulant", noac: "non-vitamin k antagonist oral anticoagulant", ici: "immune checkpoint inhibitor",
};

// Most frequently used definition of each abbreviation across the papers,
// on top of the built-in list of common abbreviations.
export function abbreviationMap(texts: string[]): Map<string, string> {
  const votes = new Map<string, Map<string, number>>();
  for (const t of texts) {
    for (const [sf, lf] of findAbbreviations(t)) {
      const v = votes.get(sf) ?? new Map<string, number>();
      v.set(lf, (v.get(lf) ?? 0) + 1);
      votes.set(sf, v);
    }
  }
  const out = new Map<string, string>(Object.entries(COMMON));
  for (const [sf, v] of votes) out.set(sf, [...v.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  return out;
}

// Singular form of the last word, conservatively: "inhibitors" → "inhibitor",
// "therapies" → "therapy", but "diabetes", "sepsis", "virus" stay.
export function singularize(term: string): string {
  return term.replace(/([\p{L}]+)$/u, (w) => {
    if (w.length <= 4 || /(ss|us|is|as|os|ys|es)$/i.test(w)) {
      if (/ies$/i.test(w) && w.length > 5) return w.slice(0, -3) + "y";
      if (/(ches|shes|xes)$/i.test(w)) return w.slice(0, -2);
      return w;
    }
    return /s$/i.test(w) ? w.slice(0, -1) : w;
  });
}

export function canonicalizer(abbreviations: Map<string, string>): (term: string) => string {
  return (term) => {
    const norm = normalizeTerm(term);
    return singularize(abbreviations.get(norm) ?? norm);
  };
}
