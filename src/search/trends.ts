// Aggregates for the trends card: papers per year, top journals and terms
// that are mentioned together.

import type { TermStat } from "../entities";
import type { Article } from "../pubmed";

export interface Count {
  label: string;
  count: number;
}

// Papers per publication year, with empty years filled in.
export function yearCounts(articles: Article[]): Count[] {
  const counts = new Map<number, number>();
  for (const a of articles) {
    const y = Number(a.year);
    if (y > 1800) counts.set(y, (counts.get(y) ?? 0) + 1);
  }
  if (!counts.size) return [];
  const years = [...counts.keys()];
  const out: Count[] = [];
  for (let y = Math.min(...years); y <= Math.max(...years); y++) out.push({ label: String(y), count: counts.get(y) ?? 0 });
  return out;
}

export function journalCounts(articles: Article[], limit = 10): Count[] {
  const counts = new Map<string, number>();
  for (const a of articles) if (a.journal) counts.set(a.journal, (counts.get(a.journal) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

// Terms appearing in the same papers as `target`, by number of shared papers.
export function cooccurring(stats: TermStat[], target: TermStat, limit = 8): { stat: TermStat; shared: number }[] {
  return stats
    .filter((s) => s.key !== target.key)
    .map((stat) => ({ stat, shared: [...stat.docs].filter((d) => target.docs.has(d)).length }))
    .filter((x) => x.shared > 0)
    .sort((a, b) => b.shared - a.shared || b.stat.docs.size - a.stat.docs.size)
    .slice(0, limit);
}
