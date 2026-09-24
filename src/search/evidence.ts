// Strength-of-evidence classification from PubMed publication types, used
// for badges, sorting and the evidence-mix filter. Lower rank = stronger.

import type { Article } from "../pubmed";

export interface EvidenceLevel {
  rank: number;
  key: string;
  label: string;
}

export const LEVELS: EvidenceLevel[] = [
  { rank: 1, key: "synthesis", label: "Meta-analysis / systematic review" },
  { rank: 2, key: "guideline", label: "Guideline" },
  { rank: 3, key: "rct", label: "Randomized trial" },
  { rank: 4, key: "trial", label: "Clinical trial" },
  { rank: 5, key: "observational", label: "Observational study" },
  { rank: 6, key: "review", label: "Review" },
  { rank: 7, key: "case", label: "Case report" },
  { rank: 8, key: "opinion", label: "Editorial / letter" },
  { rank: 9, key: "other", label: "Other article" },
];

const RULES: [RegExp, string][] = [
  [/^(meta-analysis|systematic review|network meta-analysis)$/i, "synthesis"],
  [/^(practice guideline|guideline|consensus development conference(, nih)?)$/i, "guideline"],
  [/^(randomized controlled trial|equivalence trial|pragmatic clinical trial|clinical trial, phase iii|clinical trial, phase iv)$/i, "rct"],
  [/^(clinical trial|controlled clinical trial|clinical trial, phase i|clinical trial, phase ii|clinical trial protocol|adaptive clinical trial)$/i, "trial"],
  [/^(observational study|comparative study|multicenter study|validation study|evaluation study|twin study|cohort studies)$/i, "observational"],
  [/^(review|scoping review|systematic review protocol)$/i, "review"],
  [/^(case reports)$/i, "case"],
  [/^(editorial|comment|letter|news|interview|personal narrative)$/i, "opinion"],
];

export function evidenceLevel(pubTypes: string[]): EvidenceLevel {
  let best = LEVELS[LEVELS.length - 1];
  for (const t of pubTypes) {
    for (const [re, key] of RULES) {
      if (re.test(t.trim())) {
        const level = LEVELS.find((l) => l.key === key)!;
        if (level.rank < best.rank) best = level;
      }
    }
  }
  return best;
}

export function isPreprint(a: Article): boolean {
  return a.pubTypes.some((t) => /^preprint$/i.test(t));
}

export type ResultOrder = "pubmed" | "evidence" | "citations" | "newest";

// Stable re-ordering of the fetched papers (PubMed's order breaks ties).
export function orderArticles(
  articles: Article[],
  order: ResultOrder,
  citations: Map<string, { citations: number }> = new Map(),
): Article[] {
  const indexed = articles.map((a, i) => ({ a, i }));
  const key = (x: { a: Article; i: number }): number => {
    switch (order) {
      case "evidence":
        return evidenceLevel(x.a.pubTypes).rank;
      case "citations":
        return -(citations.get(x.a.pmid)?.citations ?? -1);
      case "newest":
        return -Number(x.a.year || 0);
      default:
        return 0;
    }
  };
  return indexed.sort((x, y) => key(x) - key(y) || x.i - y.i).map((x) => x.a);
}

// How many papers fall into each evidence level (only non-empty levels).
export function evidenceMix(articles: Article[]): { level: EvidenceLevel; count: number }[] {
  const counts = new Map<string, number>();
  for (const a of articles) {
    const l = evidenceLevel(a.pubTypes);
    counts.set(l.key, (counts.get(l.key) ?? 0) + 1);
  }
  return LEVELS.filter((l) => counts.has(l.key)).map((level) => ({ level, count: counts.get(level.key)! }));
}
