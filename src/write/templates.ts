// Starting points for a new document. Each section has a short italic prompt
// to overwrite or delete.

import type { DocNode } from "./cite";

const text = (t: string, italic = false): DocNode => ({ type: "text", text: t, marks: italic ? [{ type: "italic" }] : undefined });
const heading = (level: number, t: string): DocNode => ({ type: "heading", attrs: { level }, content: [text(t)] });
const hint = (t: string): DocNode => ({ type: "paragraph", content: [text(t, true)] });
const empty = (): DocNode => ({ type: "paragraph" });

const doc = (...content: DocNode[]): DocNode => ({ type: "doc", content });

export interface Template {
  id: string;
  label: string;
  title: string;
  description: string;
  build: () => DocNode;
}

export const TEMPLATES: Template[] = [
  {
    id: "blank",
    label: "Blank document",
    title: "Untitled document",
    description: "Start from an empty page.",
    build: () => doc(empty()),
  },
  {
    id: "article",
    label: "Original article (IMRaD)",
    title: "Untitled article",
    description: "Abstract, Introduction, Methods, Results, Discussion, Conclusion.",
    build: () =>
      doc(
        heading(2, "Abstract"),
        hint("Background, methods, results and conclusion in about 250 words."),
        heading(2, "Introduction"),
        hint("What is known, what is missing, and the aim of this study."),
        heading(2, "Methods"),
        hint("Design, setting, participants, measures, analysis, ethics approval."),
        heading(2, "Results"),
        hint("Report the findings in the order of the methods."),
        heading(2, "Discussion"),
        hint("Main findings, comparison with other studies, limitations, implications."),
        heading(2, "Conclusion"),
        hint("One or two sentences that answer the aim."),
      ),
  },
  {
    id: "case",
    label: "Case report (CARE)",
    title: "Untitled case report",
    description: "Follows the CARE reporting checklist. Remember consent and de-identification.",
    build: () =>
      doc(
        heading(2, "Abstract"),
        hint("Introduction, case presentation, outcome and conclusion in about 150 words."),
        heading(2, "Introduction"),
        hint("Why this case is worth reporting, with the relevant literature."),
        heading(2, "Patient information"),
        hint("Age, sex, presenting complaint, relevant history. Remove names, dates of birth and any detail that could identify the patient."),
        heading(2, "Clinical findings"),
        hint("Examination findings at presentation."),
        heading(2, "Timeline"),
        hint("Key events from onset to follow-up."),
        heading(2, "Diagnostic assessment"),
        hint("Tests, results and the reasoning behind the diagnosis."),
        heading(2, "Therapeutic intervention"),
        hint("Treatment given, and any changes."),
        heading(2, "Follow-up and outcomes"),
        hint("Clinician- and patient-assessed outcomes, adverse events."),
        heading(2, "Discussion"),
        hint("Strengths and limitations, and what is known from similar cases."),
        heading(2, "Patient perspective"),
        hint("Optional: the patient's own account."),
        heading(2, "Informed consent"),
        hint("State that the patient gave written consent for publication."),
      ),
  },
  {
    id: "review",
    label: "Literature review",
    title: "Untitled review",
    description: "Question, search strategy, findings by theme, gaps, conclusion.",
    build: () =>
      doc(
        heading(2, "Background"),
        hint("The clinical question and why it matters."),
        heading(2, "Search strategy"),
        hint("Databases, search terms, date range, and inclusion and exclusion criteria. Your Matrix tab holds the decisions."),
        heading(2, "Findings"),
        heading(3, "Theme 1"),
        hint("Summarise what the studies found. Cite each one."),
        heading(3, "Theme 2"),
        empty(),
        heading(2, "Quality of the evidence"),
        hint("Study designs, risk of bias, consistency of results."),
        heading(2, "Gaps and future research"),
        empty(),
        heading(2, "Conclusion"),
        empty(),
      ),
  },
];

export function template(id: string): Template {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}
