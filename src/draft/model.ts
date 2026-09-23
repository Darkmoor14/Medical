// Document templates. Each template turns the reviewed form data into a
// simple block list that is rendered both as an HTML preview and as .docx.

export type DocType = "discharge" | "summary" | "referral";

export type CheckState = "yes" | "not-needed" | "no" | "";

export interface DraftData {
  docType: DocType;
  unit: string;
  ward: string;
  patientName: string;
  sex: "F" | "M" | "";
  cnp: string;
  age: string;
  address: string;
  admitted: string;
  discharged: string;
  fo: string;
  diagnoses: { text: string; icd: string }[];
  history: string;
  exam: string;
  investigations: string;
  hospitalTreatment: string;
  homeTreatment: string;
  recommendations: string;
  referralTo: string;
  referralUnit: string;
  referralReason: string;
  doctor: string;
  doctorTitle: string;
  date: string;
  checks: { prescription: CheckState; leave: CheckState; homeCare: CheckState; devices: CheckState };
}

export type Block =
  | { kind: "title"; text: string }
  | { kind: "meta"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "para"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "checks"; groups: { options: { label: string; on: boolean }[] }[] }
  | { kind: "signature"; lines: string[] }
  | { kind: "draftNote"; text: string };

export const DOC_TYPES: { value: DocType; label: string }[] = [
  { value: "discharge", label: "Discharge letter (Scrisoare medicală / Bilet de externare)" },
  { value: "summary", label: "Diagnosis summary (Rezumat diagnostic)" },
  { value: "referral", label: "Referral letter (Scrisoare de trimitere)" },
];

export const DRAFT_NOTE =
  "PROIECT generat automat din notele medicului. Se verifică, se completează și se semnează de medicul curant înainte de utilizare.";

const blank = (v: string, placeholder = "……………") => (v.trim() ? v.trim() : placeholder);

function paragraphs(text: string): Block[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ kind: "para" as const, text: p }));
}

function patientSentence(d: DraftData): string {
  const f = d.sex === "F";
  const who = d.sex ? (f ? "pacienta" : "pacientul") : "pacientul/pacienta";
  const born = d.sex ? (f ? "domiciliată" : "domiciliat") : "domiciliat(ă)";
  const adm = d.sex ? (f ? "internată" : "internat") : "internat(ă)";
  return (
    `Stimate(ă) coleg(ă), vă informăm că ${who} ${blank(d.patientName)}, în vârstă de ${blank(d.age, "…")} ani, ` +
    `CNP ${blank(d.cnp)}, ${born} în ${blank(d.address)}, a fost ${adm} în serviciul nostru ` +
    `în perioada ${blank(d.admitted, "……")} – ${blank(d.discharged, "……")}, nr. FO ${blank(d.fo)}.`
  );
}

function diagnosisList(d: DraftData): Block {
  const items = d.diagnoses.filter((x) => x.text.trim());
  return items.length
    ? { kind: "list", items: items.map((x) => (x.icd.trim() ? `${x.text.trim()} (${x.icd.trim()})` : x.text.trim())) }
    : { kind: "para", text: "……………" };
}

function section(heading: string, text: string): Block[] {
  return text.trim() ? [{ kind: "heading", text: heading }, ...paragraphs(text)] : [];
}

function header(d: DraftData): Block[] {
  const lines = [d.unit, d.ward].map((s) => s.trim()).filter(Boolean);
  return lines.length ? [{ kind: "meta", text: lines.join("\n") }] : [];
}

function signature(d: DraftData, role: string): Block {
  return {
    kind: "signature",
    lines: [`Data: ${blank(d.date, "……")}`, role, d.doctorTitle.trim(), blank(d.doctor), "Semnătura și parafa"].filter(Boolean),
  };
}

const CHECK_GROUPS: { key: keyof DraftData["checks"]; yes: string; notNeeded: string; no: string }[] = [
  {
    key: "prescription",
    yes: "S-a eliberat prescripție medicală, seria ……… nr. ………",
    notNeeded: "Nu s-a eliberat prescripție medicală deoarece nu a fost necesar",
    no: "Nu s-a eliberat prescripție medicală",
  },
  {
    key: "leave",
    yes: "S-a eliberat concediu medical la externare, seria ……… nr. ………",
    notNeeded: "Nu s-a eliberat concediu medical la externare deoarece nu a fost necesar",
    no: "Nu s-a eliberat concediu medical la externare",
  },
  {
    key: "homeCare",
    yes: "S-a eliberat recomandare pentru îngrijiri medicale la domiciliu/paliative la domiciliu",
    notNeeded: "Nu s-a eliberat recomandare pentru îngrijiri medicale la domiciliu/paliative la domiciliu, deoarece nu a fost necesar",
    no: "",
  },
  {
    key: "devices",
    yes: "S-a eliberat prescripție medicală pentru dispozitive medicale în ambulatoriu",
    notNeeded: "Nu s-a eliberat prescripție medicală pentru dispozitive medicale în ambulatoriu deoarece nu a fost necesar",
    no: "",
  },
];

export function buildDocument(d: DraftData): Block[] {
  const blocks: Block[] = [{ kind: "draftNote", text: DRAFT_NOTE }, ...header(d)];
  if (d.docType === "discharge") {
    blocks.push(
      { kind: "title", text: "SCRISOARE MEDICALĂ / BILET DE EXTERNARE" },
      { kind: "para", text: patientSentence(d) },
      { kind: "heading", text: "DIAGNOSTICE" },
      diagnosisList(d),
      ...section("EPICRIZĂ", d.history),
      ...section("EXAMENUL OBIECTIV LA INTERNARE", d.exam),
      ...section("INVESTIGAȚII", d.investigations),
      ...section("TRATAMENT PE PARCURSUL INTERNĂRII", d.hospitalTreatment),
      ...section("RECOMANDĂRI", d.recommendations),
      ...section("RECOMANDĂRI DE TRATAMENT", d.homeTreatment),
      {
        kind: "checks",
        groups: CHECK_GROUPS.map((g) => ({
          options: [
            { label: g.yes, on: d.checks[g.key] === "yes" },
            { label: g.notNeeded, on: d.checks[g.key] === "not-needed" },
            ...(g.no ? [{ label: g.no, on: d.checks[g.key] === "no" }] : []),
          ],
        })),
      },
      signature(d, "Medic curant"),
    );
  } else if (d.docType === "summary") {
    blocks.push(
      { kind: "title", text: "REZUMAT DIAGNOSTIC" },
      {
        kind: "para",
        text: `Pacient: ${blank(d.patientName)}, CNP ${blank(d.cnp)}, vârsta ${blank(d.age, "…")} ani. Internare: ${blank(d.admitted, "……")} – ${blank(d.discharged, "……")}, nr. FO ${blank(d.fo)}.`,
      },
      { kind: "heading", text: "DIAGNOSTICE" },
      {
        kind: "table",
        header: ["Nr.", "Diagnostic", "Cod ICD-10"],
        rows: d.diagnoses
          .filter((x) => x.text.trim())
          .map((x, i) => [String(i + 1), x.text.trim(), x.icd.trim() || "—"]),
      },
      ...section("EPICRIZĂ (PE SCURT)", d.history),
      signature(d, "Medic curant"),
    );
  } else {
    blocks.push(
      { kind: "title", text: "SCRISOARE DE TRIMITERE" },
      {
        kind: "para",
        text: `Către: specialitatea ${blank(d.referralTo)}${d.referralUnit.trim() ? `, ${d.referralUnit.trim()}` : ""}`,
      },
      {
        kind: "para",
        text: `Vă trimitem ${d.sex === "F" ? "pacienta" : d.sex === "M" ? "pacientul" : "pacientul/pacienta"} ${blank(d.patientName)}, în vârstă de ${blank(d.age, "…")} ani, CNP ${blank(d.cnp)}, ${d.sex === "F" ? "domiciliată" : d.sex === "M" ? "domiciliat" : "domiciliat(ă)"} în ${blank(d.address)}, pentru evaluare de specialitate.`,
      },
      { kind: "heading", text: "MOTIVUL TRIMITERII" },
      ...(d.referralReason.trim() ? paragraphs(d.referralReason) : [{ kind: "para" as const, text: "……………" }]),
      { kind: "heading", text: "DIAGNOSTIC DE TRIMITERE" },
      diagnosisList(d),
      ...section("ISTORIC RELEVANT", d.history),
      ...section("INVESTIGAȚII EFECTUATE", d.investigations),
      ...section("TRATAMENT ACTUAL", d.homeTreatment || d.hospitalTreatment),
      signature(d, "Medic trimițător"),
    );
  }
  return blocks;
}

export function emptyDraft(): DraftData {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    docType: "discharge",
    unit: "",
    ward: "",
    patientName: "",
    sex: "",
    cnp: "",
    age: "",
    address: "",
    admitted: "",
    discharged: "",
    fo: "",
    diagnoses: [],
    history: "",
    exam: "",
    investigations: "",
    hospitalTreatment: "",
    homeTreatment: "",
    recommendations: "",
    referralTo: "",
    referralUnit: "",
    referralReason: "",
    doctor: "",
    doctorTitle: "",
    date: `${pad(today.getDate())}.${pad(today.getMonth() + 1)}.${today.getFullYear()}`,
    checks: { prescription: "", leave: "", homeCare: "", devices: "" },
  };
}

// CNP first digit encodes sex (odd = male, even = female).
export function sexFromCnp(cnp: string): "F" | "M" | "" {
  const d = Number(cnp[0]);
  if (!/^\d{13}$/.test(cnp) || !d) return "";
  return d % 2 === 0 ? "F" : "M";
}
