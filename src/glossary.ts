// Romanian → English clinical glossary applied before machine translation.
// General-purpose translation models mangle exam vocabulary and
// abbreviations ("splina nepalpabilă" → "spleen unmistakable"); replacing
// known terms with their English equivalents first means the model only has
// to translate the connecting words.

// Make a Romanian pattern tolerant of missing diacritics and cedilla forms.
function loose(pattern: string): string {
  const classes: Record<string, string> = {
    a: "[aăâ]", ă: "[aăâ]", â: "[aăâ]",
    i: "[iî]", î: "[iî]",
    s: "[sșş]", ș: "[sșş]", ş: "[sșş]",
    t: "[tțţ]", ț: "[tțţ]", ţ: "[tțţ]",
  };
  // Single pass, lower-case letters only: upper-case abbreviations stay exact.
  return pattern.replace(/[aăâiîsșştțţ]/g, (ch) => classes[ch]);
}

const W = String.raw`(?<![\p{L}\p{N}])`;
const E = String.raw`(?![\p{L}\p{N}])`;

// Longer phrases first. Patterns may use (?:…) for inflected endings.
const BUILT_IN: [string, string][] = [
  // Examination
  ["sub rebordul costal drept", "below the right costal margin"],
  ["sub rebordul costal stâng", "below the left costal margin"],
  ["rebord(?:ul)? costal drept", "right costal margin"],
  ["rebord(?:ul)? costal stâng", "left costal margin"],
  ["nepalpabil(?:ă|e|i)?", "non-palpable"],
  ["palpabil(?:ă|e|i)?", "palpable"],
  ["zgomote(?:le)? cardiace ritmice", "regular heart sounds"],
  ["bine bătute", "well heard"],
  ["fără sufluri", "no murmurs"],
  ["fără raluri", "no rales"],
  ["raluri (?:subcrepitante|crepitante)", "crackles"],
  ["raluri ronflante", "rhonchi"],
  ["murmur vezicular", "vesicular breath sounds"],
  ["MV prezent bilateral", "vesicular breath sounds present bilaterally"],
  ["abdomen suplu,? elastic", "soft, supple abdomen"],
  ["abdomen suplu", "soft abdomen"],
  ["nedureros la palpare(?: superficială (?:sau|și) profundă)?", "non-tender on palpation"],
  ["nedureros", "non-tender"],
  ["dureros la palpare", "tender on palpation"],
  ["tranzit intestinal prezent", "bowel movements present"],
  ["manevra Giordano negativă(?: bilateral)?", "negative costovertebral angle tenderness (Giordano sign)"],
  ["manevra Giordano pozitivă", "positive costovertebral angle tenderness (Giordano sign)"],
  ["micțiuni fiziologice(?: spontane)?", "normal spontaneous urination"],
  ["diureză fiziologică", "normal diuresis"],
  ["iritați(?:e|a) meninge(?:ană|ală|ala)", "meningeal irritation"],
  ["semne de focar", "focal neurological signs"],
  ["orientat temporo-?spațial", "oriented to time and place"],
  ["stabil(?:ă)? hemodinamic și respirator", "hemodynamically and respiratorily stable"],
  ["stabil(?:ă)? HD și respirator", "hemodynamically and respiratorily stable"],
  ["în aerul ambiental", "on room air"],
  ["tegumente(?:le)? palide", "pale skin"],
  ["mucoase(?:le)? palide", "pale mucous membranes"],
  ["deshidratat(?:ă|e)?", "dehydrated"],
  ["afebril(?:ă)?", "afebrile"],
  ["edeme gambiere", "leg oedema"],
  ["fără edeme", "no oedema"],
  ["adenopatii", "lymphadenopathy"],
  ["ficat(?:ul)?", "liver"],
  ["splin(?:a|ă)", "spleen"],
  // Conditions
  ["anemie feriprivă", "iron deficiency anaemia"],
  ["insuficiență renală cronică", "chronic kidney failure"],
  ["boală cronică de rinichi", "chronic kidney disease"],
  ["insuficiență cardiacă(?: congestivă)?", "heart failure"],
  ["cardiopatie ischemică(?: cronică)?", "ischaemic heart disease"],
  ["fibrilație atrială", "atrial fibrillation"],
  ["hipertensiune arterială", "arterial hypertension"],
  ["diabet zaharat(?: tip 2| de tip 2)", "type 2 diabetes mellitus"],
  ["diabet zaharat(?: tip 1| de tip 1)", "type 1 diabetes mellitus"],
  ["diabet zaharat", "diabetes mellitus"],
  ["accident vascular cerebral(?: ischemic)?", "stroke"],
  ["infarct miocardic acut", "acute myocardial infarction"],
  ["bronhopneumopatie obstructivă cronică", "chronic obstructive pulmonary disease"],
  ["pneumonie comunitară", "community-acquired pneumonia"],
  ["sindrom(?:ul)? de hepatocitoliză", "hepatocellular injury (raised transaminases)"],
  ["hepatocitoliză", "hepatocellular injury"],
  ["sindrom(?:ul)? colestatic", "cholestasis"],
  ["colestază", "cholestasis"],
  ["sindrom(?:ul)? diareic", "diarrhoea"],
  ["sindrom(?:ul)? consumptiv", "weight loss (wasting syndrome)"],
  ["sindrom(?:ul)? inflamator", "inflammatory syndrome"],
  ["invaginație intestinală", "intestinal intussusception"],
  ["hernie ombilicală", "umbilical hernia"],
  ["malnutriție proteino-energetică", "protein-energy malnutrition"],
  ["chist(?:uri|e)? hepatic(?:e)?", "hepatic cysts"],
  ["hipopotasemie", "hypokalaemia"],
  ["hipokaliemie", "hypokalaemia"],
  ["hiponatremie", "hyponatraemia"],
  ["hipoproteinemie", "hypoproteinaemia"],
  ["hipertrigliceridemie", "hypertriglyceridaemia"],
  ["aerocolie", "colonic gaseous distension"],
  ["litiază biliară", "gallstones"],
  ["ciroză hepatică", "liver cirrhosis"],
  ["steatoză hepatică", "hepatic steatosis"],
  // Abbreviations (upper case only, so ordinary words are not touched)
  ["HTA", "arterial hypertension"],
  ["DZ", "diabetes mellitus"],
  ["BCR", "chronic kidney disease"],
  ["BPOC", "COPD"],
  ["ICC", "congestive heart failure"],
  ["CIC", "chronic ischaemic heart disease"],
  ["FiA", "atrial fibrillation"],
  ["IMA", "acute myocardial infarction"],
  ["AVC", "stroke"],
  ["TEP", "pulmonary embolism"],
  ["TVP", "deep vein thrombosis"],
  ["HLG", "complete blood count"],
  ["VSH", "ESR"],
  ["TA", "blood pressure"],
  ["AV", "heart rate"],
  ["EDS", "upper GI endoscopy"],
  ["EDI", "colonoscopy"],
  ["SCIV", "intravenous contrast"],
  ["ROT", "deep tendon reflexes"],
  ["RFG", "eGFR"],
  ["TGO", "AST"],
  ["TGP", "ALT"],
  ["GOT", "AST"],
  ["GPT", "ALT"],
  ["FA", "alkaline phosphatase"],
];

const ABBREVIATION = /^[A-Za-z]{2,5}$/;

export interface GlossaryEntry {
  re: RegExp;
  en: string;
  abbreviation: boolean;
}

function compile(pattern: string, en: string, caseSensitive: boolean): GlossaryEntry {
  return {
    re: new RegExp(`${W}(?:${loose(pattern)})${E}`, caseSensitive ? "gu" : "giu"),
    en,
    abbreviation: caseSensitive,
  };
}

const BUILT_IN_ENTRIES: GlossaryEntry[] = BUILT_IN.map(([ro, en]) =>
  // Abbreviations match exactly as written (upper case); phrases ignore case.
  compile(ro, en, ABBREVIATION.test(ro) && ro !== ro.toLowerCase()),
);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// User glossary: one "romanian = english" pair per line.
export function parseUserGlossary(text: string): GlossaryEntry[] {
  return text
    .split("\n")
    .map((line) => line.split("="))
    .filter((parts) => parts.length === 2 && parts[0].trim() && parts[1].trim())
    .map(([ro, en]) => compile(escapeRe(ro.trim()), en.trim(), false))
    .sort((a, b) => b.re.source.length - a.re.source.length);
}

// Replace known Romanian terms with English. User entries go first so they
// can override the built-in list. Placeholders like [PERSON] are left alone.
export function applyGlossary(segment: string, user: GlossaryEntry[] = []): { text: string; replaced: number } {
  let replaced = 0;
  let text = segment;
  for (const { re, en, abbreviation } of [...user, ...BUILT_IN_ENTRIES]) {
    re.lastIndex = 0;
    text = text.replace(re, (m, ...args) => {
      const offset = args[args.length - 2] as number;
      const whole = args[args.length - 1] as string;
      // Skip text inside a redaction placeholder.
      if (whole.lastIndexOf("[", offset) > whole.lastIndexOf("]", offset)) return m;
      replaced++;
      // Keep a capital letter at the start of a sentence or heading.
      return !abbreviation && /^\p{Lu}/u.test(m) ? en[0].toUpperCase() + en.slice(1) : en;
    });
  }
  return { text, replaced };
}
