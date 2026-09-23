import { describe, expect, it } from "vitest";
import { findRomanianPii, isValidCnp, mergePii } from "../../src/ro-pii";
import { detectLanguage, prepareForTranslation, segmentSentences } from "../../src/lang";

const found = (text: string) => findRomanianPii(text).map((s) => [s.label, text.slice(s.start, s.end)]);

describe("isValidCnp", () => {
  it("accepts a CNP with a correct control digit", () => {
    expect(isValidCnp("1610412400010")).toBe(true);
  });

  it("rejects bad control digits, dates, counties and serials", () => {
    expect(isValidCnp("1610412400011")).toBe(false); // control
    expect(isValidCnp("1611312400010")).toBe(false); // month 13
    expect(isValidCnp("1610412480010")).toBe(false); // county 48 unassigned
    expect(isValidCnp("9610412400010")).toBe(false); // century code
    expect(isValidCnp("161041240001")).toBe(false); // length
  });
});

describe("findRomanianPii", () => {
  it("finds CNP (valid or mistyped) and ID cards", () => {
    expect(found("CNP 1610412400010, CI seria RX nr. 123456")).toEqual([
      ["CNP", "1610412400010"],
      ["ID_NUM", "CI seria RX nr. 123456"],
    ]);
    expect(found("cnp: 1610412400019")).toEqual([["ID_NUM", "1610412400019"]]);
  });

  it("finds phones, dates and emails", () => {
    const t = "Tel. 0722 123 456 sau +40 21 318 4455, născut 12.04.1961, internat 3 martie 2024, ion.pop@exemplu.ro";
    expect(found(t)).toEqual(
      expect.arrayContaining([
        ["PHONE", "0722 123 456"],
        ["PHONE", "+40 21 318 4455"],
        ["DATE", "12.04.1961"],
        ["DATE", "3 martie 2024"],
        ["EMAIL", "ion.pop@exemplu.ro"],
      ]),
    );
  });

  it("finds day.month dates but not decimals", () => {
    expect(found("bilanț superpozabil celui din 31.08, consult în data de 14.09")).toEqual([
      ["DATE", "31.08"],
      ["DATE", "14.09"],
    ]);
    expect(found("Hidratare 1.5l lichide/zi, diametru 6.5 cm, Hb 12.4 g/dl")).toEqual([]);
  });

  it("handles hospital headers: caps names, cedilla letters, phone lists", () => {
    const t = "SPITALUL CLINIC JUDEŢEAN DE URGENŢĂ PLOIEŞTI\nPloieşti - Sud, str. Ghe. Exemplu, nr. 5\nTel:0244 - 111111, 222222 ; Fax. 0244 – 333333";
    const labels = found(t);
    expect(labels).toContainEqual(["ORGANIZATION", "SPITALUL CLINIC JUDEŢEAN DE URGENŢĂ PLOIEŞTI"]);
    expect(labels).toContainEqual(["LOCATION", "Ploieşti"]);
    expect(labels).toContainEqual(["PHONE", "0244 - 111111, 222222"]);
    expect(labels).toContainEqual(["PHONE", "0244 – 333333"]);
  });

  it("reads signature blocks: chained titles, headings are not names", () => {
    const t = "Prof. Dr. Pop Ana- Maria\n\nMedic curant\n\nMedic specialist medicina interna\n\nDr. Rus Ioana";
    expect(found(t)).toEqual([
      ["PERSON", "Pop Ana- Maria"],
      ["PERSON", "Rus Ioana"],
    ]);
  });

  it("finds addresses and administrative units", () => {
    const t = "Domiciliu: Str. Mihai Eminescu nr. 12, bl. A3, ap. 7, sector 2, jud. Cluj";
    expect(found(t)).toEqual(
      expect.arrayContaining([
        ["STREET_ADDRESS", "Str. Mihai Eminescu nr. 12, bl. A3, ap. 7"],
        ["LOCATION", "sector 2"],
        ["LOCATION", "jud. Cluj"],
      ]),
    );
  });

  it("finds names after titles and field labels, but not clinical words", () => {
    expect(found("Pacient: Popescu Ion, medic curant Dr. Ionescu Maria.")).toEqual([
      ["PERSON", "Popescu Ion"],
      ["PERSON", "Ionescu Maria"],
    ]);
    expect(found("Pacientul Internat pentru dispnee")).toEqual([]);
  });

  it("finds cities", () => {
    expect(found("Domiciliul în București, născut în Cluj-Napoca.")).toEqual([
      ["LOCATION", "București"],
      ["LOCATION", "Cluj-Napoca"],
    ]);
  });

  it("finds named institutions", () => {
    expect(found("Internat în Spitalul Clinic Județean Cluj.")).toContainEqual([
      "ORGANIZATION",
      "Spitalul Clinic Județean Cluj",
    ]);
  });

  it("finds hospital record numbers", () => {
    expect(found("FO nr. 4821/2024")).toEqual([["ID_NUM", "4821/2024"]]);
  });

  it("leaves clinical text alone", () => {
    expect(found("Diabet zaharat tip 2, apixaban 5 mg de două ori pe zi, RFG 45 ml/min.")).toEqual([]);
  });
});

describe("mergePii", () => {
  it("unions overlapping spans and keeps the CNP label", () => {
    expect(
      mergePii(
        [{ start: 0, end: 8, label: "ID_NUM", score: 0.6 }],
        [{ start: 4, end: 17, label: "CNP", score: 1 }, { start: 20, end: 25, label: "DATE", score: 1 }],
      ),
    ).toEqual([
      { start: 0, end: 17, label: "CNP", score: 0.6 },
      { start: 20, end: 25, label: "DATE", score: 1 },
    ]);
  });
});

describe("language helpers", () => {
  it("detects Romanian and English notes", () => {
    expect(detectLanguage("Pacient cu diabet zaharat, internat pentru pneumonie. Tratament cu apixaban.")).toBe("ro");
    expect(detectLanguage("Patient admitted with pneumonia and started on apixaban.")).toBe("en");
  });

  it("segments sentences without losing text or splitting decimals", () => {
    const text = "Diagnostic: DZ tip 2. Doză 2.5 mg.\n\nControl peste 2 săptămâni.";
    const segs = segmentSentences(text);
    expect(segs.map((s) => s.text).join("")).toBe(text);
    expect(segs.some((s) => s.text.includes("2.5 mg"))).toBe(true);
    expect(segs.find((s) => s.text === "\n\n")?.translate).toBe(false);
  });

  it("sentence-cases ALL-CAPS segments before translation", () => {
    expect(prepareForTranslation("SINDROM DIAREIC REMIS. HERNIE OMBILICALĂ NECOMPLICATĂ. ")).toBe(
      "Sindrom diareic remis. Hernie ombilicală necomplicată. ",
    );
    expect(prepareForTranslation("Pacientă cu HTA și DZ tip 2.")).toBe("Pacientă cu HTA și DZ tip 2.");
    expect(prepareForTranslation("PACIENTA [PERSON] INTERNATĂ")).toBe("Pacienta [PERSON] internată");
  });
});
