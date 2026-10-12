// A summary of the reading list: what has been saved, how strong it is and
// where it was published. Pure functions over saved articles and the matrix.

import { articleKey, type Article } from "../pubmed";
import { authorsOf } from "../search/citations";
import { evidenceLevel, LEVELS } from "../search/evidence";
import { journalCounts, yearCounts, type Count } from "../search/trends";
import { DESIGN_COLUMN, suggestDesign, type MatrixData } from "../write/matrix";

export interface Overview {
  total: number;
  years: Count[];
  evidence: Count[];
  designs: Count[];
  journals: Count[];
  authors: Count[];
  decisions: Count[];
  withAbstract: number;
  retracted: number;
  withNotes: number;
  medianYear: number | null;
}

const tally = (labels: string[], limit = 10): Count[] => {
  const m = new Map<string, number>();
  for (const l of labels) if (l) m.set(l, (m.get(l) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([label, count]) => ({ label, count }));
};

export function overview(papers: Article[], matrix: MatrixData, notes: Record<string, string> = {}): Overview {
  const evidence = LEVELS.map((l) => ({ label: l.label, count: papers.filter((p) => evidenceLevel(p.pubTypes).key === l.key).length })).filter((c) => c.count);
  const designs = tally(
    papers.map((p) => matrix.cells[articleKey(p)]?.[DESIGN_COLUMN]?.trim() || suggestDesign(p) || "Not stated"),
  );
  const decisions = (["include", "exclude", "unsure", ""] as const)
    .map((d) => ({ label: d ? d[0].toUpperCase() + d.slice(1) : "Undecided", count: papers.filter((p) => (matrix.decisions[articleKey(p)] ?? "") === d).length }))
    .filter((c) => c.count);
  const years = papers.map((p) => Number(p.year)).filter((y) => y > 1800).sort((a, b) => a - b);
  return {
    total: papers.length,
    years: yearCounts(papers),
    evidence,
    designs,
    journals: journalCounts(papers, 8),
    authors: tally(papers.flatMap((p) => authorsOf(p).slice(0, 1)).map((a) => a.collective || a.last), 8),
    decisions,
    withAbstract: papers.filter((p) => p.abstract.trim()).length,
    retracted: papers.filter((p) => p.retracted).length,
    withNotes: papers.filter((p) => notes[articleKey(p)]?.trim()).length,
    medianYear: years.length ? years[Math.floor(years.length / 2)] : null,
  };
}
