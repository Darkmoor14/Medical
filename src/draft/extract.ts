// Pull the pieces a draft needs out of a clinical note: named sections
// (Diagnostice, Epicriză, Recomandări…) and patient details. Everything here
// runs locally on the original note; the result only pre-fills a form that
// the clinician reviews.

import type { Span } from "../entities";

export type SectionKey =
  | "diagnoses"
  | "history"
  | "exam"
  | "hospitalTreatment"
  | "homeTreatment"
  | "recommendations"
  | "investigations"
  | "consults";

const A = "[aăâ]";
const I = "[iî]";
const T = "[tțţ]";

// Order matters: more specific headings first.
const HEADINGS: [SectionKey, RegExp][] = [
  ["homeTreatment", new RegExp(`^(?:recomand${A}ri de tratament|tratament(?:ul)? (?:la domiciliu|recomandat)|schema de tratament)`, "i")],
  ["hospitalTreatment", new RegExp(`^(?:tratament(?:ul)?(?: efectuat)? (?:pe parcursul|în timpul|in timpul|din timpul)[^:\\n]*|tratament(?:ul)? (?:efectuat|administrat)|tratament${A}? ${I}n spital)`, "i")],
  ["diagnoses", new RegExp(`^(?:diagnostic(?:e|ul|ele)?(?: (?:la|de) (?:internare|externare|trimitere)| principal| secundare| prezumtiv)?|dg\\.?)`, "i")],
  ["history", new RegExp(`^(?:epicriz${A}|evolu${T}i[ae]|istoric(?:ul)?(?: bolii)?|anamnez${A}|motiv(?:ul|ele) intern${A}rii|antecedente)`, "i")],
  ["exam", new RegExp(`^(?:examen(?:ul)? (?:obiectiv|clinic)(?: la internare)?|obiectiv la internare)`, "i")],
  ["investigations", new RegExp(`^(?:analize(?: de laborator)?|investiga${T}ii(?: paraclinice)?|examen(?:e|ul)? paraclinic[e]?|rezultate)`, "i")],
  ["consults", new RegExp(`^(?:consult(?:uri|ul|ații|atii)?(?: interdisciplinare)?)`, "i")],
  ["recommendations", new RegExp(`^(?:recomand${A}ri|conduit${A}|indica${T}ii la externare)`, "i")],
];

// Any other ALL-CAPS "HEADING:" line ends the current section.
const OTHER_HEADING = /^[A-ZĂÂÎȘȚŞŢ][A-ZĂÂÎȘȚŞŢ /()-]{3,40}:\s*$/;

// Signature blocks and the standard end-of-letter statements end a section.
const STOP = new RegExp(
  `^(?:medic (?:curant|primar|specialist|rezident)|${"[sșş]"}eful (?:clinicii|sec${T}iei)|semn${A}tura|parafa|data:|se completeaz${A} obligatoriu|\\[[ x]*\\]|#\\s*rug${A}m)`,
  "i",
);

export type Sections = Partial<Record<SectionKey, string>>;

export function extractSections(text: string): Sections {
  const out: Sections = {};
  let current: SectionKey | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (current) {
      const body = buf.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      if (body) out[current] = out[current] ? `${out[current]}\n\n${body}` : body;
    }
    buf = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim().replace(/^#+\s*/, "");
    const match = HEADINGS.find(([, re]) => re.test(line));
    // A heading is a short line, or a label followed by a colon and inline text.
    const colon = line.indexOf(":");
    // Without a colon it must be a short line that is not a sentence.
    const inlineText = colon >= 0 ? line.slice(colon + 1).trim() : "";
    let isHeading =
      match &&
      ((colon > 0 && colon <= 90 && match[1].test(line.slice(0, colon))) ||
        (colon < 0 && line.length <= 50 && !/[.!?]$/.test(line)));
    // Inside a consult, its own "Dg: …" / "Recomandări: …" lines belong to the
    // consult; only a stand-alone heading line leaves it.
    if (isHeading && current === "consults" && (inlineText || match![0] === "consults")) {
      isHeading = match![0] === "consults" && !inlineText && line === line.toUpperCase();
    }
    if (isHeading) {
      flush();
      current = match![0];
      if (inlineText) buf.push(inlineText);
    } else if (OTHER_HEADING.test(line) || STOP.test(line)) {
      flush();
      current = null;
    } else if (current) {
      buf.push(raw.trimEnd());
    }
  }
  flush();
  return out;
}

// Split a diagnoses section into one diagnosis per item.
export function splitDiagnoses(section: string): string[] {
  return section
    .split(/\n+|(?<=[.;])\s+(?=[A-ZĂÂÎȘȚŞŢ0-9])/)
    .map((d) => d.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, "").replace(/[.;]\s*$/, "").trim())
    .filter((d) => d.length > 1);
}

export interface PatientInfo {
  name: string;
  cnp: string;
  age: string;
  address: string;
  admitted: string;
  discharged: string;
  fo: string;
  doctor: string;
  unit: string;
}

const DATE = String.raw`\d{1,2}[./-]\d{1,2}[./-]\d{2,4}`;

export function extractPatient(text: string, pii: Span[]): PatientInfo {
  const slice = (s: Span) => text.slice(s.start, s.end);
  const sorted = [...pii].sort((a, b) => a.start - b.start);
  const near = (cue: RegExp, labels: string[], within = 120): string => {
    const m = cue.exec(text);
    if (!m) return "";
    const s = sorted.find(
      (p) => labels.includes(p.label) && p.start >= m.index && p.start - (m.index + m[0].length) <= within,
    );
    return s ? slice(s) : "";
  };
  const person = sorted.find((p) => p.label === "PERSON" || p.label === "NAME");
  const cnpSpan = sorted.find((p) => p.label === "CNP");
  const period = new RegExp(`perioad${A}(?:\\s+de)?\\s+(${DATE})\\s*[-–]\\s*(${DATE})`, "i").exec(text);
  const admitted = new RegExp(`intern${A}(?:t|rii|re)[^.\\n]{0,40}?(?:data de|din|la)\\s+(${DATE})`, "i").exec(text);
  const discharged = new RegExp(`extern(?:eaz${A}|at${A}?|${A}rii|are)[^.\\n]{0,40}?(?:data de|din|la)\\s+(${DATE})`, "i").exec(text);
  const addressSpans = (() => {
    const m = new RegExp(`domicili(?:u|at${A}?|ul)`, "i").exec(text);
    if (!m) return [];
    return sorted.filter(
      (p) => ["STREET_ADDRESS", "LOCATION"].includes(p.label) && p.start >= m.index && p.start - m.index < 160,
    );
  })();
  const unitLine = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /^(?:spitalul|clinica|institutul|centrul medical|policlinica)\b/i.test(l));
  return {
    name:
      near(/\bpacient(?:ul|a)?\b|\bnume(?:le)?\b/i, ["PERSON", "NAME", "FIRST_NAME", "LAST_NAME"], 40) ||
      (person ? slice(person) : ""),
    cnp: cnpSpan ? slice(cnpSpan) : (/\b[1-9]\d{12}\b/.exec(text)?.[0] ?? ""),
    age: /(\d{1,3})\s*(?:de\s+)?ani\b/i.exec(text)?.[1] ?? "",
    address: addressSpans.map(slice).join(", "),
    admitted: period?.[1] ?? admitted?.[1] ?? "",
    discharged: discharged?.[1] ?? period?.[2] ?? "",
    fo: /\bF\.?\s?O\.?(?:C\.?G\.?)?\s*(?:nr\.?)?\s*:?\s*([\d][\d/-]*)/i.exec(text)?.[1] ?? "",
    doctor: near(/medic curant/i, ["PERSON", "NAME"], 200),
    unit: unitLine ?? "",
  };
}
