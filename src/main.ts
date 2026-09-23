import "./styles.css";
import { $, h, replace } from "./ui/dom";
import { Engine } from "./engine";
import { engineSettings, loadSettings, type Settings } from "./settings";
import { noteTab } from "./ui/note-tab";
import { minerTab } from "./ui/miner-tab";
import { settingsDialog } from "./ui/settings-dialog";

let settings = loadSettings();
const getSettings = () => settings;
// End-to-end tests inject a fake engine so they can run without model downloads.
const engine: Engine =
  (window as unknown as { __openmedTestEngine?: Engine }).__openmedTestEngine ?? new Engine();
void engine.configure(engineSettings(settings));

const tabs = [
  { id: "note", label: "Note → Evidence", body: noteTab(engine, getSettings) },
  { id: "miner", label: "Literature miner", body: minerTab(engine, getSettings) },
];

const dialog = settingsDialog(engine, getSettings, (s: Settings) => (settings = s));
document.body.appendChild(dialog);
$("#settings-btn").addEventListener("click", () => dialog.showModal());

const tabList = $("#tabs");
const panel = $("#panel");

function select(id: string) {
  const tab = tabs.find((t) => t.id === id) ?? tabs[0];
  for (const btn of tabList.querySelectorAll("button")) {
    const on = btn.dataset.tab === tab.id;
    btn.setAttribute("aria-selected", String(on));
    btn.tabIndex = on ? 0 : -1;
  }
  replace(panel, tab.body);
  panel.setAttribute("aria-labelledby", `tab-${tab.id}`);
  try {
    localStorage.setItem("openmed-pubmed-tab", tab.id);
  } catch {
    // ignore
  }
}

replace(
  tabList,
  ...tabs.map((t) =>
    h(
      "button",
      { role: "tab", id: `tab-${t.id}`, "data-tab": t.id, type: "button", onclick: () => select(t.id) },
      t.label,
    ),
  ),
);

let initial = "note";
try {
  initial = localStorage.getItem("openmed-pubmed-tab") ?? "note";
} catch {
  // ignore
}
select(initial);
