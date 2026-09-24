import "./styles.css";
import { $, replace } from "./ui/dom";
import { Engine } from "./engine";
import { engineSettings, loadSettings, type Settings } from "./settings";
import { searchPage } from "./ui/search-page";
import { settingsDialog } from "./ui/settings-dialog";

let settings = loadSettings();
const getSettings = () => settings;
// End-to-end tests inject a fake engine so they can run without model downloads.
const engine: Engine =
  (window as unknown as { __openmedTestEngine?: Engine }).__openmedTestEngine ?? new Engine();
void engine.configure(engineSettings(settings));

const dialog = settingsDialog(engine, getSettings, (s: Settings) => (settings = s));
document.body.appendChild(dialog);
$("#settings-btn").addEventListener("click", () => dialog.showModal());

replace($("#panel"), searchPage(engine, getSettings));
