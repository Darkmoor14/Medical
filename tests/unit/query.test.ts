import { describe, expect, it } from "vitest";
import {
  activeFilters,
  buildFullQuery,
  buildPicoQuery,
  EMPTY_FILTERS,
  looksRomanian,
  translateQuery,
} from "../../src/search/query";
import { decodeState, encodeState } from "../../src/search/url-state";

describe("buildFullQuery", () => {
  it("returns the plain query when no filter is set", () => {
    expect(buildFullQuery("asthma", EMPTY_FILTERS)).toBe("(asthma)");
  });

  it("combines every filter with AND and options within a filter with OR", () => {
    const q = buildFullQuery("heart failure", {
      ...EMPTY_FILTERS,
      fromYear: 2020,
      toYear: null,
      types: ["meta", "rct"],
      freeFullText: true,
      humans: true,
      languages: ["english", "romanian"],
      ages: ["aged"],
      sex: "female",
      clinical: { category: "therapy", scope: "narrow" },
    });
    expect(q).toBe(
      '(heart failure) AND (meta-analysis[pt] OR randomized controlled trial[pt]) AND ("2020/01/01"[dp] : "3000/12/31"[dp]) ' +
        "AND free full text[sb] AND humans[mh] AND (english[la] OR romanian[la]) AND aged[mh] AND female[mh] AND Therapy/Narrow[filter]",
    );
  });

  it("lists active filters with a way to clear each", () => {
    const f = { ...EMPTY_FILTERS, fromYear: 2015, toYear: 2020, types: ["sr"], humans: true };
    const chips = activeFilters(f);
    expect(chips.map((c) => c.label)).toEqual(["2015–2020", "Systematic review", "Humans"]);
    expect(chips[1].clear(f).types).toEqual([]);
  });
});

describe("buildPicoQuery", () => {
  it("builds P AND (I OR C) AND O with synonyms OR'd", () => {
    expect(
      buildPicoQuery({ p: "heart failure, cardiac failure", i: "dapagliflozin", c: "placebo", o: "hospitalization; mortality" }),
    ).toBe("((heart failure) OR (cardiac failure)) AND (dapagliflozin OR placebo) AND (hospitalization OR mortality)");
    expect(buildPicoQuery({ p: "asthma", i: "", c: "", o: "" })).toBe("asthma");
  });
});

describe("Romanian search terms", () => {
  it("rewrites Romanian terms and connectives in English", () => {
    const t = translateQuery("insuficiență cardiacă și diabet zaharat tip 2 la vârstnici");
    expect(t.text).toBe("heart failure AND type 2 diabetes mellitus la elderly");
    expect(t.replaced).toBe(3);
  });

  it("leaves English queries, quoted phrases and field tags alone", () => {
    expect(translateQuery("diagnostic accuracy of troponin").text).toBe("diagnostic accuracy of troponin");
    expect(looksRomanian("heart failure AND dapagliflozin")).toBe(false);
    expect(translateQuery('"hipertensiune arterială"[tiab] și obezitate').text).toBe('"hipertensiune arterială"[tiab] AND obesity');
  });

  it("reports words it could not translate", () => {
    expect(translateQuery("tratament pentru rinichi polichistic").untranslated).toEqual([]);
    expect(translateQuery("tratament pentru afecțiune rară").untranslated).toEqual(["afecțiune", "rară"]);
  });
});

describe("shareable links", () => {
  it("round-trips the search state through the URL hash", () => {
    const st = {
      query: "asthma AND children",
      count: 100,
      sort: "pub_date" as const,
      filters: { ...EMPTY_FILTERS, types: ["rct"], fromYear: 2019 },
    };
    const hash = encodeState(st);
    expect(hash).not.toContain("freeFullText");
    expect(decodeState(hash)).toEqual(st);
    expect(decodeState("#nothing=1")).toBeNull();
    expect(decodeState("#q=x&f=%7Bbroken")?.filters).toEqual(EMPTY_FILTERS);
  });
});
