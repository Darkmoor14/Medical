// The Stats tab: clinical calculators, a reading-list summary, analysis of
// your own table, and meta-analysis. Everything runs in the browser.

import { h } from "./dom";
import { calculators } from "./stats-calc";
import { ownData } from "./stats-data";
import { metaSection } from "./stats-meta";
import { readingListOverview } from "./stats-overview";

const SECTIONS = [
  { id: "calc", label: "Calculators" },
  { id: "list", label: "My reading list" },
  { id: "data", label: "My data" },
  { id: "meta", label: "Meta-analysis" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];
const KEY = "opm-stats-section";

export function statsTab(): HTMLElement {
  const overview = readingListOverview();
  const meta = metaSection();
  const bodies: Record<SectionId, HTMLElement> = {
    calc: calculators(),
    list: overview,
    data: ownData(),
    meta,
  };
  const buttons = new Map<SectionId, HTMLButtonElement>();
  const body = h("div", { className: "stats-body" }, ...Object.values(bodies));

  function show(id: SectionId) {
    for (const [k, el] of Object.entries(bodies)) el.hidden = k !== id;
    for (const [k, b] of buttons) b.setAttribute("aria-pressed", String(k === id));
    if (id === "list") overview.refresh();
    if (id === "meta") meta.refresh();
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // Remembering the section is a convenience only.
    }
  }

  const nav = h(
    "div",
    { className: "segmented", role: "group", "aria-label": "Statistics tools" },
    ...SECTIONS.map(({ id, label }) => {
      const b = h("button", { type: "button", "aria-pressed": "false", onclick: () => show(id) }, label);
      buttons.set(id, b);
      return b;
    }),
  );

  let initial: SectionId = "calc";
  try {
    const saved = localStorage.getItem(KEY) as SectionId | null;
    if (saved && saved in bodies) initial = saved;
  } catch {
    // Use the default.
  }
  show(initial);
  return h("div", { className: "tab-body stats-tab" }, nav, body);
}
