// Meta-analysis from study estimates and their 95% confidence intervals:
// fixed-effect (inverse variance) and DerSimonian–Laird random-effects.

import { chi2Sf, normP2, Z95 } from "./math";

export type Scale = "ratio" | "difference";

export interface StudyInput {
  label: string;
  est: number;
  lo: number;
  hi: number;
}

export interface StudyWeighted extends StudyInput {
  y: number; // estimate on the analysis scale (log for ratios)
  se: number;
  wFixed: number; // percent
  wRandom: number; // percent
}

export interface Pooled {
  est: number;
  lo: number;
  hi: number;
  p: number;
}

export interface MetaResult {
  studies: StudyWeighted[];
  fixed: Pooled;
  random: Pooled;
  q: number;
  df: number;
  qP: number;
  i2: number;
  tau2: number;
  skipped: string[];
}

export function parseEstimate(s: string): number {
  return Number(s.replace(",", ".").trim());
}

// Studies that can't be used (missing values, ratios ≤ 0, upper < lower) are listed in `skipped`.
export function metaAnalysis(input: StudyInput[], scale: Scale): MetaResult | null {
  const skipped: string[] = [];
  const rows: { s: StudyInput; y: number; se: number }[] = [];
  for (const s of input) {
    const name = s.label || "(unnamed)";
    const ok = [s.est, s.lo, s.hi].every(Number.isFinite) && s.lo <= s.est && s.est <= s.hi && s.hi > s.lo;
    const positive = scale === "difference" || (s.lo > 0 && s.est > 0 && s.hi > 0);
    if (!ok || !positive) {
      skipped.push(name);
      continue;
    }
    const f = scale === "ratio" ? Math.log : (v: number) => v;
    rows.push({ s, y: f(s.est), se: (f(s.hi) - f(s.lo)) / (2 * Z95) });
  }
  if (rows.length < 2) return null;

  const wF = rows.map((r) => 1 / r.se ** 2);
  const sumF = wF.reduce((a, b) => a + b, 0);
  const yF = rows.reduce((s, r, i) => s + wF[i] * r.y, 0) / sumF;
  const q = rows.reduce((s, r, i) => s + wF[i] * (r.y - yF) ** 2, 0);
  const df = rows.length - 1;
  const c = sumF - wF.reduce((s, w) => s + w * w, 0) / sumF;
  const tau2 = Math.max(0, (q - df) / c);
  const wR = rows.map((r) => 1 / (r.se ** 2 + tau2));
  const sumR = wR.reduce((a, b) => a + b, 0);
  const yR = rows.reduce((s, r, i) => s + wR[i] * r.y, 0) / sumR;

  const back = scale === "ratio" ? Math.exp : (v: number) => v;
  const pool = (y: number, se: number): Pooled => ({ est: back(y), lo: back(y - Z95 * se), hi: back(y + Z95 * se), p: normP2(y / se) });
  return {
    studies: rows.map((r, i) => ({ ...r.s, y: r.y, se: r.se, wFixed: (wF[i] / sumF) * 100, wRandom: (wR[i] / sumR) * 100 })),
    fixed: pool(yF, Math.sqrt(1 / sumF)),
    random: pool(yR, Math.sqrt(1 / sumR)),
    q,
    df,
    qP: chi2Sf(q, df),
    i2: q > 0 ? Math.max(0, ((q - df) / q) * 100) : 0,
    tau2,
    skipped,
  };
}
