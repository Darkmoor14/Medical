// Language detection and sentence segmentation for the translation step.

export type NoteLanguage = "en" | "ro";

const RO_WORDS = new Set([
  "și", "si", "cu", "de", "la", "în", "pe", "din", "pentru", "este", "sunt", "fără", "fara",
  "pacient", "pacientul", "pacienta", "internat", "internată", "externat", "diagnostic",
  "tratament", "prezintă", "prezinta", "ani", "zile", "mg", "cp", "ale", "sau", "care",
  "istoric", "examen", "clinic", "tensiune", "arterială", "arteriala", "insuficiență",
  "insuficienta", "cronică", "cronica", "acută", "acuta", "recomandări", "recomandari",
]);
const EN_WORDS = new Set([
  "the", "and", "with", "of", "to", "in", "on", "for", "is", "was", "are", "patient",
  "history", "admitted", "discharged", "treatment", "started", "plan", "daily", "years",
  "old", "has", "had", "without", "chronic", "acute", "follow",
]);

export function detectLanguage(text: string): NoteLanguage {
  const words = text.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  let ro = 0;
  let en = 0;
  for (const w of words) {
    if (RO_WORDS.has(w)) ro++;
    if (EN_WORDS.has(w)) en++;
  }
  // Romanian diacritics are a strong signal on their own.
  ro += (text.match(/[ăâîșțşţ]/gi)?.length ?? 0) * 0.5;
  return ro > en ? "ro" : "en";
}

export interface Segment {
  text: string;
  // Whether this segment has words worth translating.
  translate: boolean;
}

// Split into sentence-sized pieces, keeping line breaks as their own
// segments so the translation can be laid out like the original.
export function segmentSentences(text: string, maxChars = 400): Segment[] {
  const out: Segment[] = [];
  const lines = text.split(/(\n+)/);
  for (const line of lines) {
    if (!line) continue;
    if (/^\n+$/.test(line)) {
      out.push({ text: line, translate: false });
      continue;
    }
    // Split after sentence punctuation that is followed by whitespace, so
    // decimals like "2.5 mg" stay intact. Joining the pieces gives the line back.
    const sentences = line.split(/(?<=[.!?;])(?=\s)/);
    for (const s of sentences) {
      for (let i = 0; i < s.length; i += maxChars) {
        const piece = s.slice(i, i + maxChars);
        out.push({ text: piece, translate: /\p{L}{2,}/u.test(piece.replace(/\[[A-Z_]+\]/g, "")) });
      }
    }
  }
  return out;
}

// Translation models handle ALL-CAPS text poorly (common for diagnosis lines
// in Romanian discharge letters), so shouting segments are sentence-cased
// first. Redaction placeholders like [PERSON] are kept as they are.
export function prepareForTranslation(segment: string): string {
  const letters = segment.replace(/\[[A-Z_]+\]/g, "").match(/\p{L}/gu) ?? [];
  const upper = letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length;
  if (letters.length < 8 || upper / letters.length < 0.7) return segment;
  let startOfSentence = true;
  return segment.replace(/\[[A-Z_]+\]|\p{L}+|[.!?]/gu, (tok) => {
    if (tok.startsWith("[")) {
      startOfSentence = false;
      return tok;
    }
    if (/^[.!?]$/.test(tok)) {
      startOfSentence = true;
      return tok;
    }
    const lower = tok.toLowerCase();
    const out = startOfSentence ? lower[0].toUpperCase() + lower.slice(1) : lower;
    startOfSentence = false;
    return out;
  });
}
