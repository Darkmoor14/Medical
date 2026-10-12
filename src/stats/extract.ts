// Finds effect estimates reported in abstracts, such as "HR 0.72 (95% CI
// 0.61–0.85)" or "mean difference −2.3 (95% CI −4.1 to −0.5)", so a
// meta-analysis can start from the reading list. These are matches in free
// text: always show the source sentence so they can be checked.

import type { Article } from "../pubmed";
import type { Scale } from "./meta";

export type EffectKind = "OR" | "RR" | "HR" | "MD" | "SMD" | "RD";

export interface Effect {
  kind: EffectKind;
  scale: Scale;
  est: number;
  lo: number;
  hi: number;
  sentence: string;
}

export const KIND_LABEL: Record<EffectKind, string> = {
  OR: "Odds ratio",
  RR: "Risk ratio",
  HR: "Hazard ratio",
  MD: "Mean difference",
  SMD: "Standardised mean difference",
  RD: "Risk difference",
};

// Names are matched case-insensitively; short forms only in capitals ("or" is a word).
const NAMES: { kind: EffectKind; long: string; short: string }[] = [
  { kind: "OR", long: "odds ratio", short: "OR|aOR" },
  { kind: "HR", long: "hazard ratio", short: "HR|aHR" },
  { kind: "RR", long: "risk ratio|relative risk|rate ratio|incidence rate ratio", short: "RR|aRR|IRR" },
  { kind: "SMD", long: "standardi[sz]ed mean difference", short: "SMD" },
  { kind: "MD", long: "mean difference|weighted mean difference", short: "MD|WMD" },
  { kind: "RD", long: "risk difference", short: "RD|ARR" },
];

const POS = String.raw`(\d+(?:\.\d+)?)`;
const SIGNED = String.raw`([-−–]?\d+(?:\.\d+)?)`;
const CI_LABEL = String.raw`(?:95\s*%?\s*(?:CI|confidence interval|confidence limits)|CI)`;

// After the estimate: "(95% CI a-b)", "(a-b)", "; 95% CI, a to b" …
const opener = String.raw`\s*(?:[(\[]\s*(?:${CI_LABEL}\s*[:=,]?\s*)?|[,;]\s*${CI_LABEL}\s*[:=,]?\s*)`;

const num = (s: string) => Number(s.replace(/[−–]/, "-"));

function pattern(scale: Scale, alt: string, flags: string): RegExp {
  const n = scale === "ratio" ? POS : SIGNED;
  const sep = scale === "ratio" ? String.raw`\s*(?:-|–|—|to|,|;)\s*` : String.raw`\s*(?:to|,|;)\s*`;
  return new RegExp(String.raw`(?:^|[^A-Za-z])(?:${alt})\b[^.\d−–-]{0,35}?(?:[=:]\s*)?${n}${opener}${n}${sep}${n}`, flags + "g");
}

function sentenceAround(text: string, index: number, length: number): string {
  const before = text.lastIndexOf(". ", index);
  const after = text.indexOf(". ", index + length);
  const s = text.slice(before < 0 ? 0 : before + 2, after < 0 ? text.length : after + 1).replace(/\s+/g, " ").trim();
  return s.length > 240 ? `${s.slice(0, 237)}…` : s;
}

export function extractEffects(a: Pick<Article, "title" | "abstract">): Effect[] {
  const text = `${a.title}. ${a.abstract}`.replace(/\s+/g, " ");
  const found: (Effect & { at: number })[] = [];
  for (const { kind, long, short } of NAMES) {
    const scale: Scale = kind === "OR" || kind === "HR" || kind === "RR" ? "ratio" : "difference";
    for (const [alt, flags] of [[long, "i"], [short, ""]] as const) {
      for (const m of text.matchAll(pattern(scale, alt, flags))) {
        const [est, lo, hi] = [num(m[1]), num(m[2]), num(m[3])];
        const ok = lo <= est && est <= hi && (scale === "difference" || (lo > 0 && hi / lo < 1000));
        if (!ok) continue;
        found.push({ kind, scale, est, lo, hi, sentence: sentenceAround(text, m.index!, m[0].length), at: m.index! });
      }
    }
  }
  found.sort((x, y) => x.at - y.at);
  const seen = new Set<string>();
  return found
    .filter((e) => {
      const k = `${e.est}|${e.lo}|${e.hi}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map(({ at: _at, ...e }) => e);
}

// The first estimate on the requested scale. Abstracts usually give the main result first.
export function primaryEffect(a: Pick<Article, "title" | "abstract">, scale: Scale): Effect | null {
  return extractEffects(a).find((e) => e.scale === scale) ?? null;
}
