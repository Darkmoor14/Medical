import { describe, expect, it } from "vitest";
import { extractEffects, primaryEffect } from "../../src/stats/extract";

const ex = (abstract: string) => extractEffects({ title: "T", abstract });

describe("effect extraction from abstracts", () => {
  it("reads common ratio formats", () => {
    expect(ex("Treatment reduced events (HR 0.72, 95% CI 0.61-0.85; P<0.001).")[0]).toMatchObject({ kind: "HR", est: 0.72, lo: 0.61, hi: 0.85 });
    expect(ex("The odds ratio was 2.3 (95% confidence interval 1.1 to 4.8).")[0]).toMatchObject({ kind: "OR", est: 2.3, lo: 1.1, hi: 4.8 });
    expect(ex("Risk was higher (RR = 1.45, 95% CI: 1.10–1.91).")[0]).toMatchObject({ kind: "RR", est: 1.45, lo: 1.1, hi: 1.91 });
    expect(ex("hazard ratio, 0.80; 95% CI, 0.70 to 0.91")[0]).toMatchObject({ kind: "HR", est: 0.8, lo: 0.7, hi: 0.91 });
    expect(ex("adjusted OR 1.8 (1.2-2.7)")[0]).toMatchObject({ kind: "OR", est: 1.8, lo: 1.2, hi: 2.7 });
    expect(ex("relative risk 0.5 (95% CI 0.3 to 0.8)")[0].kind).toBe("RR");
  });
  it("reads differences with negative values", () => {
    expect(ex("Mean difference −2.3 (95% CI −4.1 to −0.5) mmHg.")[0]).toMatchObject({ kind: "MD", scale: "difference", est: -2.3, lo: -4.1, hi: -0.5 });
    expect(ex("The difference was a mean difference of 3.1 (95% CI 1.0 to 5.2).")[0]).toMatchObject({ kind: "MD", est: 3.1 });
  });
  it("ignores ordinary words and inconsistent numbers", () => {
    expect(ex("Patients or controls 5 (2-3) were seen.")).toEqual([]);
    expect(ex("OR 3.0 (95% CI 4.0-5.0)")).toEqual([]); // estimate outside its interval
    expect(ex("No effect sizes here, only 45 patients.")).toEqual([]);
  });
  it("keeps the source sentence, drops duplicates and picks by scale", () => {
    const abs = "We enrolled 200 patients. Mortality fell (HR 0.72, 95% CI 0.61-0.85). Pain scores improved (mean difference -1.2, 95% CI -2.0 to -0.4). The HR 0.72 (95% CI 0.61-0.85) held.";
    const all = ex(abs);
    expect(all.map((e) => e.kind)).toEqual(["HR", "MD"]);
    expect(all[0].sentence).toContain("Mortality fell");
    expect(primaryEffect({ title: "", abstract: abs }, "difference")?.kind).toBe("MD");
    expect(primaryEffect({ title: "", abstract: "nothing" }, "ratio")).toBeNull();
  });
});
