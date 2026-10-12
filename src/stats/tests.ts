// Descriptive statistics and common tests on columns of data.

import { chi2Sf, fSf, normCdf, normP2, normQuantile, tP2, tQuantile, Z95 } from "./math";
import { fisherExact } from "./clinical";

export const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
export const variance = (x: number[]) => {
  const m = mean(x);
  return x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1);
};

// Quantile with linear interpolation (the default in R and Excel's QUARTILE.INC).
export function quantile(sorted: number[], p: number): number {
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface Describe {
  n: number;
  mean: number;
  sd: number;
  se: number;
  median: number;
  q1: number;
  q3: number;
  min: number;
  max: number;
  ci: [number, number];
}

export function describe(values: number[]): Describe | null {
  const x = values.filter(Number.isFinite);
  if (!x.length) return null;
  const sorted = [...x].sort((a, b) => a - b);
  const m = mean(x);
  const sd = x.length > 1 ? Math.sqrt(variance(x)) : NaN;
  const se = sd / Math.sqrt(x.length);
  const t = x.length > 1 ? tQuantile(0.975, x.length - 1) : NaN;
  return {
    n: x.length,
    mean: m,
    sd,
    se,
    median: quantile(sorted, 0.5),
    q1: quantile(sorted, 0.25),
    q3: quantile(sorted, 0.75),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    ci: [m - t * se, m + t * se],
  };
}

export interface TTest {
  t: number;
  df: number;
  p: number;
  diff: number;
  ci: [number, number];
}

// Welch's t-test (unequal variances).
export function welchT(x: number[], y: number[]): TTest | null {
  if (x.length < 2 || y.length < 2) return null;
  const [vx, vy] = [variance(x) / x.length, variance(y) / y.length];
  const se = Math.sqrt(vx + vy);
  if (se === 0) return null;
  const diff = mean(x) - mean(y);
  const df = (vx + vy) ** 2 / (vx ** 2 / (x.length - 1) + vy ** 2 / (y.length - 1));
  const t = diff / se;
  const crit = tQuantile(0.975, df);
  return { t, df, p: tP2(t, df), diff, ci: [diff - crit * se, diff + crit * se] };
}

// Average ranks (ties share the mean rank).
export function ranks(x: number[]): number[] {
  const order = x.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(x.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k][1]] = r;
    i = j + 1;
  }
  return out;
}

// Mann–Whitney U with a normal approximation (tie and continuity corrected).
export function mannWhitney(x: number[], y: number[]): { u: number; z: number; p: number } | null {
  const n1 = x.length;
  const n2 = y.length;
  if (!n1 || !n2) return null;
  const all = [...x, ...y];
  const r = ranks(all);
  const r1 = r.slice(0, n1).reduce((s, v) => s + v, 0);
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const u = Math.min(u1, n1 * n2 - u1);
  const n = n1 + n2;
  const counts = new Map<number, number>();
  for (const v of all) counts.set(v, (counts.get(v) ?? 0) + 1);
  const tieTerm = [...counts.values()].reduce((s, t) => s + (t ** 3 - t), 0);
  const sd = Math.sqrt(((n1 * n2) / 12) * (n + 1 - tieTerm / (n * (n - 1))));
  if (sd === 0) return null;
  const z = (Math.abs(u1 - (n1 * n2) / 2) - 0.5) / sd;
  return { u, z, p: Math.min(1, normP2(Math.max(0, z))) };
}

export interface Anova {
  f: number;
  df1: number;
  df2: number;
  p: number;
}

export function oneWayAnova(groups: number[][]): Anova | null {
  const g = groups.filter((x) => x.length);
  const k = g.length;
  const n = g.reduce((s, x) => s + x.length, 0);
  if (k < 2 || n - k < 1) return null;
  const grand = mean(g.flat());
  const ssb = g.reduce((s, x) => s + x.length * (mean(x) - grand) ** 2, 0);
  const ssw = g.reduce((s, x) => s + x.reduce((q, v) => q + (v - mean(x)) ** 2, 0), 0);
  if (ssw === 0) return null;
  const f = ssb / (k - 1) / (ssw / (n - k));
  return { f, df1: k - 1, df2: n - k, p: fSf(f, k - 1, n - k) };
}

export function kruskalWallis(groups: number[][]): { h: number; df: number; p: number } | null {
  const g = groups.filter((x) => x.length);
  const n = g.reduce((s, x) => s + x.length, 0);
  if (g.length < 2 || n < 3) return null;
  const all = g.flat();
  const r = ranks(all);
  let pos = 0;
  let sum = 0;
  for (const x of g) {
    const rs = r.slice(pos, pos + x.length).reduce((s, v) => s + v, 0);
    sum += rs ** 2 / x.length;
    pos += x.length;
  }
  const counts = new Map<number, number>();
  for (const v of all) counts.set(v, (counts.get(v) ?? 0) + 1);
  const tie = 1 - [...counts.values()].reduce((s, t) => s + (t ** 3 - t), 0) / (n ** 3 - n);
  if (tie === 0) return null;
  const hStat = ((12 / (n * (n + 1))) * sum - 3 * (n + 1)) / tie;
  return { h: hStat, df: g.length - 1, p: chi2Sf(hStat, g.length - 1) };
}

export interface Correlation {
  r: number;
  n: number;
  p: number;
  ci: [number, number] | null;
}

export function pearson(x: number[], y: number[]): Correlation | null {
  const n = x.length;
  if (n < 3 || n !== y.length) return null;
  const [mx, my] = [mean(x), mean(y)];
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  const r = Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
  const p = Math.abs(r) === 1 ? 0 : tP2((r * Math.sqrt(n - 2)) / Math.sqrt(1 - r * r), n - 2);
  let ci: [number, number] | null = null;
  if (n > 3 && Math.abs(r) < 1) {
    const z = Math.atanh(r);
    const se = 1 / Math.sqrt(n - 3);
    ci = [Math.tanh(z - Z95 * se), Math.tanh(z + Z95 * se)];
  }
  return { r, n, p, ci };
}

export const spearman = (x: number[], y: number[]) => pearson(ranks(x), ranks(y));

// Simple least-squares line.
export function regression(x: number[], y: number[]): { slope: number; intercept: number } | null {
  if (x.length < 2) return null;
  const [mx, my] = [mean(x), mean(y)];
  const sxx = x.reduce((s, v) => s + (v - mx) ** 2, 0);
  if (sxx === 0) return null;
  const slope = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0) / sxx;
  return { slope, intercept: my - slope * mx };
}

export interface ChiSquareResult {
  chi2: number;
  df: number;
  p: number;
  cramersV: number;
  minExpected: number;
  fisherP: number | null; // only for 2x2 tables
}

export function chiSquareTable(counts: number[][]): ChiSquareResult | null {
  const R = counts.length;
  const C = counts[0]?.length ?? 0;
  if (R < 2 || C < 2) return null;
  const rows = counts.map((r) => r.reduce((s, v) => s + v, 0));
  const cols = counts[0].map((_, j) => counts.reduce((s, r) => s + r[j], 0));
  const n = rows.reduce((s, v) => s + v, 0);
  if (!n || rows.some((v) => !v) || cols.some((v) => !v)) return null;
  let chi2 = 0;
  let minExpected = Infinity;
  for (let i = 0; i < R; i++) {
    for (let j = 0; j < C; j++) {
      const e = (rows[i] * cols[j]) / n;
      minExpected = Math.min(minExpected, e);
      chi2 += (counts[i][j] - e) ** 2 / e;
    }
  }
  const df = (R - 1) * (C - 1);
  const fisherP = R === 2 && C === 2 ? fisherExact({ a: counts[0][0], b: counts[0][1], c: counts[1][0], d: counts[1][1] }) : null;
  return { chi2, df, p: chi2Sf(chi2, df), cramersV: Math.sqrt(chi2 / (n * (Math.min(R, C) - 1))), minExpected, fisherP };
}

export { normCdf, normQuantile };
