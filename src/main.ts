import "./styles.css";
import { $, h } from "./ui/dom";
import { Engine } from "./engine";
import { engineSettings, loadSettings, type Settings } from "./settings";
import { searchPage } from "./ui/search-page";
import { matrixTab } from "./ui/matrix-tab";
import { referenceFinder } from "./ui/finder";
import { settingsDialog } from "./ui/settings-dialog";
import { readingListDialog } from "./ui/reading-list";
import { onReadingListChange, readingList } from "./search/store";

let settings = loadSettings();
const getSettings = () => settings;
const apiKey = () => settings.apiKey || null;
// End-to-end tests inject a fake engine so they can run without model downloads.
const engine: Engine =
  (window as unknown as { __openmedTestEngine?: Engine }).__openmedTestEngine ?? new Engine();
void engine.configure(engineSettings(settings));

const dialog = settingsDialog(engine, getSettings, (s: Settings) => (settings = s));
document.body.appendChild(dialog);
$("#settings-btn").addEventListener("click", () => dialog.showModal());

const reading = readingListDialog();
document.body.appendChild(reading);
const readingBtn = $("#reading-btn");
const updateReadingCount = () => {
  const n = readingList().length;
  readingBtn.textContent = n ? `★ Reading list (${n})` : "☆ Reading list";
};
updateReadingCount();
onReadingListChange(updateReadingCount);
readingBtn.addEventListener("click", () => reading.showModal());

const finder = referenceFinder();
document.body.appendChild(finder.element);

// --- Tabs --------------------------------------------------------------------
type TabId = "search" | "matrix" | "write";
const TAB_KEY = "opm-tab";

const panels: Record<TabId, HTMLElement> = {
  search: h("div", { role: "tabpanel", id: "panel-search", "aria-labelledby": "tab-search" }, searchPage(engine, getSettings)),
  matrix: h("div", { role: "tabpanel", id: "panel-matrix", "aria-labelledby": "tab-matrix", hidden: true }, matrixTab({ finder, apiKey })),
  // The editor is a separate chunk, loaded the first time the tab is opened.
  write: h("div", { role: "tabpanel", id: "panel-write", "aria-labelledby": "tab-write", hidden: true }),
};
$("#panel").append(...Object.values(panels));

const LABELS: Record<TabId, string> = { search: "Search", matrix: "Matrix", write: "Write" };
const tabList = $("#tabs");
const tabButtons = new Map<TabId, HTMLButtonElement>();
let writeLoaded = false;
let current: TabId = "search";
// The search lives in the address bar (so it can be shared). Set it aside while
// another tab is open, so a reload there stays on that tab, and restore it on return.
let searchHash = "";

async function show(id: TabId) {
  if (current === "search" && id !== "search") {
    searchHash = location.hash;
    if (searchHash) history.replaceState(null, "", location.pathname + location.search);
  } else if (current !== "search" && id === "search" && searchHash && !location.hash) {
    history.replaceState(null, "", searchHash);
  }
  current = id;
  for (const [tab, panel] of Object.entries(panels) as [TabId, HTMLElement][]) panel.hidden = tab !== id;
  for (const [tab, btn] of tabButtons) {
    btn.setAttribute("aria-selected", String(tab === id));
    btn.tabIndex = tab === id ? 0 : -1;
  }
  try {
    localStorage.setItem(TAB_KEY, id);
  } catch {
    // Remembering the tab is a convenience only.
  }
  if (id === "write" && !writeLoaded) {
    writeLoaded = true;
    panels.write.append(h("p", { className: "muted status", role: "status" }, "Loading the editor…"));
    try {
      const { writeTab } = await import("./ui/write-tab");
      panels.write.replaceChildren(writeTab({ finder, apiKey }));
    } catch (err) {
      writeLoaded = false;
      panels.write.replaceChildren(h("p", { className: "status error" }, `The editor could not be loaded: ${err instanceof Error ? err.message : String(err)}`));
    }
  }
}

for (const id of Object.keys(LABELS) as TabId[]) {
  const btn = h(
    "button",
    {
      role: "tab",
      id: `tab-${id}`,
      type: "button",
      "aria-controls": `panel-${id}`,
      onclick: () => void show(id),
      onkeydown: (ev: Event) => {
        const e = ev as KeyboardEvent;
        const ids = Object.keys(LABELS) as TabId[];
        const i = ids.indexOf(id);
        const next = e.key === "ArrowRight" ? ids[(i + 1) % ids.length] : e.key === "ArrowLeft" ? ids[(i + ids.length - 1) % ids.length] : null;
        if (next) {
          e.preventDefault();
          tabButtons.get(next)!.focus();
          void show(next);
        }
      },
    },
    LABELS[id],
  );
  tabButtons.set(id, btn);
  tabList.append(btn);
}

// A shared search link always opens the Search tab.
let initial: TabId = "search";
try {
  const saved = localStorage.getItem(TAB_KEY) as TabId | null;
  if (saved && saved in LABELS) initial = saved;
} catch {
  // Use the default.
}
if (/[#&]q=/.test(location.hash)) initial = "search";
void show(initial);
