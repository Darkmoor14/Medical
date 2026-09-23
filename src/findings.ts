// Rule-based detection of clinical signs and symptoms in English text (the
// note itself or its on-device translation). The OpenMed browser models
// recognise named diseases and drugs, not exam findings such as "pale
// mucous membranes" or "underweight", so these are matched from a list.
// Negation ("no murmurs") is handled later by isNegated().

import type { Span } from "./entities";

const FINDINGS: string[] = [
  // General / nutrition
  String.raw`underweight(?: nutritional status)?`,
  String.raw`weight loss`,
  String.raw`(?:cachexia|cachectic|wasting)`,
  String.raw`reduced subcutaneous fat`,
  String.raw`(?:fatigue|asthenia|malaise|weakness)`,
  String.raw`(?:fever|febrile|pyrexia|chills|rigors)`,
  String.raw`(?:night sweats|anorexia|loss of appetite)`,
  // Skin and mucosa
  String.raw`hyperpigment(?:ed|ation)(?: (?:skin|of the skin))?`,
  String.raw`hyperpigmented skin`,
  String.raw`(?:pallor|pale(?: skin| mucous membranes| conjunctivae)?)`,
  String.raw`(?:jaundice|jaundiced|icterus|icteric(?: sclerae)?|scleral icterus)`,
  String.raw`cyanosis`,
  String.raw`(?:mildly |moderately |severely )?dehydrat(?:ed|ion)(?: (?:skin|mucous membranes))?`,
  String.raw`(?:rash|petechiae|purpura|pruritus)`,
  // Abdomen
  String.raw`(?:hepatomegaly|splenomegaly|hepatosplenomegaly)`,
  String.raw`liver(?: la| at| is)? (?:\d+(?:[.,]\d+)? ?cm|palpable) below the (?:right )?costal margin`,
  String.raw`(?:ascites|abdominal distension|distended abdomen)`,
  String.raw`(?<!non-)(?:abdominal )?tender(?:ness)?(?: on palpation)?`,
  String.raw`(?:abdominal pain|epigastric pain)`,
  String.raw`(?:diarrh(?:o)?ea|vomiting|nausea|constipation|bloating)`,
  String.raw`(?:melaena|melena|haematochezia|hematochezia|haematemesis|hematemesis)`,
  // Chest
  String.raw`(?:crackles|rales|rhonchi|wheez(?:e|es|ing)|stridor)`,
  String.raw`(?:diminished|decreased|absent) breath sounds`,
  String.raw`(?:systolic |diastolic )?murmurs?`,
  String.raw`(?:tachycardia|bradycardia|irregular(?:ly irregular)? (?:pulse|heart rhythm)|arrhythmia)`,
  String.raw`(?:tachypn(?:o)?ea|dyspn(?:o)?ea|shortness of breath|orthopn(?:o)?ea)`,
  String.raw`(?:cough|haemoptysis|hemoptysis|chest pain|palpitations)`,
  String.raw`(?:hypotension|hypertension)`,
  // Extremities / lymph
  String.raw`(?:(?:leg|ankle|peripheral|pitting|lower limb) )?o?edema`,
  String.raw`(?:(?:palpable |cervical |axillary |inguinal )?lymphadenopathy|swollen lymph nodes)`,
  // Neuro
  String.raw`(?:meningeal irritation|neck stiffness|nuchal rigidity)`,
  String.raw`focal neurological (?:signs|deficits?)`,
  String.raw`(?:confusion|disorientation|drowsiness|somnolence|seizures?|headache|dizziness|syncope)`,
  // Urinary
  String.raw`(?:haematuria|hematuria|dysuria|oliguria|anuria|polyuria)`,
  String.raw`(?:positive )?costovertebral angle tenderness`,
];

const FINDING_RE = new RegExp(
  String.raw`(?<![\p{L}\p{N}-])(?:${FINDINGS.join("|")})(?![\p{L}\p{N}])`,
  "giu",
);

export function findSignsAndSymptoms(text: string): Span[] {
  const out: Span[] = [];
  FINDING_RE.lastIndex = 0;
  for (const m of text.matchAll(FINDING_RE)) {
    // A slightly lower score than the models, so a model's disease span wins
    // where both apply.
    out.push({ start: m.index!, end: m.index! + m[0].length, label: "FINDING", score: 0.6 });
  }
  return out;
}
