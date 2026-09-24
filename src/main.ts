import "./styles.css";
import { $, replace } from "./ui/dom";
import { Engine } from "./engine";
import { engineSettings, loadSettings, type Settings } from "./settings";
import { searchPage } from "./ui/search-page";
import { settingsDialog } from "./ui/settings-dialog";
import { readingListDialog } from "./ui/reading-list";
import { onReadingListChange, readingList } from "./search/store";

let settings = loadSettings();
const getSettings = () => settings;
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

replace($("#panel"), searchPage(engine, getSettings));
