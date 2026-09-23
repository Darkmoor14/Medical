// Rule-based detection of Romanian identifiers, run alongside the OpenMed
// PII model. Formats like CNP, CI series or phone numbers are caught far more
// reliably by patterns than by an English-trained model. Ported in part from
// OpenMed's Python `pii_i18n` Romanian pack (CNP validator, date/phone/street
// patterns).

import type { Span } from "./entities";

const CNP_WEIGHTS = [2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9];
const CNP_CENTURY: Record<number, number> = { 1: 1900, 2: 1900, 3: 1800, 4: 1800, 5: 2000, 6: 2000 };

// Validates structure, birth date, county code and control digit.
export function isValidCnp(cnp: string, today = new Date()): boolean {
  if (!/^\d{13}$/.test(cnp)) return false;
  const n = [...cnp].map(Number);
  const century = CNP_CENTURY[n[0]];
  if (!century) return false;
  const year = century + n[1] * 10 + n[2];
  const month = n[3] * 10 + n[4];
  const day = n[5] * 10 + n[6];
  const birth = new Date(Date.UTC(year, month - 1, day));
  if (birth.getUTCFullYear() !== year || birth.getUTCMonth() !== month - 1 || birth.getUTCDate() !== day) {
    return false;
  }
  if (birth.getTime() > today.getTime()) return false;
  const county = n[7] * 10 + n[8];
  if (!((county >= 1 && county <= 46) || county === 51 || county === 52 || county === 70)) return false;
  if (n[9] * 100 + n[10] * 10 + n[11] === 0) return false;
  let control = CNP_WEIGHTS.reduce((sum, w, i) => sum + w * n[i], 0) % 11;
  if (control === 10) control = 1;
  return n[12] === control;
}

const L = "A-Za-zĂÂÎȘȚŞŢăâîșțşţÁÉÍÓÚáéíóúÖÜöü";
const UPPER = "A-ZĂÂÎȘȚŞŢÁÉÍÓÚÖÜ";
const NAME = `[${UPPER}][${L}'-]+`;
const FULL_NAME = `${NAME}(?:[ -]${NAME}){0,3}`;
const MONTHS =
  "ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie|" +
  "ian|feb|mar|apr|iun|iul|aug|sept?|oct|noi|dec";

const CITIES = [
  "București", "Bucuresti", "Alba Iulia", "Arad", "Pitești", "Pitesti", "Bacău", "Bacau", "Oradea",
  "Bistrița", "Bistrita", "Botoșani", "Botosani", "Brașov", "Brasov", "Brăila", "Braila", "Buzău", "Buzau",
  "Reșița", "Resita", "Călărași", "Calarasi", "Cluj-Napoca", "Cluj", "Constanța", "Constanta",
  "Sfântu Gheorghe", "Sfantu Gheorghe", "Târgoviște", "Targoviste", "Craiova", "Galați", "Galati",
  "Giurgiu", "Târgu Jiu", "Targu Jiu", "Miercurea Ciuc", "Deva", "Slobozia", "Iași", "Iasi",
  "Baia Mare", "Drobeta-Turnu Severin", "Târgu Mureș", "Targu Mures", "Piatra Neamț", "Piatra Neamt",
  "Slatina", "Ploiești", "Ploiesti", "Satu Mare", "Zalău", "Zalau", "Sibiu", "Suceava", "Alexandria",
  "Timișoara", "Timisoara", "Tulcea", "Vaslui", "Râmnicu Vâlcea", "Ramnicu Valcea", "Focșani", "Focsani",
  "Ilfov", "Chișinău", "Chisinau",
]
  .sort((a, b) => b.length - a.length)
  .join("|");

interface Rule {
  label: string;
  re: RegExp;
  // Index of the capture group holding the identifier; 0 = whole match.
  group?: number;
  accept?: (value: string) => boolean;
  labelFor?: (value: string) => string;
}

const RULES: Rule[] = [
  {
    // Every 13-digit run is treated as an identifier: a mistyped CNP is still
    // identifying. Valid ones are labelled CNP.
    label: "ID_NUM",
    re: /(?<!\d)\d{13}(?!\d)/g,
    labelFor: (v) => (isValidCnp(v) ? "CNP" : "ID_NUM"),
  },
  // Identity card: "CI seria RX nr. 123456", "B.I. XT 654321", "seria KX 123456".
  {
    label: "ID_NUM",
    re: new RegExp(
      String.raw`(?:\b(?:C\.?\s?I\.?|B\.?\s?I\.?|carte(?:a)? de identitate|buletin)\b[\s:,.-]*)?` +
        String.raw`\bseri(?:a|e)\s*:?\s*[A-Z]{2}\s*(?:,?\s*(?:nr|număr|numar)\.?\s*:?\s*)?\d{6}\b` +
        String.raw`|\b(?:C\.?\s?I\.?|B\.?\s?I\.?)\s*:?\s*[A-Z]{2}\s*\d{6}\b`,
      "gi",
    ),
  },
  // Health insurance card (card de sănătate): 20 digits.
  { label: "ID_NUM", re: /(?<!\d)\d{20}(?!\d)/g },
  // Romanian IBAN.
  { label: "ACCOUNT_NUMBER", re: /\bRO\d{2}\s?[A-Z]{4}(?:\s?[A-Z0-9]{4}){4}\b/gi },
  // Hospital record numbers: FO / FOCG / foaie de observație / nr. internare / registru.
  {
    label: "ID_NUM",
    re: /\b(?:F\.?O\.?(?:C\.?G\.?)?|FOCG|foaia? de observa(?:ț|ţ|t)ie(?: clinic(?:ă|a) general(?:ă|a))?|nr\.?\s*(?:de\s*)?(?:internare|înregistrare|inregistrare|registru|dosar|fi(?:ș|ş|s)(?:ă|a))|cod(?:ul)? pacient|ID pacient)\s*(?:nr\.?)?\s*:?\s*([A-Z]{0,3}[-/]?\d[\d/-]{2,})/gi,
    group: 1,
  },
  // Phones: +40 / 0040 / 0 prefix, mobile (07xx) and landline.
  {
    label: "PHONE",
    re: /(?<![\w+])(?:(?:\+|00)40[\s.-]?|0)(?:7\d{2}[\s.-]?\d{3}[\s.-]?\d{3}|[23]\d{1,2}[\s.-]?\d{3}[\s.-]?\d{3,4})(?!\d)/g,
  },
  { label: "EMAIL", re: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g },
  // Dates: 12.04.1961, 12/04/61, 12-04-1961, 12 aprilie 1961.
  { label: "DATE", re: /(?<![\d.])\d{1,2}[./-]\d{1,2}[./-](?:\d{4}|\d{2})(?![\d])/g },
  { label: "DATE", re: new RegExp(String.raw`\b\d{1,2}\s+(?:${MONTHS})\.?\s+\d{4}\b`, "gi") },
  // Street addresses with optional nr./bl./sc./et./ap. tail.
  {
    label: "STREET_ADDRESS",
    re: new RegExp(
      String.raw`\b(?:Str\.?|Strada|Bd\.?|B-dul|Bdul\.?|Bulevardul|Calea|Aleea|(?:Ș|Ş|S)os\.?|(?:Ș|Ş|S)oseaua|Splaiul|Pia(?:ț|ţ|t)a|Intrarea|Drumul|Prelungirea)\s+` +
        String.raw`[${L}0-9][${L}0-9 .'-]{1,50}?` +
        String.raw`(?:,?\s*(?:nr|număr|numar)\.?\s*\d+[A-Za-z]?)` +
        String.raw`(?:,?\s*(?:bl|bloc|sc|scara|et|etaj|ap|apartament)\.?\s*[A-Za-z0-9]+)*`,
      "gi",
    ),
  },
  // Administrative units: "jud. Cluj", "județul Iași", "sector 3", "mun. Brașov", "com. X", "sat X".
  {
    label: "LOCATION",
    re: new RegExp(
      String.raw`\b(?:jud\.|jude(?:ț|ţ|t)ul|mun\.|municipiul|ora(?:ș|ş|s)ul|com\.|comuna|sat(?:ul)?|loc\.|localitatea)\s*${FULL_NAME}` +
        String.raw`|\bsector(?:ul)?\s*[1-6]\b`,
      "g",
    ),
  },
  // Named institutions: "Spitalul Clinic Județean Cluj", "Clinica Medicala Sfântul Ioan".
  {
    label: "ORGANIZATION",
    re: new RegExp(
      String.raw`\b(?:Spitalul|Clinica|Institutul|Centrul Medical|Policlinica|Cabinetul(?: medical)?)\s+${FULL_NAME}`,
      "g",
    ),
  },
  // County seats and large cities (Safe Harbor treats towns as identifiers).
  { label: "LOCATION", re: new RegExp(String.raw`(?<![\p{L}])(?:${CITIES})(?![\p{L}])`, "gu") },
  // Postal code after a cue word.
  { label: "ZIPCODE", re: /\b(?:cod po(?:ș|ş|s)tal|CP)\s*:?\s*(\d{6})\b/gi, group: 1 },
  // Names after titles or field labels: "Dr. Ionescu Maria", "Pacient: Popescu Ion",
  // "Nume: ...", "As. Pop", "medic curant Georgescu".
  {
    label: "PERSON",
    re: new RegExp(
      String.raw`(?:\b(?:Dr|dr|Prof|prof|As|as|Asist|Conf|Șef lucr|Sef lucr|Ing|D-na|D-l|Dna|Dl|Doamna|Domnul)\.?\s+` +
        String.raw`|\b(?:[Pp]acient(?:ul|a|ului|ei)?|[Nn]ume(?:le)?(?: (?:și|si) prenume(?:le)?)?|[Pp]renume(?:le)?|[Mm]edic(?: curant| de familie| primar| specialist| rezident)?|[Aa]parținător|[Aa]partinator|[Ss]emnătura|[Ss]emnatura|[Mm]ama|[Tt]atăl|[Tt]atal|[Ss]oți(?:a|ul)|[Ss]oti(?:a|ul))\s*:?\s+(?:(?:Dr|dr|Prof|prof|As|as|Conf|conf)\.?\s+)?)` +
        `(${FULL_NAME})`,
      "g",
    ),
    group: 1,
    // Avoid redacting clinical words that happen to follow "pacient".
    accept: (v) => !/^(?:cu|de|în|in|la|din|prezintă|prezinta|internat|internată|cunoscut|cunoscută|diagnosticat|diagnosticată|afebril|afebrilă|echilibrat|stabil|Dr)$/i.test(v.split(/\s/)[0]),
  },
];

export function findRomanianPii(text: string): Span[] {
  const out: Span[] = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    for (const m of text.matchAll(rule.re)) {
      const g = rule.group ?? 0;
      const value = m[g];
      if (!value) continue;
      if (rule.accept && !rule.accept(value)) continue;
      const start = m.index! + (g === 0 ? 0 : m[0].indexOf(value));
      out.push({
        start,
        end: start + value.length,
        label: rule.labelFor ? rule.labelFor(value) : rule.label,
        score: 1,
      });
    }
  }
  return out;
}

// Union of model and rule spans; overlapping spans are merged so nothing is
// partially redacted.
export function mergePii(...lists: Span[][]): Span[] {
  const all = lists.flat().sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Span[] = [];
  for (const s of all) {
    const last = merged.at(-1);
    if (last && s.start < last.end) {
      if (s.end > last.end) last.end = s.end;
      // Prefer the more specific rule label (e.g. CNP over a generic model tag).
      if (s.label === "CNP") last.label = "CNP";
    } else {
      merged.push({ ...s });
    }
  }
  return merged;
}
