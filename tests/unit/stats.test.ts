import { describe, expect, it } from "vitest";
import { chi2Sf, fSf, normCdf, normQuantile, tP2, tQuantile, wilson } from "../../src/stats/math";
import { diagnosticAnalysis, fisherExact, posttestProbability, predictiveValues, riskAnalysis, validTable } from "../../src/stats/clinical";
import { chiSquareTable, describe as describeValues, kruskalWallis, mannWhitney, oneWayAnova, pearson, ranks, spearman, welchT } from "../../src/stats/tests";
import { metaAnalysis } from "../../src/stats/meta";
import { crossTab, groupBy, parseDataset, parseNumber } from "../../src/stats/dataset";
import { overview } from "../../src/stats/overview";
import { emptyMatrix } from "../../src/write/matrix";
import type { Article } from "../../src/pubmed";

const near = (a: number, b: number, tol = 1e-4) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe("distributions", () => {
  it("matches standard normal values", () => {
    near(normCdf(1.96), 0.9750021, 1e-6);
    near(normCdf(0), 0.5, 1e-12);
    near(normCdf(-1), 0.1586553, 1e-6);
    near(normQuantile(0.975), 1.959964, 1e-5);
    near(normQuantile(0.5), 0, 1e-9);
  });
  it("matches t, chi-square and F tails", () => {
    near(tQuantile(0.975, 10), 2.228139, 1e-4);
    near(tP2(2.228139, 10), 0.05, 1e-5);
    near(tP2(2.0, 5), 0.1019395, 1e-5);
    near(chi2Sf(3.841459, 1), 0.05, 1e-5);
    near(chi2Sf(5.991465, 2), 0.05, 1e-5);
    near(fSf(4.964603, 1, 10), 0.05, 1e-5);
  });
  it("gives Wilson intervals", () => {
    const [lo, hi] = wilson(8, 10);
    near(lo, 0.4902, 1e-3);
    near(hi, 0.9433, 1e-3);
  });
});

describe("2x2 risk analysis", () => {
  const r = riskAnalysis({ a: 20, b: 80, c: 10, d: 90 });
  it("computes ratios and differences", () => {
    near(r.rr.value, 2);
    near(r.or.value, 2.25);
    near(r.rd.value, 0.1);
    near(r.or.lo, 0.9937, 1e-3);
    near(r.or.hi, 5.094, 1e-2);
    expect(r.nnt?.kind).toBe("harm");
    near(r.nnt!.value, 10);
    near(r.nnt!.lo!, 5.05, 1e-2); // 1 / upper limit of the risk difference
    expect(r.corrected).toBe(false);
  });
  it("gives no NNT interval when the risk difference interval crosses zero", () => {
    expect(riskAnalysis({ a: 6, b: 94, c: 4, d: 96 }).nnt!.lo).toBeNull();
  });
  it("reports a benefit when risk falls and gives the NNT interval", () => {
    const t = riskAnalysis({ a: 10, b: 190, c: 40, d: 160 });
    expect(t.nnt?.kind).toBe("benefit");
    near(t.nnt!.value, 6.667, 1e-2);
    expect(t.nnt!.lo).not.toBeNull();
    expect(t.nnt!.lo!).toBeLessThan(t.nnt!.value);
    expect(t.nnt!.hi!).toBeGreaterThan(t.nnt!.value);
  });
  it("corrects zero cells and flags small expected counts", () => {
    const z = riskAnalysis({ a: 0, b: 10, c: 5, d: 5 });
    expect(z.corrected).toBe(true);
    expect(Number.isFinite(z.or.value)).toBe(true);
    expect(z.smallExpected).toBe(true);
  });
  it("matches the Fisher tea-tasting example and chi-square", () => {
    near(fisherExact({ a: 3, b: 1, c: 1, d: 3 }), 0.4857, 1e-3);
    near(riskAnalysis({ a: 20, b: 30, c: 10, d: 40 }).chi2, 4.7619, 1e-3);
  });
  it("validates input", () => {
    expect(validTable({ a: 1.5, b: 1, c: 1, d: 1 })).toMatch(/whole/);
    expect(validTable({ a: 1, b: 1, c: 0, d: 0 })).toMatch(/group/);
    expect(validTable({ a: 1, b: 2, c: 3, d: 4 })).toBeNull();
  });
});

describe("diagnostic accuracy", () => {
  const d = diagnosticAnalysis({ a: 90, b: 20, c: 10, d: 80 });
  it("computes accuracy measures", () => {
    near(d.sensitivity.value, 0.9);
    near(d.specificity.value, 0.8);
    near(d.ppv.value, 90 / 110);
    near(d.npv.value, 80 / 90);
    near(d.lrPositive!.value, 4.5);
    near(d.lrNegative!.value, 0.125);
    near(d.diagnosticOddsRatio!, 36);
    near(d.prevalence.value, 0.5);
  });
  it("recomputes predictive values for another prevalence", () => {
    const p = predictiveValues(0.9, 0.8, 0.05);
    near(p.ppv, 0.1915, 1e-3);
    near(p.npv, 0.9941, 1e-3);
    near(posttestProbability(0.5, 4.5), 0.818, 1e-3);
  });
});

describe("tests on columns", () => {
  it("describes", () => {
    const s = describeValues([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])!;
    near(s.mean, 5.5);
    near(s.sd, 3.02765, 1e-4);
    near(s.median, 5.5);
    near(s.q1, 3.25);
    near(s.q3, 7.75);
    expect(describeValues([])).toBeNull();
  });
  it("runs Welch's t-test", () => {
    const t = welchT([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])!;
    near(t.t, -1.8974, 1e-3);
    near(t.df, 5.882, 1e-2);
    near(t.p, 0.1076, 5e-3);
    near(t.diff, -3);
  });
  it("ranks with ties", () => {
    expect(ranks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
  });
  it("runs Mann–Whitney, ANOVA and Kruskal–Wallis", () => {
    const mw = mannWhitney([1, 2, 3, 4, 5], [6, 7, 8, 9, 10])!;
    near(mw.u, 0);
    expect(mw.p).toBeLessThan(0.02);
    const a = oneWayAnova([[1, 2, 3], [4, 5, 6], [7, 8, 9]])!;
    near(a.f, 27, 1e-6);
    near(a.p, 0.001, 1e-6);
    const k = kruskalWallis([[1, 2, 3], [4, 5, 6], [7, 8, 9]])!;
    near(k.h, 7.2, 1e-6);
    near(k.p, 0.0273, 1e-3);
  });
  it("correlates", () => {
    near(pearson([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])!.r, 1);
    const p = pearson([1, 2, 3, 4, 5, 6], [2, 1, 4, 3, 6, 5])!;
    near(p.r, 0.8286, 1e-3);
    near(p.p, 0.0415, 2e-3);
    expect(p.ci![0]).toBeLessThan(p.r);
    near(spearman([1, 2, 3, 4], [1, 4, 9, 16])!.r, 1);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
  });
  it("runs a chi-square test on a table", () => {
    const c = chiSquareTable([[20, 30], [10, 40]])!;
    near(c.chi2, 4.7619, 1e-3);
    near(c.cramersV, Math.sqrt(4.7619 / 100), 1e-4);
    expect(c.fisherP).not.toBeNull();
    expect(chiSquareTable([[1, 2]])).toBeNull();
  });
});

describe("meta-analysis", () => {
  it("returns the common estimate when studies agree", () => {
    const m = metaAnalysis(
      [
        { label: "A", est: 0.8, lo: 0.6, hi: 1.067 },
        { label: "B", est: 0.8, lo: 0.6, hi: 1.067 },
      ],
      "ratio",
    )!;
    near(m.fixed.est, 0.8, 1e-3);
    near(m.random.est, 0.8, 1e-3);
    near(m.i2, 0);
    near(m.studies[0].wFixed, 50, 1e-6);
    expect(m.fixed.hi - m.fixed.lo).toBeLessThan(1.067 - 0.6); // pooling narrows the interval
  });
  it("detects heterogeneity and widens the random-effects interval", () => {
    const m = metaAnalysis(
      [
        { label: "A", est: 0.5, lo: 0.4, hi: 0.625 },
        { label: "B", est: 1.5, lo: 1.2, hi: 1.875 },
        { label: "C", est: 1.0, lo: 0.8, hi: 1.25 },
      ],
      "ratio",
    )!;
    expect(m.i2).toBeGreaterThan(80);
    expect(m.tau2).toBeGreaterThan(0);
    expect(m.random.hi - m.random.lo).toBeGreaterThan(m.fixed.hi - m.fixed.lo);
    expect(m.qP).toBeLessThan(0.001);
  });
  it("works on a difference scale, skips unusable rows and needs two studies", () => {
    const m = metaAnalysis(
      [
        { label: "A", est: -2, lo: -4, hi: 0 },
        { label: "B", est: -3, lo: -5, hi: -1 },
        { label: "bad", est: 5, lo: 6, hi: 7 },
      ],
      "difference",
    )!;
    near(m.fixed.est, -2.5, 1e-9);
    expect(m.skipped).toEqual(["bad"]);
    expect(metaAnalysis([{ label: "A", est: 1, lo: 0.5, hi: 2 }], "ratio")).toBeNull();
    expect(metaAnalysis([{ label: "A", est: -1, lo: -2, hi: 1 }, { label: "B", est: 1, lo: 0.5, hi: 2 }], "ratio")!).toBeNull();
  });
});

describe("dataset parsing", () => {
  it("reads comma-separated data with quotes and missing values", () => {
    const d = parseDataset('age,sex,note\n40,M,"a, b"\n50,F,NA\n,F,x');
    expect(d.rows).toBe(3);
    expect(d.columns[0]).toMatchObject({ kind: "numeric", values: [40, 50, null] });
    expect(d.columns[1].kind).toBe("categorical");
    expect(d.columns[2].values).toEqual(["a, b", null, "x"]);
  });
  it("reads tab-separated Excel pastes and semicolon files with decimal commas", () => {
    const t = parseDataset("x\ty\n1\t2\n3\t4");
    expect(t.delimiter).toBe("\t");
    expect(t.columns[1].values).toEqual([2, 4]);
    const s = parseDataset("peso;grupo\n70,5;A\n82,1;B");
    expect(s.columns[0].values).toEqual([70.5, 82.1]);
  });
  it("renames duplicate headers and rejects empty input", () => {
    expect(parseDataset("a,a\n1,2").columns.map((c) => c.name)).toEqual(["a", "a (2)"]);
    expect(() => parseDataset("   ")).toThrow();
    expect(() => parseDataset("a,b")).toThrow(/header/);
  });
  it("parses numbers, groups values and cross-tabulates", () => {
    expect(parseNumber("1 234,5", true)).toBe(1234.5);
    expect(parseNumber("12%", false)).toBe(12);
    expect(parseNumber("abc", false)).toBeNull();
    expect([...groupBy([1, 2, null, 4], ["a", "a", "b", "b"]).entries()]).toEqual([["a", [1, 2]], ["b", [4]]]);
    expect(crossTab(["x", "x", "y"], ["p", "q", "p"]).counts).toEqual([[1, 1], [1, 0]]);
  });
});

describe("reading list overview", () => {
  const paper = (pmid: string, year: string, types: string[], abstract = "x"): Article => ({
    pmid, title: `T${pmid}`, abstract, authors: ["Smith J"], journal: "J Test", year, pubTypes: types, doi: null, pmcid: null,
    journalTitle: "J Test", volume: "", issue: "", pages: "", month: "", authorsFull: [{ last: "Smith", fore: "J", initials: "J", collective: "" }],
    meshTerms: [], retracted: pmid === "3", concern: false,
  });
  it("summarises papers", () => {
    const m = emptyMatrix();
    m.decisions["1"] = "include";
    const o = overview([paper("1", "2020", ["Randomized Controlled Trial"]), paper("2", "2021", ["Review"], ""), paper("3", "2021", ["Case Reports"])], m, { "1": "note" });
    expect(o.total).toBe(3);
    expect(o.years.map((y) => y.label)).toEqual(["2020", "2021"]);
    expect(o.evidence.map((e) => e.label)).toContain("Randomized trial");
    expect(o.withAbstract).toBe(2);
    expect(o.retracted).toBe(1);
    expect(o.withNotes).toBe(1);
    expect(o.decisions).toContainEqual({ label: "Include", count: 1 });
    expect(o.authors[0]).toEqual({ label: "Smith", count: 3 });
  });
});
