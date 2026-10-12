// Clinical calculators on a 2x2 table: risk comparison (RR, OR, risk
// difference, NNT) and diagnostic accuracy (sensitivity, specificity,
// predictive and likelihood ratios), all with 95% confidence intervals.

import { chi2Sf, logChoose, normP2, wilson, Z95 } from "./math";

export type CI = { value: number; lo: number; hi: number };

export interface Table2x2 {
  a: number; // exposed / treated with the outcome
  b: number; // exposed / treated without the outcome
  c: number; // unexposed / control with the outcome
  d: number; // unexposed / control without the outcome
}

export interface RiskResult {
  riskExposed: CI;
  riskUnexposed: CI;
  rr: CI;
  or: CI;
  rd: CI;
  // Number needed to treat (benefit) or harm; null if the risk difference is zero.
  nnt: { value: number; kind: "benefit" | "harm"; lo: number | null; hi: number | null } | null;
  chi2: number;
  chi2P: number;
  fisherP: number;
  corrected: boolean; // 0.5 added to every cell for RR and OR
  smallExpected: boolean;
}

export function validTable(t: Table2x2): string | null {
  for (const v of [t.a, t.b, t.c, t.d]) {
    if (!Number.isFinite(v) || v < 0 || !Number.isInteger(v)) return "Counts must be whole numbers, zero or more.";
  }
  if (t.a + t.b === 0 || t.c + t.d === 0) return "Each group needs at least one person.";
  if (t.a + t.c === 0 && t.b + t.d === 0) return "Enter some counts.";
  return null;
}

const ci = (value: number, se: number, log = false): CI =>
  log
    ? { value, lo: Math.exp(Math.log(value) - Z95 * se), hi: Math.exp(Math.log(value) + Z95 * se) }
    : { value, lo: value - Z95 * se, hi: value + Z95 * se };

// Two-sided Fisher exact test: sums every table at most as likely as the observed one.
export function fisherExact(t: Table2x2): number {
  const r1 = t.a + t.b;
  const r2 = t.c + t.d;
  const c1 = t.a + t.c;
  const n = r1 + r2;
  const logP = (x: number) => logChoose(r1, x) + logChoose(r2, c1 - x) - logChoose(n, c1);
  const observed = logP(t.a);
  let p = 0;
  for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) {
    const lp = logP(x);
    if (lp <= observed + 1e-9) p += Math.exp(lp);
  }
  return Math.min(1, p);
}

export function chiSquare2x2(t: Table2x2): { chi2: number; p: number; minExpected: number } {
  const n = t.a + t.b + t.c + t.d;
  const rows = [t.a + t.b, t.c + t.d];
  const cols = [t.a + t.c, t.b + t.d];
  const obs = [t.a, t.b, t.c, t.d];
  let chi2 = 0;
  let minExpected = Infinity;
  obs.forEach((o, i) => {
    const e = (rows[i >> 1] * cols[i & 1]) / n;
    minExpected = Math.min(minExpected, e);
    if (e > 0) chi2 += (o - e) ** 2 / e;
  });
  return { chi2, p: chi2Sf(chi2, 1), minExpected };
}

export function riskAnalysis(t: Table2x2): RiskResult {
  const n1 = t.a + t.b;
  const n0 = t.c + t.d;
  const p1 = t.a / n1;
  const p0 = t.c / n0;
  const zero = [t.a, t.b, t.c, t.d].some((v) => v === 0);
  const k = zero ? 0.5 : 0;
  const [a, b, c, d] = [t.a + k, t.b + k, t.c + k, t.d + k];
  const rr = ci((a / (a + b)) / (c / (c + d)), Math.sqrt(1 / a - 1 / (a + b) + 1 / c - 1 / (c + d)), true);
  const or = ci((a * d) / (b * c), Math.sqrt(1 / a + 1 / b + 1 / c + 1 / d), true);
  const rdValue = p1 - p0;
  const rd = ci(rdValue, Math.sqrt((p1 * (1 - p1)) / n1 + (p0 * (1 - p0)) / n0));
  let nnt: RiskResult["nnt"] = null;
  if (rdValue !== 0) {
    // A reduced risk in the first group is a benefit; an increased risk is a harm.
    const kind = rdValue < 0 ? "benefit" : "harm";
    const crosses = rd.lo <= 0 && rd.hi >= 0;
    nnt = {
      value: 1 / Math.abs(rdValue),
      kind,
      lo: crosses ? null : 1 / Math.max(Math.abs(rd.lo), Math.abs(rd.hi)),
      hi: crosses ? null : 1 / Math.min(Math.abs(rd.lo), Math.abs(rd.hi)),
    };
  }
  const { chi2, p, minExpected } = chiSquare2x2(t);
  const w1 = wilson(t.a, n1);
  const w0 = wilson(t.c, n0);
  return {
    riskExposed: { value: p1, lo: w1[0], hi: w1[1] },
    riskUnexposed: { value: p0, lo: w0[0], hi: w0[1] },
    rr,
    or,
    rd,
    nnt,
    chi2,
    chi2P: p,
    fisherP: fisherExact(t),
    corrected: zero,
    smallExpected: minExpected < 5,
  };
}

export interface DiagnosticResult {
  sensitivity: CI;
  specificity: CI;
  ppv: CI;
  npv: CI;
  accuracy: CI;
  prevalence: CI;
  lrPositive: CI | null;
  lrNegative: CI | null;
  diagnosticOddsRatio: number | null;
}

// a = true positives, b = false positives, c = false negatives, d = true negatives.
export function diagnosticAnalysis(t: Table2x2): DiagnosticResult {
  const prop = (k: number, n: number): CI => {
    const [lo, hi] = wilson(k, n);
    return { value: n ? k / n : NaN, lo, hi };
  };
  const sensitivity = prop(t.a, t.a + t.c);
  const specificity = prop(t.d, t.b + t.d);
  const lrPositive =
    sensitivity.value > 0 && specificity.value < 1 && t.a > 0 && t.b > 0
      ? ci(sensitivity.value / (1 - specificity.value), Math.sqrt(1 / t.a - 1 / (t.a + t.c) + 1 / t.b - 1 / (t.b + t.d)), true)
      : null;
  const lrNegative =
    specificity.value > 0 && sensitivity.value < 1 && t.c > 0 && t.d > 0
      ? ci((1 - sensitivity.value) / specificity.value, Math.sqrt(1 / t.c - 1 / (t.a + t.c) + 1 / t.d - 1 / (t.b + t.d)), true)
      : null;
  const dor = t.b > 0 && t.c > 0 ? (t.a * t.d) / (t.b * t.c) : null;
  return {
    sensitivity,
    specificity,
    ppv: prop(t.a, t.a + t.b),
    npv: prop(t.d, t.c + t.d),
    accuracy: prop(t.a + t.d, t.a + t.b + t.c + t.d),
    prevalence: prop(t.a + t.c, t.a + t.b + t.c + t.d),
    lrPositive,
    lrNegative,
    diagnosticOddsRatio: dor,
  };
}

// Probability after a positive or negative test, from a pre-test probability and a likelihood ratio.
export function posttestProbability(pretest: number, lr: number): number {
  const odds = (pretest / (1 - pretest)) * lr;
  return odds / (1 + odds);
}

// Predictive values re-computed for a chosen prevalence.
export function predictiveValues(sens: number, spec: number, prevalence: number): { ppv: number; npv: number } {
  return {
    ppv: (sens * prevalence) / (sens * prevalence + (1 - spec) * (1 - prevalence)),
    npv: (spec * (1 - prevalence)) / (spec * (1 - prevalence) + (1 - sens) * prevalence),
  };
}

// Two-sided z test for two proportions is shown as chi-square; keep a helper for p from z.
export const pFromZ = normP2;
