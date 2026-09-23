import { describe, expect, it } from "vitest";
import { applyGlossary, parseUserGlossary } from "../../src/glossary";

describe("applyGlossary", () => {
  it("fixes the exam sentence that NLLB mistranslated", () => {
    const { text, replaced } = applyGlossary("Ficat la 2 cm sub rebordul costal drept si splina nepalpabila");
    expect(text).toBe("Liver la 2 cm below the right costal margin si spleen non-palpable");
    expect(replaced).toBe(4);
  });

  it("tolerates missing diacritics and case, and inflected endings", () => {
    expect(applyGlossary("Fără semne de iritație meningeană. HIPOPOTASEMIE CORECTATĂ.").text).toBe(
      "Fără semne de meningeal irritation. Hypokalaemia CORECTATĂ.",
    );
    expect(applyGlossary("Abdomen suplu, elastic, nedureros la palpare superficiala si profunda").text).toBe(
      "Soft, supple abdomen, non-tender on palpation",
    );
  });

  it("expands upper-case abbreviations only", () => {
    expect(applyGlossary("TA 123/78 mmHg, AV 74/min, HTA grad II, EDS+EDI").text).toBe(
      "blood pressure 123/78 mmHg, heart rate 74/min, arterial hypertension grad II, upper GI endoscopy+colonoscopy",
    );
    // Lower-case "ta" / "av" are ordinary Romanian words and stay.
    expect(applyGlossary("mama ta av").text).toBe("mama ta av");
  });

  it("never touches redaction placeholders", () => {
    expect(applyGlossary("[ID_NUM] HTA [PERSON]").text).toBe("[ID_NUM] arterial hypertension [PERSON]");
  });

  it("applies user entries first", () => {
    const user = parseUserGlossary("splina nepalpabila = spleen not palpable\nbad line\n = x");
    expect(user).toHaveLength(1);
    expect(applyGlossary("splină nepalpabilă", user).text).toBe("spleen not palpable");
  });
});
