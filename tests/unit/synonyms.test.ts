import { describe, expect, it } from "vitest";
import { abbreviationMap, canonicalizer, findAbbreviations, singularize } from "../../src/search/synonyms";
import { tallyByDocument, toEntities } from "../../src/entities";

describe("abbreviations", () => {
  it("finds long forms defined in parentheses", () => {
    const text =
      "Patients with chronic kidney disease (CKD) and type 2 diabetes (T2D) received sodium-glucose cotransporter 2 inhibitors (SGLT2i). CKD progressed less.";
    expect([...findAbbreviations(text)]).toEqual([
      ["ckd", "chronic kidney disease"],
      ["t2d", "type 2 diabetes"],
      ["sglt2i", "sodium-glucose cotransporter 2 inhibitors"],
    ]);
  });

  it("ignores parentheses that are not abbreviations", () => {
    expect(findAbbreviations("in the elderly (n=120) and adults (95% CI) (p<0.05)").size).toBe(0);
  });

  it("uses the most common definition across papers", () => {
    const map = abbreviationMap([
      "acute kidney injury (AKI)",
      "acute kidney injury (AKI) again",
      "acute kidney insufficiency (AKI)",
    ]);
    expect(map.get("aki")).toBe("acute kidney injury");
    // A paper's own definition overrides the built-in list.
    expect(abbreviationMap(["acute kidney insufficiency (AKI)"]).get("aki")).toBe("acute kidney insufficiency");
  });

  it("knows common abbreviations that papers do not define", () => {
    const canon = canonicalizer(abbreviationMap([]));
    expect(canon("CKD")).toBe(canon("chronic kidney disease"));
    expect(canon("COPD")).toBe("chronic obstructive pulmonary disease");
    expect(canon("SGLT2 inhibitors")).toBe(canon("SGLT2i"));
  });
});

describe("singularize", () => {
  it("handles common plurals and leaves -is/-us/-es words", () => {
    expect(singularize("sglt2 inhibitors")).toBe("sglt2 inhibitor");
    expect(singularize("therapies")).toBe("therapy");
    expect(singularize("diabetes")).toBe("diabetes");
    expect(singularize("sepsis")).toBe("sepsis");
    expect(singularize("virus")).toBe("virus");
    expect(singularize("patients")).toBe("patient");
  });
});

describe("merged tallies", () => {
  it("counts CKD and chronic kidney disease as one term shown by its long form", () => {
    const a = "Chronic kidney disease (CKD) is common.";
    const b = "CKD progression was slower.";
    const ent = (text: string, term: string) => {
      const start = text.indexOf(term);
      return toEntities(text, [{ start, end: start + term.length, label: "DISEASE", score: 1 }]);
    };
    const stats = tallyByDocument(
      [
        { id: "1", entities: ent(a, "Chronic kidney disease") },
        { id: "2", entities: ent(b, "CKD") },
      ],
      canonicalizer(abbreviationMap([a, b])),
    );
    expect(stats).toHaveLength(1);
    expect(stats[0].term).toBe("Chronic kidney disease");
    expect(stats[0].docs.size).toBe(2);
  });
});
