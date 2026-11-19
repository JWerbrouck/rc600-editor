import "./styles.css";
import { Changes, MEMORY_COUNT, SYSTEM, stageRestore, loadMemories, loadSystem, readName, recordedMeasures, recordedTracks, type Memory, type Store } from "./core/library";
import { formatMemoryList, parseMemoryList } from "./core/ranges";
import {
  BEATS,
  COPY_GROUPS,
  MEASURE_MAX_MEASURES,
  NAME_LENGTH,
  PLAY_FIELDS,
  REC_FIELDS,
  RHYTHM_FIELDS,
  TEMPO_MAX,
  TEMPO_MIN,
  TRACKS,
  TRACK_FIELDS,
  decodeBitmask,
  displayValue,
  encodeBitmask,
  formatMeasure,
  formatPan,
  INFO,
  isEditable,
  type CopyGroup,
  type Field,
} from "./core/schema";
import { DirectoryStore, SandboxStore, findDataFolder } from "./stores";
import {
  CATEGORY_VALUES,
  FOOT_CATEGORIES,
  PEDAL_MODES,
  TRACK_SLOTS,
  ctlPath,
  footFunction,
  footHelp,
  footPlace,
  footRange,
  pedalPath,
  trackFunctionValue,
  type FootCategory,
  type TrackChoice,
} from "./core/footswitch";
import { NEVER_EDIT, SYSTEM_SECTIONS } from "./core/system";
import { ASSIGNS, ASSIGN_FIELDS, SOURCES, TARGETS, assignPath, describeAssign, targetRange, type Option } from "./core/assign";
import { BANKS, BANK_FIELDS, FX_ROOTS, describeFx, slotFields, slotId, typeByNumber, typeFields, typesFor, type FxRoot } from "./core/effects";
import { mountLive } from "./live";
import { mountArranger } from "./arranger";
import { regainAccess, rememberFolder, rememberedFolder } from "./score/folder";

/** Menu items in order; swiping left/right on a touch screen moves through them. */
const VIEWS = [
  ["memory", "Tracks"],
  ["rpr", "Rec · Play · Rhythm"],
  ["fx", "Effects"],
  ["assign", "Assign"],
  ["pedals", "Footswitches"],
  ["system", "System"],
  ["live", "Live MIDI"],
] as const;
type View = (typeof VIEWS)[number][0] | "arranger";

interface State {
  store: Store | null;
  memories: Memory[];
  system: Memory | null;
  changes: Changes | null;
  selected: number;
  view: View;
  pedalSource: "system" | "memory";
  pedalMode: number;
  /** Switch being assigned: "p1"–"p9" (onboard, current mode) or "c1"–"c4" (CTL jacks). */
  pedalSlot: string | null;
  /** Picker browsing state; null = follow the switch's current function. */
  pickerCategory: FootCategory | null;
  pickerTrack: TrackChoice | null;
  /** Effects view: input or track FX, and the bank and slot (0–3) shown. */
  fxRoot: FxRoot;
  fxBank: number;
  fxSlot: number;
  /** Assign view: the ASSIGN (1–16) shown in the side panel. */
  assign: number;
  /** System section shown in the side panel. */
  sysSection: string;
  /** Show every track setting, not only the frequent ones (remembered in this browser). */
  allTrackSettings: boolean;
  /** Setting shown in the info pane; pinned by a click, otherwise follows hover and focus. */
  info: { key: string; label: string; pinned: boolean } | null;
  backupFolder: string | null;
  message: { text: string; tone: "info" | "error" } | null;
}

const state: State = {
  store: null,
  memories: [],
  system: null,
  changes: null,
  selected: 1,
  view: "memory",
  pedalSource: "system",
  pedalMode: 1,
  pedalSlot: null,
  pickerCategory: null,
  pickerTrack: null,
  sysSection: "MIDI",
  fxRoot: "ifx",
  fxBank: 0,
  fxSlot: 0,
  assign: 1,
  allTrackSettings: readPref("allTrackSettings") === "1",
  info: null,
  backupFolder: null,
  message: null,
};
const app = document.querySelector<HTMLDivElement>("#app")!;

/** Small per-browser preferences (theme, expanded settings); storage may be blocked. */
function readPref(key: string): string | null {
  try {
    return localStorage.getItem(`rc600-editor.${key}`);
  } catch {
    return null;
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(`rc600-editor.${key}`, value);
  } catch {
    // not remembered; fine
  }
}

// Theme: follows the system unless chosen with the button in the top bar
type Theme = "auto" | "light" | "dark";
let theme: Theme = (readPref("theme") as Theme) ?? "auto";
const applyTheme = () => {
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
};
applyTheme();

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pad = (n: number) => String(n).padStart(2, "0");

// ---------------------------------------------------------------- opening

async function openPedal() {
  if (!("showDirectoryPicker" in window)) {
    return say("This browser can't open folders directly. Use Chrome or Edge.", "error");
  }
  let picked: FileSystemDirectoryHandle;
  try {
    picked = await window.showDirectoryPicker({ id: "rc600", mode: "readwrite" });
  } catch {
    return; // picker cancelled
  }
  const data = await findDataFolder(picked);
  if (!data) {
    return say(`No RC-600 memories found in "${picked.name}". Pick the pedal's drive, its ROLAND folder, or ROLAND/DATA.`, "error");
  }
  await rememberFolder(picked, "pedal");
  pedalFolder = picked;
  await load(new DirectoryStore(data));
}

/** The pedal folder picked last time, remembered by the browser (IndexedDB); undefined until looked up. */
let pedalFolder: FileSystemDirectoryHandle | null | undefined;
void rememberedFolder("pedal").then(async (d) => {
  pedalFolder = d;
  if (d && !state.store && (await autoOpen(d))) return;
  if (!state.store) render();
});

/**
 * Open the remembered pedal folder without a click, when the browser still allows it
 * ("Allow on every visit") and the pedal is connected. Otherwise the welcome screen offers
 * a one-click reopen. Returns whether it opened.
 */
async function autoOpen(dir: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const h = dir as FileSystemDirectoryHandle & { queryPermission(o: { mode: string }): Promise<PermissionState> };
    if ((await h.queryPermission({ mode: "readwrite" })) !== "granted") return false;
    const data = await findDataFolder(dir); // throws or finds nothing when the pedal isn't connected
    if (!data) return false;
    await load(new DirectoryStore(data));
    return true;
  } catch {
    return false;
  }
}

/** Open the remembered pedal folder; the browser asks once per visit to allow access again. */
async function reopenPedal() {
  if (!pedalFolder) return;
  try {
    if (!(await regainAccess(pedalFolder))) return say(`No access to "${pedalFolder.name}". Use Open RC-600 to pick it again.`, "error");
    const data = await findDataFolder(pedalFolder);
    if (!data) return say(`"${pedalFolder.name}" has no RC-600 memories. Is the pedal connected in USB storage mode?`, "error");
    await load(new DirectoryStore(data));
  } catch {
    say(`"${pedalFolder.name}" can't be opened. Is the pedal connected in USB storage mode? Otherwise use Open RC-600.`, "error");
  }
}

async function load(store: Store) {
  const target = app.querySelector(".editor") ?? app;
  target.innerHTML = `<section class="welcome"><p class="loading">Reading 99 memories from ${esc(store.label)}…</p></section>`;
  try {
    state.memories = await loadMemories(store);
    state.system = await loadSystem(store);
  } catch (e) {
    state.store = null;
    render();
    return say(`Couldn't read the memories: ${(e as Error).message}`, "error");
  }
  state.store = store;
  state.changes = new Changes(state.memories, state.system);
  state.backupFolder = null;
  state.message = null;
  render();
}

// ---------------------------------------------------------------- rendering

function render() {
  const filesOpen = Boolean(state.store && state.changes);
  // Pedal views need the pedal's files; Live MIDI and the arranger work without them
  const own = state.view === "live" || state.view === "arranger";
  const needsFiles = !own && !filesOpen;
  const editorScroll = slide ? 0 : (app.querySelector(".editor")?.scrollTop ?? 0);
  const slideClass = slide ? `slide-${slide}` : "";
  slide = null;
  const focused = document.activeElement?.id;
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <h1>RC-600 Editor</h1>
        <div class="picker" ${!filesOpen || state.view === "system" || own || (state.view === "pedals" && state.pedalSource === "system") ? "hidden" : ""}>
          <button class="step" data-action="prev" aria-label="Previous memory" ${state.selected === 1 ? "disabled" : ""}>‹</button>
          <label>
            <span class="sr">Memory</span>
            <select id="memory">${filesOpen ? state.memories.map(memoryOption).join("") : ""}</select>
          </label>
          <button class="step" data-action="next" aria-label="Next memory" ${state.selected === MEMORY_COUNT ? "disabled" : ""}>›</button>
        </div>
        <nav class="views" aria-label="View">
          ${VIEWS.map(([id, label]) => `<button data-action="view" data-view="${id}" aria-pressed="${state.view === id}">${label}</button>`).join("")}
        </nav>
        ${isInstallable() ? `<button class="quiet themebtn" data-action="install" title="Install as an app with its own window and icon">Install app</button>` : ""}
        <button class="quiet themebtn" data-action="theme" title="Color scheme: ${theme === "auto" ? "follows the system" : theme}">${theme === "auto" ? "◐ Auto" : theme === "dark" ? "● Dark" : "○ Light"}</button>
        <p class="source" title="Pedal files are read from and written to this folder">${filesOpen ? esc(state.store!.label) : own ? "" : "Pedal not connected"}</p>
      </header>
      <div class="workspace ${own || needsFiles || !INFO_VIEWS.includes(state.view) ? "noinfo" : ""}">
        <main class="editor ${slideClass}">${
          own
            ? ""
            : needsFiles
              ? welcome()
              : state.view === "memory"
                ? editor(state.selected, "tracks")
                : state.view === "rpr"
                  ? editor(state.selected, "rpr")
                  : state.view === "fx"
                    ? effects(state.selected)
                    : state.view === "assign"
                    ? assigns(state.selected)
                    : state.view === "pedals"
                      ? pedals()
                      : system()
        }</main>
        ${own || needsFiles || !INFO_VIEWS.includes(state.view) ? "" : `<aside class="infopane" aria-live="polite">${infoPane()}</aside>`}
      </div>
      ${filesOpen ? `<footer class="bar">${footer()}</footer>` : ""}
    </div>`;
  if (state.view === "live") mountLive(app.querySelector<HTMLElement>(".editor")!);
  if (state.view === "arranger") mountArranger(app.querySelector<HTMLElement>(".editor")!);
  app.querySelector(".editor")!.scrollTop = editorScroll;
  if (focused) document.getElementById(focused)?.focus();
}

/** Views with the info pane next to them. */
const INFO_VIEWS: View[] = ["memory", "rpr", "fx", "assign", "pedals", "system"];

/** Direction of the next view change, for the slide-in animation. */
let slide: "left" | "right" | null = null;

function goToView(view: View) {
  if (view === state.view) return;
  const order = VIEWS.map(([id]) => id as View);
  slide = order.indexOf(view) > order.indexOf(state.view) ? "left" : "right";
  state.view = view;
  state.info = null; // explanations belong to the view they came from
  render();
}

function welcome() {
  const sandbox = import.meta.env.DEV ? `<button class="quiet" data-action="sandbox">Use the sandbox copy</button>` : "";
  return `
    <section class="welcome">
      <h2>Connect the RC-600</h2>
      <p>To edit memory, footswitch and system settings, open the pedal's files. Live MIDI works without this.</p>
      <ol class="steps">
        <li>On the RC-600, open the menu and switch USB to <strong>storage</strong> mode.</li>
        <li>Connect it to this computer with a USB cable.</li>
        <li>Open the pedal's drive. Picking the drive itself, its ROLAND folder, or ROLAND/DATA all work.</li>
      </ol>
      <div class="actions">
        ${pedalFolder ? `<button class="primary" data-action="reopen">Open “${esc(pedalFolder.name)}”</button>` : ""}
        <button class="${pedalFolder ? "" : "primary"}" data-action="open">${pedalFolder ? "Pick another folder…" : "Open RC-600"}</button>
        ${sandbox}
      </div>
      ${message()}
      <p class="fineprint">Works in Chrome and Edge. Nothing is written until you press Write, and the first write in a session makes a full backup first.</p>
    </section>`;
}

function memoryOption(m: Memory) {
  const c = state.changes!;
  const rec = recordedTracks(m.current).length;
  const changed = c.changesFor(m.number).length > 0;
  const extra = [rec ? `${rec} ${rec === 1 ? "track" : "tracks"} recorded` : "", changed ? "changed" : ""].filter(Boolean).join(", ");
  return `<option value="${m.number}" ${m.number === state.selected ? "selected" : ""}>${pad(m.number)}  ${esc(c.name(m.number))}${extra ? ` (${extra})` : ""}</option>`;
}

/** Explanations from views other than the memory editor (system, effects, assign), by info key. */
const extraInfo = new Map<string, string>();

/**
 * Info button: hovering or focusing shows the explanation in the info pane, clicking keeps it
 * there. `text` gives the explanation for keys that aren't in INFO (memory settings).
 */
function info(key: string, label: string, text?: string) {
  if (text) extraInfo.set(key, text);
  if (!INFO[key] && !extraInfo.has(key)) return "";
  const active = state.info?.key === key ? "active" : "";
  return ` <button class="info ${active}" data-info="${key}" data-info-label="${esc(label)}" aria-label="About ${esc(label)}">i</button>`;
}

function infoPane() {
  if (!state.info) {
    return state.view === "pedals"
      ? `<p class="placeholder">Point at a switch or a function to see what it does on push, hold and double-click.</p>`
      : `<p class="placeholder">Point at an <span class="info static" aria-hidden="true">i</span> to see what a setting does. Click it to keep the explanation here.</p>`;
  }
  // footswitch functions: what PUSH, HOLD and double-click do
  if (state.info.key.startsWith("foot:")) return `<div class="fnhelp">${helpBox(Number(state.info.key.slice(5)))}</div>`;
  return `
    <h2>${esc(state.info.label)}</h2>
    <p>${esc(INFO[state.info.key] ?? extraInfo.get(state.info.key) ?? "")}</p>
    ${state.info.pinned ? `<button class="quiet" data-action="unpin-info">Close</button>` : ""}`;
}

function showInfo(key: string, label: string, pinned: boolean) {
  if (state.info?.pinned && !pinned) return;
  state.info = { key, label, pinned };
  app.querySelector(".infopane")!.innerHTML = infoPane();
  app.querySelectorAll(".info.active").forEach((b) => b.classList.remove("active"));
  app.querySelectorAll(`.info[data-info="${key}"]`).forEach((b) => b.classList.add("active"));
}

// ---------------------------------------------------------------- system

/**
 * System settings (SYSTEM1/2) as tiles; the chosen section's settings show in the panel
 * beside them. Only mapped settings are shown (see core/system.ts).
 */
function system() {
  const c = state.changes!;
  const shown = (f: Field, id: string) => isEditable(f) || NEVER_EDIT.has(`sys/${id}.${f.key}`);
  const sections = SYSTEM_SECTIONS.filter((s) => s.fields.some((f) => shown(f, s.id)));
  const current = sections.find((s) => s.id === state.sysSection) ?? sections[0];
  const changedIn = (prefix: string) => c.changesFor(SYSTEM).some(([p]) => p.startsWith(`sys/${prefix}`));
  // The 12 EQs share one tile; the panel switches between them
  const isEq = (id: string) => id.startsWith("EQ_");
  const eqs = sections.filter((s) => isEq(s.id));
  const tile = (id: string, title: string, summary: string | undefined, active: boolean, changed: boolean) => `
    <button class="tile ${active ? "active" : ""} ${changed ? "changed" : ""}" data-action="sys-section" data-section="${id}" aria-pressed="${active}">
      <span class="tile-title">${esc(title)}</span>
      ${summary ? `<span class="tile-sub">${esc(summary)}</span>` : ""}
      ${changed ? `<span class="changedmark">changed</span>` : ""}
    </button>`;
  const tiles = [
    ...sections.filter((s) => !isEq(s.id)).map((s) => tile(s.id, s.title, s.summary, s.id === current.id, changedIn(`${s.id}.`))),
    tile(isEq(current.id) ? current.id : eqs[0].id, "EQ", "Equalizers per input and output", isEq(current.id), changedIn("EQ_")),
  ];
  const eqItem = (s: (typeof sections)[number]) =>
    `<button data-action="sys-section" data-section="${s.id}" aria-pressed="${s.id === current.id}" class="${changedIn(`${s.id}.`) ? "changed" : ""}">${esc(s.title.replace("EQ: ", ""))}</button>`;
  const eqMenu = isEq(current.id)
    ? `<nav class="menulist" aria-label="Equalizer">
        <span class="menuhead">Inputs</span>${eqs.filter((s) => !s.id.includes("OUT")).map(eqItem).join("")}
        <span class="menuhead">Outputs</span>${eqs.filter((s) => s.id.includes("OUT")).map(eqItem).join("")}
      </nav>`
    : "";
  const fields = current.fields.filter((f) => shown(f, current.id));
  return `
    <header class="pedalhead">
      <h2>System settings</h2>
      <button data-action="restore">Restore from a backup…</button>
      ${c.changesFor(SYSTEM).length ? `<button class="quiet" data-action="discard-system">Undo system changes</button>` : ""}
    </header>
    <div class="syslayout">
      <nav class="tiles" aria-label="System sections">${tiles.join("")}</nav>
      <section class="sidepanel" aria-label="${esc(current.title)}">
        <h3>${isEq(current.id) ? "EQ" : esc(current.title)}</h3>
        ${current.note ? `<p class="note">${esc(current.note)}</p>` : ""}
        <div class="${eqMenu ? "subgrid" : ""}">
        ${eqMenu}
        <dl class="settings">
          ${fields
            .map((f) => {
              const path = `sys/${current.id}.${f.key}`;
              return `
            <div class="setting">
              <dt>${esc(f.label)}${info(path, f.label, f.hint)}</dt>
              <dd>${control(SYSTEM, path, f, f.label)}</dd>
            </div>`;
            })
            .join("")}
        </dl>
        </div>
      </section>
    </div>`;
}

// ---------------------------------------------------------------- effects

/** Effects of memory n: banks and slots on the left, the chosen slot's settings in the side panel. */
function effects(n: number) {
  const c = state.changes!;
  const root = state.fxRoot;
  const bank = BANKS[state.fxBank];
  const changedUnder = (prefix: string) => c.changesFor(n).some(([p]) => p.startsWith(`${root}/${prefix}`));
  const slotTile = (x: number) => {
    const id = slotId(state.fxBank, x);
    const on = c.value(n, `${root}/${id}.A`) === 1;
    const type = typeByNumber(c.value(n, `${root}/${id}.C`));
    const active = x === state.fxSlot;
    return `
      <button class="tile fxtile ${active ? "active" : ""} ${changedUnder(id) ? "changed" : ""}" data-action="fx-slot" data-slot="${x}" aria-pressed="${active}">
        <span class="tile-sub">FX ${BANKS[x]}</span>
        <span class="tile-title">${esc(type?.name ?? "?")}</span>
        <span class="fxstate ${on ? "on" : ""}">${on ? "On" : "Off"}</span>
        ${changedUnder(id) ? `<span class="changedmark">changed</span>` : ""}
      </button>`;
  };
  const id = slotId(state.fxBank, state.fxSlot);
  const typeIndex = c.value(n, `${root}/${id}.C`);
  const type = typeByNumber(typeIndex);
  const typeField: Field = { key: "C", label: "Effect", kind: "enum", options: typesFor(root).map(([, f]) => f.name), confidence: "confirmed", hint: type ? `${type.name}: ${type.about}` : undefined };
  const setting = (path: string, f: Field) => `
    <div class="setting">
      <dt>${esc(f.label)}${info(path, f.label, f.hint)}</dt>
      <dd>${control(n, path, f, f.label)}</dd>
    </div>`;
  const params = type ? typeFields(type) : [];
  const shown = params.filter(isEditable);
  const hidden = params.length - shown.length;
  return `
    <header class="pedalhead">
      <h2>Effects</h2>
      <div class="segmented" role="group" aria-label="Input or track effects">
        ${FX_ROOTS.map(([r, label]) => `<button data-action="fx-root" data-root="${r}" aria-pressed="${r === root}">${label}</button>`).join("")}
      </div>
    </header>
    <div class="syslayout fxlayout">
      <div class="boardcol">
        <div class="segmented modes" role="group" aria-label="FX bank">
          ${BANKS.map((b, i) => `<button data-action="fx-bank" data-bank="${i}" aria-pressed="${i === state.fxBank}" class="${changedUnder(b) ? "changed" : ""}">Bank ${b}</button>`).join("")}
        </div>
        <dl class="settings banksettings">${BANK_FIELDS.map((f) => setting(`${root}/${bank}.${f.key}`, f)).join("")}</dl>
        <nav class="tiles fxtiles" aria-label="Effects in bank ${bank}">${[0, 1, 2, 3].map(slotTile).join("")}</nav>
        <p class="fineprint">
          ${root === "ifx" ? "Input FX work on what you play in, before it's recorded." : "Track FX work on the playback of the tracks."}
          Which effect a footswitch turns on is set under Footswitches (Input FX A–D, Track FX A–D).
        </p>
      </div>
      <section class="sidepanel" aria-label="FX ${BANKS[state.fxSlot]}">
        <h3>${root === "ifx" ? "Input" : "Track"} FX ${bank}-${BANKS[state.fxSlot]}</h3>
        <dl class="settings">
          ${setting(`${root}/${id}.C`, typeField)}
          ${slotFields(root).map((f) => setting(`${root}/${id}.${f.key}`, f)).join("")}
        </dl>
        ${
          type
            ? `<h4 class="panelsub">${esc(type.name)} settings</h4>
               ${shown.length ? `<dl class="settings">${shown.map((f) => setting(`${root}/${id}_${type.id}.${f.key}`, f)).join("")}</dl>` : ""}
               ${hidden ? `<p class="note">${hidden === params.length ? "This effect's" : `${hidden} more`} settings (${params.filter((f) => !isEditable(f)).map((f) => f.label.toLowerCase()).slice(0, 3).join(", ")}${hidden > 3 ? ", …" : ""}) aren't mapped yet. They stay as they are; set them on the pedal.</p>` : ""}`
            : ""
        }
      </section>
    </div>`;
}

// ---------------------------------------------------------------- assign

/** A select with option groups, for long lists like ASSIGN sources (109) and targets (936). */
function groupedSelect(id: string, options: Option[], value: number, attrs: string, changed: boolean) {
  const groups = new Map<string, string[]>();
  options.forEach((o, i) => {
    const list = groups.get(o.group) ?? [];
    list.push(`<option value="${i}" ${i === value ? "selected" : ""}>${esc(o.name)}</option>`);
    groups.set(o.group, list);
  });
  const known = value >= 0 && value < options.length;
  return `<select id="${id}" class="${changed ? "changed" : ""}" ${attrs}>${known ? "" : `<option selected>#${value}</option>`}${[...groups]
    .map(([g, opts]) => `<optgroup label="${esc(g)}">${opts.join("")}</optgroup>`)
    .join("")}</select>`;
}

/** ASSIGN 1–16 of memory n: tiles on the left, the chosen one's settings in the side panel. */
function assigns(n: number) {
  const c = state.changes!;
  const changedIn = (a: number) => c.changesFor(n).some(([p]) => p.startsWith(`mem/ASSIGN${a}.`));
  const tile = (a: number) => {
    const on = c.value(n, assignPath(a, "A")) === 1;
    const src = SOURCES[c.value(n, assignPath(a, "B"))]?.name ?? "?";
    const tgt = TARGETS[c.value(n, assignPath(a, "G"))]?.name ?? "?";
    const active = a === state.assign;
    return `
      <button class="tile assigntile ${active ? "active" : ""} ${changedIn(a) ? "changed" : ""} ${on ? "" : "off"}" data-action="assign-pick" data-assign="${a}" aria-pressed="${active}">
        <span class="tile-sub">ASSIGN ${a} <span class="fxstate ${on ? "on" : ""}">${on ? "On" : "Off"}</span></span>
        <span class="assignline">${esc(src)}</span>
        <span class="assignline">→ ${esc(tgt)}</span>
        ${changedIn(a) ? `<span class="changedmark">changed</span>` : ""}
      </button>`;
  };
  const a = state.assign;
  const target = c.value(n, assignPath(a, "G"));
  const r = targetRange(target);
  const minmax = (key: "I" | "J", label: string): Field =>
    r.format && r.max - r.min > 250
      ? { key, label, kind: "range", min: r.min, max: r.max, scale: 10, unit: "BPM", confidence: "confirmed" }
      : { key, label, kind: "range", min: r.min, max: r.max, format: r.format, confidence: "confirmed" };
  const setting = (f: Field) => `
    <div class="setting">
      <dt>${esc(f.label)}${info(`assign.${f.key}`, f.label, f.hint)}</dt>
      <dd>${control(n, assignPath(a, f.key), f, `ASSIGN ${a} ${f.label}`)}</dd>
    </div>`;
  const isCc = (SOURCES[c.value(n, assignPath(a, "B"))]?.name ?? "").startsWith("MIDI CC#");
  return `
    <header class="pedalhead"><h2>Assign</h2></header>
    <div class="syslayout">
      <div class="boardcol">
        <nav class="tiles assigntiles" aria-label="ASSIGN 1–16">${ASSIGNS.map(tile).join("")}</nav>
        <p class="fineprint">An ASSIGN lets a source (a footswitch, an expression pedal or a MIDI CC) control a target, such as a track level or an effect. ASSIGNs are saved per memory.</p>
      </div>
      <section class="sidepanel" aria-label="ASSIGN ${a}">
        <h3>ASSIGN ${a}</h3>
        <dl class="settings">
          ${setting(ASSIGN_FIELDS[0])}
          <div class="setting">
            <dt>Source${info("assign.B", "Source", isCc ? "What controls the target. For a MIDI CC: send it from a Live MIDI control, on the channel set in System › MIDI › receive channel (control)." : "What controls the target: a footswitch, an external switch or expression pedal, a track event, or a MIDI CC (e.g. from Live MIDI).")}</dt>
            <dd>${groupedSelect(`assign-src-${a}`, SOURCES, c.value(n, assignPath(a, "B")), `data-path="${assignPath(a, "B")}" data-n="${n}" aria-label="ASSIGN ${a} source"`, c.isChanged(n, assignPath(a, "B")))}</dd>
          </div>
          ${ASSIGN_FIELDS.slice(1).map(setting).join("")}
          <div class="setting">
            <dt>Target${info("assign.G", "Target", "What is controlled: a track, an effect, the tempo, a level and more. Choosing a target sets min and max to its full range.")}</dt>
            <dd>${groupedSelect(`assign-tgt-${a}`, TARGETS, target, `data-assign-target="${a}" data-n="${n}" aria-label="ASSIGN ${a} target"`, c.isChanged(n, assignPath(a, "G")))}</dd>
          </div>
          ${setting(minmax("I", "Target min"))}
          ${setting(minmax("J", "Target max"))}
        </dl>
      </section>
    </div>`;
}

// ---------------------------------------------------------------- footswitches

/** Which file the footswitch board shows and edits: the system settings or the selected memory. */
function pedalTarget(): { n: number; root: "mem" | "sys"; label: string } {
  return state.pedalSource === "system"
    ? { n: SYSTEM, root: "sys", label: "the system settings" }
    : { n: state.selected, root: "mem", label: `memory ${pad(state.selected)} ${state.changes!.name(state.selected)}` };
}

/**
 * A switch on the board: "p1"–"p9" (onboard, current mode) or "c1"–"c4" (CTL jacks).
 * The function is in A; the value range the pedal stores with it is B/C for onboard
 * switches and C/D for the jacks (whose B isn't known and is left alone).
 */
function slotPaths(slot: string) {
  const { root } = pedalTarget();
  const num = Number(slot.slice(1));
  if (slot[0] === "p") {
    const a = pedalPath(root, state.pedalMode, num);
    const base = a.slice(0, -2);
    return { a, range: [`${base}.B`, `${base}.C`] as const, label: `Mode ${state.pedalMode}, pedal ${num}` };
  }
  const base = ctlPath(root, num);
  return { a: `${base}.A`, range: [`${base}.C`, `${base}.D`] as const, label: `CTL ${num} jack` };
}

function slotCard(slot: string) {
  const { n } = pedalTarget();
  const c = state.changes!;
  const { a, label } = slotPaths(slot);
  const f = footFunction(c.value(n, a));
  const selected = state.pedalSlot === slot;
  const num = slot.slice(1);
  return `
    <button class="pedal pedal-${slot[0] === "p" ? num : "ctl"} ${f.confidence === "guess" ? "unconfirmed" : ""} ${c.isChanged(n, a) ? "changed" : ""} ${selected ? "selected" : ""}"
      data-action="pick-slot" data-slot="${slot}" aria-pressed="${selected}" aria-label="${esc(label)}: ${esc(f.name)}">
      <span class="pedalnum">${slot[0] === "p" ? num : `CTL ${num}`}</span>
      <span class="pedalfn">${esc(f.name)}</span>
    </button>`;
}

function helpBox(value: number) {
  const f = footFunction(value);
  const h = footHelp(value);
  const row = (k: string, v?: string) => (v ? `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>` : "");
  return `
    <h4>${esc(f.name)}</h4>
    ${h ? `<dl class="actions3">${row("Push", h.push)}${row("Hold", h.hold)}${row("Double-click", h.click)}</dl><p>${esc(h.about)}</p>` : `<p class="note">What this function does isn't known yet.</p>`}`;
}

function slotPicker() {
  if (!state.pedalSlot) return `<h3>Choose a switch</h3><p class="note">Tap a switch on the board to see and change what it does.</p>`;
  const { n } = pedalTarget();
  const c = state.changes!;
  const { a, label } = slotPaths(state.pedalSlot);
  const v = c.value(n, a);
  const place = footPlace(v);
  const category = state.pickerCategory ?? place.category;
  const track = state.pickerTrack ?? place.track ?? 1;
  const option = (value: number, name: string) => {
    const usable = footRange(value) !== null;
    return `<button class="fn ${value === v ? "current" : ""}" data-action="assign" data-value="${value}" ${usable ? "" : "disabled"} aria-pressed="${value === v}">${esc(name)}${usable ? "" : ` <span class="hint">not known yet</span>`}</button>`;
  };
  const list =
    category === "track"
      ? `<div class="segmented trackpick" role="group" aria-label="Track">
           ${([1, 2, 3, 4, 5, 6, 7] as TrackChoice[]).map((t) => `<button data-action="picker-track" data-track="${t}" aria-pressed="${t === track}">${t === 7 ? "Current" : t}</button>`).join("")}
         </div>
         <div class="fnlist">${TRACK_SLOTS.map((name, slot) => option(trackFunctionValue(slot, track), name)).join("")}${track === 7 ? option(183, "Next track") : ""}</div>`
      : `<div class="fnlist">${CATEGORY_VALUES[category].map((val) => option(val, footFunction(val).name)).join("")}</div>`;
  return `
      <header class="panelhead"><h3>${esc(label)}</h3><button class="quiet" data-action="close-slot">Close</button></header>
      <div class="pickergrid">
        <nav class="menulist" aria-label="Kind of function">
          ${FOOT_CATEGORIES.map(([id, name]) => `<button data-action="picker-category" data-category="${id}" aria-pressed="${id === category}">${esc(name)}</button>`).join("")}
        </nav>
        <div class="fnchoices">${list}</div>
      </div>
      <p class="fineprint">Point at a function to see what it does. Changes are saved with Write to RC-600.</p>`;
}

function pedals() {
  const { label } = pedalTarget();
  const mode = state.pedalMode;
  const usesMemory = state.changes!.value(SYSTEM, `sys/PREF.${"CDE"[mode - 1]}`) === 0;
  return `
    <header class="pedalhead">
      <h2>Footswitches</h2>
      <div class="segmented" role="group" aria-label="Assignments to edit">
        <button data-action="pedal-source" data-source="system" aria-pressed="${state.pedalSource === "system"}">System</button>
        <button data-action="pedal-source" data-source="memory" aria-pressed="${state.pedalSource === "memory"}">This memory</button>
      </div>
    </header>
    <div class="syslayout pedallayout">
    <div class="boardcol">
    <p class="note">
      Editing ${esc(label)}. In mode ${mode} the pedal uses ${usesMemory ? "each memory's own assignments" : "the system assignments"}
      (System › Footswitch preference).
    </p>

    <div class="segmented modes" role="group" aria-label="Pedal mode">
      ${PEDAL_MODES.map((m) => `<button data-action="pedal-mode" data-mode="${m}" aria-pressed="${state.pedalMode === m}">Mode ${m}</button>`).join("")}
    </div>

    <section class="board" aria-label="Footswitches in mode ${state.pedalMode}">
      <div class="board-top">${["p7", "p8", "p9"].map(slotCard).join("")}</div>
      <div class="board-bottom">${["p1", "p2", "p3", "p4", "p5", "p6"].map(slotCard).join("")}</div>
    </section>
    <section class="board external" aria-label="External footswitches">
      <h3>External footswitches <span class="hint">CTL 1–4 jacks, the same in every mode</span></h3>
      <div class="board-ctl">${["c1", "c2", "c3", "c4"].map(slotCard).join("")}</div>
    </section>
    </div>
    <section class="sidepanel picker-panel" aria-label="Function">${slotPicker()}</section>
    </div>`;
}

/** Track settings shown without expanding: the ones changed most when setting up a memory. */
const FREQUENT_TRACK = ["J", "Q", "L", "Y", "M"];

function editor(n: number, page: "tracks" | "rpr") {
  const c = state.changes!;
  const doc = state.memories[n - 1].current;
  const rec = recordedTracks(doc);
  const tempoLocked = !c.canChangeTempo(n);
  const changedHere = c.changesFor(n).length > 0;
  const tempo = c.value(n, "mem/MASTER.A") / 10;
  const beat = c.value(n, "mem/RHYTHM.F");

  return `
    <header class="memhead">
      <span class="bignum">${pad(n)}</span>
      <label class="namefield ${changedIn(n, "mem/NAME.") ? "changed" : ""}">
        <span class="sr">Memory name</span>
        <input id="name" value="${esc(c.name(n))}" maxlength="${NAME_LENGTH}" spellcheck="false" autocomplete="off" />
      </label>
      <div class="headactions">
        ${changedHere ? `<button class="quiet" data-action="discard-memory">Undo changes here</button>` : ""}
        <button data-action="copy">Copy settings to…</button>
      </div>
    </header>

    ${page === "tracks" ? `
    <section class="basics">
      <label class="${c.isChanged(n, "mem/MASTER.A") ? "changed" : ""}">
        <span>Tempo${info("tempo", "Tempo")}</span>
        <input id="tempo" type="number" min="${TEMPO_MIN}" max="${TEMPO_MAX}" step="0.1" value="${tempo}" ${tempoLocked ? "disabled" : ""} />
        <span class="unit">BPM</span>
      </label>
      <label class="${c.isChanged(n, "mem/RHYTHM.F") ? "changed" : ""}">
        <span>Beat${info("beat", "Beat")}</span>
        <select id="beat" ${tempoLocked ? "disabled" : ""}>${BEATS.map((b, i) => `<option value="${i}" ${i === beat ? "selected" : ""}>${b}</option>`).join("")}</select>
      </label>
      <p class="note">${
        tempoLocked
          ? `Tracks ${rec.join(", ")} have audio recorded at this tempo, so tempo and beat are locked. Clear the tracks on the pedal to change them.`
          : "No audio recorded yet."
      }</p>
    </section>

    <section class="tracks" aria-label="Tracks">
      <table>
        <thead>
          <tr>
            <th scope="col"><span class="sr">Setting</span></th>
            ${TRACKS.map((t) => {
              const meas = recordedMeasures(doc, t);
              const status = rec.includes(t) ? (meas ? `${meas} meas. recorded` : "Recorded") : "Empty";
              return `<th scope="col"><span class="tracknum">${t}</span><span class="trackstate ${rec.includes(t) ? "has-audio" : ""}">${status}</span></th>`;
            }).join("")}
          </tr>
        </thead>
        <tbody>
          ${TRACK_FIELDS.filter((f) => isEditable(f) && (state.allTrackSettings || FREQUENT_TRACK.includes(f.key))).map(
            (f) => `
            <tr>
              <th scope="row">${f.label}${info(`TRACK.${f.key}`, f.label)}</th>
              ${TRACKS.map((t) => `<td>${control(n, `mem/TRACK${t}.${f.key}`, f, `Track ${t} ${f.label}`)}</td>`).join("")}
            </tr>`,
          ).join("")}
        </tbody>
      </table>
      <button class="quiet moretoggle" data-action="more-track" aria-expanded="${state.allTrackSettings}">${
        state.allTrackSettings ? "Show only the main track settings" : `Show all track settings (${TRACK_FIELDS.filter((f) => isEditable(f) && !FREQUENT_TRACK.includes(f.key)).length} more)`
      }</button>
    </section>

` : `
    <div class="groups">
      ${group(n, "Recording", "REC", REC_FIELDS)}
      ${group(n, "Playback", "PLAY", PLAY_FIELDS)}
      ${group(n, "Rhythm", "RHYTHM", RHYTHM_FIELDS)}
    </div>

`}

    <p class="fineprint">
      Effects, ASSIGN and routing settings aren't editable yet. They, and any value whose meaning isn't known,
      are kept exactly as they are on the pedal.
    </p>`;
}

function group(n: number, title: string, section: string, fields: Field[]) {
  return `
    <section class="group">
      <h2>${title}</h2>
      <dl>
        ${fields
          .filter(isEditable)
          .map(
            (f) => `
          <div class="row ${isEditable(f) ? "" : "unconfirmed"}">
            <dt>${f.label}${isEditable(f) ? "" : unconfirmedMark(f)}${info(`${section}.${f.key}`, f.label)}</dt>
            <dd>${control(n, `mem/${section}.${f.key}`, f, f.label)}</dd>
          </div>`,
          )
          .join("")}
      </dl>
    </section>`;
}

const unconfirmedMark = (f: Field) => ` <span class="qmark" title="${esc(f.hint ?? "Not confirmed yet")}">?</span>`;

function changedIn(n: number, prefix: string) {
  return state.changes!.changesFor(n).some(([p]) => p.startsWith(prefix));
}

function control(n: number, path: string, f: Field, label: string): string {
  const c = state.changes!;
  const v = c.value(n, path);
  const changed = c.isChanged(n, path) ? "changed" : "";
  const id = `f${n}-${path.replace(/[^A-Za-z0-9]/g, "-")}`;
  const aria = `aria-label="${esc(label)}"`;
  const select = (opts: [number, string][]) => {
    if (!opts.some(([val]) => val === v)) opts.push([v, `? (${v})`]);
    return `<select id="${id}" class="${changed}" data-path="${path}" data-n="${n}" ${aria}>${opts
      .map(([val, text]) => `<option value="${val}" ${val === v ? "selected" : ""}>${esc(text)}</option>`)
      .join("")}</select>`;
  };

  if (!isEditable(f) || NEVER_EDIT.has(path)) {
    // Known meaning but locked (phantom power): show the meaning, not the number
    const shown = isEditable(f) && f.kind !== "raw" ? displayValue(f, v) : String(v);
    return `<span class="raw" title="${esc(f.hint ?? "")}">${esc(shown)}</span>`;
  }
  switch (f.kind) {
    case "enum":
      if (f.options.length === 2 && f.options[0] === "Off" && f.options[1] === "On" && (v === 0 || v === 1)) {
        return `<button id="${id}" class="switch ${changed}" role="switch" aria-checked="${v === 1}" data-path="${path}" data-n="${n}" data-switch ${aria}><span class="knob"></span><span class="switchlabel">${v === 1 ? "On" : "Off"}</span></button>`;
      }
      return select(f.options.map((o, i) => [i, o]));
    case "measure": {
      const track = Number(path.match(/TRACK(\d)/)![1]);
      if (!c.canChangeMeasure(n, track)) return `<span class="raw" title="This track has audio; its length is set">${formatMeasure(v)}</span>`;
      const opts: [number, string][] = [
        [0, formatMeasure(0)],
        [1, formatMeasure(1)],
      ];
      for (let m = 1; m <= MEASURE_MAX_MEASURES; m++) opts.push([m + 7, formatMeasure(m + 7)]);
      if (!opts.some(([val]) => val === v)) opts.unshift([v, formatMeasure(v)]);
      return select(opts);
    }
    case "range":
      if (f.format === formatPan) {
        const opts: [number, string][] = [];
        for (let i = f.min; i <= f.max; i++) opts.push([i, formatPan(i)]);
        return select(opts);
      }
      // Stored with an offset (delay time = ms + 11): typed in the pedal's units
      if (f.offset !== undefined || f.scale) {
        const off = f.offset ?? 0;
        const sc = f.scale ?? 1;
        const synced = off > 0 && v < f.min; // e.g. a tempo-synced note value, chosen on the pedal
        return `<span class="unitinput ${changed}"><input id="${id}" type="number" min="${(f.min - off) / sc}" max="${(f.max - off) / sc}" step="${1 / sc}" value="${synced ? "" : (v - off) / sc}" placeholder="${synced ? "synced" : ""}" data-path="${path}" data-n="${n}" data-offset="${off}" data-scale="${sc}" ${aria} />${f.unit ? `<span class="unit">${esc(f.unit)}</span>` : ""}</span>`;
      }
      // Stored differently from what the pedal shows (contrast 0–9 for 1–10, dB, "Off"):
      // offer the pedal's own labels, so nobody types the stored number by mistake
      if (f.format) {
        const opts: [number, string][] = [];
        for (let i = f.min; i <= f.max; i++) opts.push([i, f.format(i)]);
        return select(opts);
      }
      return `<input id="${id}" class="${changed}" type="number" min="${f.min}" max="${f.max}" value="${v}" data-path="${path}" data-n="${n}" ${aria} />`;
    case "bitmask": {
      const on = decodeBitmask(v, f.bits.length);
      const chip = (i: number, text: string) =>
        `<button class="chip ${on[i] ? "on" : ""}" aria-pressed="${on[i]}" aria-label="${esc(f.bits[i])}" data-path="${path}" data-n="${n}" data-bit="${i}" data-bits="${f.bits.length}">${esc(text)}</button>`;
      if (f.groups) {
        return `<span class="chipgrid ${changed}" role="group" ${aria}>${f.groups
          .map((g) => `<span class="chiplabel">${esc(g.label)}</span><span class="chips">${g.bits.map(([i, s]) => chip(i, s)).join("")}</span>`)
          .join("")}</span>`;
      }
      return `<span class="chips ${changed}" role="group" ${aria}>${f.bits.map((b, i) => chip(i, b)).join("")}</span>`;
    }
    case "raw":
      return `<span class="raw">${v}</span>`;
  }
}

function footer() {
  const c = state.changes!;
  const changed = c.changedMemories();
  const summary = changed.length ? `Changed: ${changeList(changed)}` : "No unsaved changes";
  return `
    <div class="status">${message() || `<span>${summary}</span>`}</div>
    <div class="actions">
      ${changed.length ? `<button class="quiet" data-action="discard-all">Discard all</button>` : ""}
      <button class="primary" data-action="review" ${changed.length ? "" : "disabled"}>Write to RC-600…</button>
    </div>`;
}

/** "memories 1–3, 7 and system settings" */
function changeList(ns: number[]): string {
  const mems = ns.filter((n) => n !== SYSTEM);
  const parts = mems.length ? [`${mems.length === 1 ? "memory" : "memories"} ${formatMemoryList(mems)}`] : [];
  if (ns.includes(SYSTEM)) parts.push("system settings");
  return parts.join(" and ");
}

function message() {
  if (!state.message) return "";
  return `<span class="message ${state.message.tone === "error" ? "error" : ""}" role="status" title="${esc(state.message.text)}">${esc(state.message.text)}</span>`;
}

function say(text: string, tone: "info" | "error" = "info") {
  state.message = { text, tone };
  render();
}

// ---------------------------------------------------------------- dialogs

function openDialog(html: string): HTMLDialogElement {
  const d = document.createElement("dialog");
  d.innerHTML = html;
  d.addEventListener("close", () => d.remove());
  document.body.append(d);
  d.showModal();
  return d;
}

function copyDialog() {
  const from = state.selected;
  const c = state.changes!;
  const empty = state.memories.filter((m) => m.number !== from && recordedTracks(m.current).length === 0).map((m) => m.number);
  const d = openDialog(`
    <form method="dialog" class="copy">
      <h2>Copy settings from ${pad(from)} ${esc(c.name(from))}</h2>
      <fieldset>
        <legend>What to copy</legend>
        ${(Object.keys(COPY_GROUPS) as CopyGroup[])
          .map((g) => `<label><input type="checkbox" name="group" value="${g}" ${g === "tempo" ? "" : "checked"} /> ${COPY_GROUPS[g].label}</label>`)
          .join("")}
      </fieldset>
      <label class="targets">
        <span>To memories</span>
        <input name="targets" placeholder="e.g. 10-20, 25" autocomplete="off" />
      </label>
      <p class="quickpick">
        <button type="button" class="quiet" data-fill="${formatMemoryList(empty)}">Memories without recordings</button>
        <button type="button" class="quiet" data-fill="1-99">All memories</button>
      </p>
      <p class="preview" aria-live="polite"></p>
      <div class="actions">
        <button value="cancel" class="quiet">Cancel</button>
        <button value="apply" class="primary" disabled>Copy</button>
      </div>
    </form>`);
  const form = d.querySelector("form")!;
  const input = form.querySelector<HTMLInputElement>("[name=targets]")!;
  const apply = form.querySelector<HTMLButtonElement>("[value=apply]")!;
  const preview = form.querySelector(".preview")!;
  const update = () => {
    const { numbers, error } = parseMemoryList(input.value, MEMORY_COUNT);
    const targets = numbers.filter((x) => x !== from);
    const groups = form.querySelectorAll("[name=group]:checked").length;
    preview.textContent = error ?? (targets.length ? `Will change ${targets.length} ${targets.length === 1 ? "memory" : "memories"}. Nothing is written until you press Write.` : "");
    apply.disabled = Boolean(error) || !targets.length || !groups;
  };
  form.addEventListener("input", update);
  form.querySelectorAll<HTMLButtonElement>("[data-fill]").forEach((b) =>
    b.addEventListener("click", () => {
      input.value = b.dataset.fill!;
      update();
    }),
  );
  d.addEventListener("close", () => {
    if (d.returnValue !== "apply") return;
    const targets = parseMemoryList(input.value).numbers;
    const groups = [...form.querySelectorAll<HTMLInputElement>("[name=group]:checked")].map((i) => i.value as CopyGroup);
    const { skipped } = c.copy(from, targets, groups);
    const done = targets.filter((x) => x !== from).length;
    say(
      skipped.length
        ? `Copied to ${done} memories. Tempo and beat were left alone in ${formatMemoryList(skipped.map((s) => s.n))} because they have recordings.`
        : `Copied to ${done} ${done === 1 ? "memory" : "memories"}.`,
    );
  });
  input.focus();
}

function describe(path: string): { label: string; field?: Field } | null {
  const fx = describeFx(path);
  if (fx) return fx;
  if (/ICTL\d_PEDAL\d\.[BC]$/.test(path) || /ECTL_CTL\d\.[CD]$/.test(path)) return null; // value range, set with the function
  const jack = path.match(/^(mem|sys)\/ECTL_CTL(\d)\.A$/);
  if (jack) return { label: `External footswitch CTL ${jack[2]}` };
  const pedal = path.match(/^(mem|sys)\/ICTL(\d)_PEDAL(\d)\.A$/);
  if (pedal) return { label: `Footswitch mode ${pedal[2]}, pedal ${pedal[3]}` };
  const sys = path.match(/^sys\/([A-Z0-9_]+)\.([A-Z]+)$/);
  if (sys) {
    const section = SYSTEM_SECTIONS.find((x) => x.id === sys[1]);
    const field = section?.fields.find((f) => f.key === sys[2]);
    return { label: section && field ? `${section.title}: ${field.label}` : path, field };
  }
  const m = path.match(/^mem\/([A-Z]+)(\d?)\.([A-Z]+)$/);
  if (!m) return { label: path };
  const [, section, track, key] = m;
  if (section === "NAME") return null; // shown once as the name
  if (section === "MASTER") return key === "A" ? { label: "Tempo" } : null;
  if (section === "TRACK" && key >= "R" && key <= "X") return null; // kept in step with the measure setting
  if (section === "RHYTHM" && key === "F") return { label: "Beat" };
  const fields = section === "TRACK" ? TRACK_FIELDS : section === "REC" ? REC_FIELDS : section === "PLAY" ? PLAY_FIELDS : RHYTHM_FIELDS;
  const field = fields.find((f) => f.key === key);
  const prefix = section === "TRACK" ? `Track ${track} ` : section === "REC" ? "Recording: " : section === "PLAY" ? "Playback: " : "Rhythm: ";
  return { label: prefix + (field?.label.toLowerCase() ?? key), field };
}

function formatValue(path: string, v: number, field?: Field) {
  if (/(ICTL\d_PEDAL\d|ECTL_CTL\d)\.A$/.test(path)) return footFunction(v).name;
  if (path === "mem/MASTER.A") return `${v / 10} BPM`;
  if (path === "mem/RHYTHM.F") return BEATS[v] ?? String(v);
  return field ? displayValue(field, v) : String(v);
}

function reviewDialog() {
  const c = state.changes!;
  const items = c.changedMemories().map((n) => {
    const doc = n === SYSTEM ? state.system!.current : state.memories[n - 1].current;
    const lines: string[] = [];
    if (n !== SYSTEM && changedIn(n, "mem/NAME.")) lines.push(`Name: ${esc(readName(doc))} → ${esc(c.name(n))}`);
    for (const [p, v] of c.changesFor(n)) {
      const which = p.match(/^mem\/ASSIGN(\d+)\./)?.[1];
      const a = describeAssign(p, v, which ? c.value(n, `mem/ASSIGN${which}.G`) : undefined);
      if (a) {
        const before = describeAssign(p, doc.get(p), which ? doc.get(`mem/ASSIGN${which}.G`) : undefined)!.shown;
        lines.push(`${esc(a.label)}: ${esc(before)} → ${esc(a.shown)}`);
        continue;
      }
      const d = describe(p);
      if (!d) continue;
      lines.push(`${esc(d.label)}: ${esc(formatValue(p, doc.get(p), d.field))} → ${esc(formatValue(p, v, d.field))}`);
    }
    const title = n === SYSTEM ? "System settings" : `${pad(n)} ${esc(c.name(n))}`;
    return `<li><strong>${title}</strong><ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul></li>`;
  });
  const needsBackup = state.store instanceof DirectoryStore && !state.backupFolder;
  const known = needsBackup && backupDir;
  const d = openDialog(`
    <form method="dialog" class="review">
      <h2>Write to ${esc(state.store!.label)}</h2>
      <ol class="changelist">${items.join("")}</ol>
      ${
        known
          ? `<p>Before the first write, the editor backs up every pedal file to a new dated folder in “${esc(backupDir!.name)}”.</p>`
          : needsBackup
            ? `<p>Before the first write, the editor copies every pedal file to a backup folder you choose. Pick a folder on this computer, not on the pedal; it's remembered for next time.</p>`
            : state.backupFolder
              ? `<p>Backup from this session: ${esc(state.backupFolder)}</p>`
              : ""
      }
      <div class="actions">
        <button value="cancel" class="quiet">Cancel</button>
        ${known ? `<button value="change" class="quiet">Use another backup folder…</button>` : ""}
        <button value="write" class="primary">${needsBackup && !known ? "Choose backup folder and write" : "Write"}</button>
      </div>
    </form>`);
  d.querySelector<HTMLButtonElement>("[value=change]")?.addEventListener("click", (e) => {
    e.preventDefault();
    d.close();
    void write(true, true);
  });
  d.querySelector<HTMLButtonElement>("[value=write]")!.addEventListener("click", (e) => {
    e.preventDefault();
    d.close();
    void write(needsBackup);
  });
}

/** The backup folder chosen last time, remembered by the browser (IndexedDB); undefined until looked up. */
let backupDir: FileSystemDirectoryHandle | null | undefined;
void rememberedFolder("backup").then((d) => (backupDir = d));

/** The folder to back up into: the remembered one if it's still allowed, else one picked now (and remembered). */
async function backupTarget(pickNew: boolean): Promise<FileSystemDirectoryHandle | null> {
  if (!pickNew && backupDir) {
    try {
      if (await regainAccess(backupDir)) return backupDir;
    } catch {
      // folder gone or no longer allowed: pick one below
    }
  }
  try {
    const picked = await window.showDirectoryPicker({ id: "rc600-backup", mode: "readwrite" });
    await rememberFolder(picked, "backup");
    backupDir = picked;
    return picked;
  } catch {
    return null; // picker cancelled
  }
}

async function write(needsBackup: boolean, pickNew = false) {
  const store = state.store!;
  if (needsBackup && store instanceof DirectoryStore) {
    const target = await backupTarget(pickNew);
    if (!target) return say("Nothing written: no backup folder was chosen.");
    try {
      say(`Backing up all pedal files to “${target.name}”…`);
      state.backupFolder = `${target.name}/${await store.backupTo(target)}`;
    } catch (e) {
      if (target === backupDir) backupDir = null; // e.g. the drive with that folder isn't connected: ask next time
      return say(`Nothing written: the backup to “${target.name}” failed (${(e as Error).message}). Press Write again to choose a backup folder.`, "error");
    }
  }
  try {
    const written = await state.changes!.writeAll(store, (n) => say(n === SYSTEM ? "Writing system settings…" : `Writing memory ${pad(n)}…`));
    say(`Wrote ${changeList(written)}. Eject the drive and switch the pedal out of storage mode to load them.`);
  } catch (e) {
    say(`Writing stopped: ${(e as Error).message}. Memories not listed as written still have their changes.`, "error");
  }
}

/**
 * Stage the system settings and footswitch assignments of a backup folder (one the editor
 * made, or a copy of ROLAND/DATA) wherever they differ from the pedal. Nothing is written
 * until Write; recordings and phantom power are never touched (see stageRestore).
 */
async function restoreFromBackup() {
  if (!("showDirectoryPicker" in window)) return say("This browser can't open folders directly. Use Chrome or Edge.", "error");
  let picked: FileSystemDirectoryHandle;
  try {
    picked = await window.showDirectoryPicker({ id: "rc600-restore", mode: "read" });
  } catch {
    return; // cancelled
  }
  const data = await findDataFolder(picked);
  if (!data) return say(`No RC-600 files found in "${picked.name}". Pick a backup folder, or a copy of ROLAND/DATA.`, "error");
  say(`Reading the backup in "${picked.name}"…`);
  try {
    const store = new DirectoryStore(data);
    const backup = { system: await loadSystem(store), memories: await loadMemories(store) };
    const touched = stageRestore(state.changes!, { system: state.system!, memories: state.memories }, backup);
    if (!touched.length) return say(`"${picked.name}" has the same system settings and footswitches as the pedal. Nothing to restore.`);
    say(`Staged from "${picked.name}": ${changeList(touched)}. Check them with Write to RC-600; nothing is written yet. Phones and master levels, the start-up memory and phantom power were left as they are.`);
  } catch (e) {
    say(`Couldn't read that backup: ${(e as Error).message}`, "error");
  }
}

// ---------------------------------------------------------------- events

function selectMemory(n: number) {
  if (n < 1 || n > MEMORY_COUNT) return;
  state.selected = n;
  state.message = null;
  render();
  app.querySelector(".editor")?.scrollTo({ top: 0 });
}

app.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>("[data-action], [data-bit], [data-info], [data-switch]");
  if (!target) return;
  const c = state.changes;

  if (target.dataset.info) {
    const pinned = state.info?.pinned && state.info.key === target.dataset.info;
    if (pinned) {
      state.info = null;
      showInfo(target.dataset.info, target.dataset.infoLabel!, false);
    } else {
      state.info = null;
      showInfo(target.dataset.info, target.dataset.infoLabel!, true);
    }
    return;
  }
  if (target.dataset.switch !== undefined && c) {
    const n = Number(target.dataset.n ?? state.selected);
    const path = target.dataset.path!;
    c.set(n, path, c.value(n, path) === 1 ? 0 : 1);
    state.message = null;
    render();
    document.getElementById(target.id)?.focus();
    return;
  }
  if (target.dataset.bit && c) {
    const path = target.dataset.path!;
    const n = target.dataset.n !== undefined ? Number(target.dataset.n) : state.selected;
    const bits = decodeBitmask(c.value(n, path), Number(target.dataset.bits));
    bits[Number(target.dataset.bit)] = !bits[Number(target.dataset.bit)];
    c.set(n, path, encodeBitmask(bits));
    render();
    return;
  }
  switch (target.dataset.action) {
    case "open":
      return void openPedal();
    case "reopen":
      return void reopenPedal();
    case "sandbox":
      return void load(new SandboxStore());
    case "view":
      return goToView(target.dataset.view as View);
    case "pedal-source":
      state.pedalSource = target.dataset.source as "system" | "memory";
      return render();
    case "pedal-mode":
      state.pedalMode = Number(target.dataset.mode);
      if (state.pedalSlot?.startsWith("p")) state.pickerCategory = state.pickerTrack = null;
      return render();
    case "pick-slot": {
      const slot = target.dataset.slot!;
      state.pedalSlot = state.pedalSlot === slot ? null : slot;
      state.pickerCategory = state.pickerTrack = null;
      if (state.pedalSlot) {
        const value = slotValue(state.pedalSlot);
        state.info = { key: `foot:${value}`, label: footFunction(value).name, pinned: false };
      }
      return render();
    }
    case "close-slot":
      state.pedalSlot = null;
      return render();
    case "picker-category":
      state.pickerCategory = target.dataset.category as FootCategory;
      return render();
    case "picker-track":
      state.pickerCategory = "track";
      state.pickerTrack = Number(target.dataset.track) as TrackChoice;
      return render();
    case "assign": {
      if (!c || !state.pedalSlot) return;
      const value = Number(target.dataset.value);
      const range = footRange(value);
      if (!range) return say("That function can't be assigned from the editor yet.", "error");
      const { n } = pedalTarget();
      const { a, range: [lo, hi] } = slotPaths(state.pedalSlot);
      c.set(n, a, value);
      c.set(n, lo, range.B);
      c.set(n, hi, range.C);
      state.message = null;
      return render();
    }
    case "assign-pick":
      state.assign = Number(target.dataset.assign);
      return render();
    case "fx-root":
      state.fxRoot = target.dataset.root as FxRoot;
      return render();
    case "fx-bank":
      state.fxBank = Number(target.dataset.bank);
      return render();
    case "fx-slot":
      state.fxSlot = Number(target.dataset.slot);
      return render();
    case "sys-section":
      state.sysSection = target.dataset.section!;
      return render();
    case "more-track":
      state.allTrackSettings = !state.allTrackSettings;
      writePref("allTrackSettings", state.allTrackSettings ? "1" : "0");
      return render();
    case "install":
      return void install();
    case "theme":
      theme = theme === "auto" ? "dark" : theme === "dark" ? "light" : "auto";
      writePref("theme", theme);
      applyTheme();
      return render();
    case "restore":
      return void restoreFromBackup();
    case "discard-system":
      c?.discard(SYSTEM);
      return say("Undid the system changes.");
    case "unpin-info":
      state.info = null;
      app.querySelector(".infopane")!.innerHTML = infoPane();
      app.querySelectorAll(".info.active").forEach((b) => b.classList.remove("active"));
      return;
    case "prev":
      return selectMemory(state.selected - 1);
    case "next":
      return selectMemory(state.selected + 1);
    case "copy":
      return copyDialog();
    case "review":
      return reviewDialog();
    case "discard-memory":
      c?.discard(state.selected);
      return say(`Undid the changes in memory ${pad(state.selected)}.`);
    case "discard-all":
      if (confirm("Discard all unsaved changes?")) {
        c?.discard();
        say("All unsaved changes discarded.");
      }
      return;
  }
});

app.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  const c = state.changes;
  if (!c) return;
  const n = el.dataset.n !== undefined ? Number(el.dataset.n) : state.selected;

  if (el.id === "memory") return selectMemory(Number(el.value));
  if (el.dataset.assignTarget) {
    const a = Number(el.dataset.assignTarget);
    const t = Number(el.value);
    const r = targetRange(t);
    c.set(n, assignPath(a, "G"), t);
    c.set(n, assignPath(a, "I"), r.min);
    c.set(n, assignPath(a, "J"), r.max);
    state.message = null;
    return render();
  }
  if (el.id === "name") {
    const clean = [...el.value].filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 126).join("");
    if (clean !== el.value) say("Some characters were removed: the pedal only shows plain letters, numbers and symbols.");
    c.setName(n, clean);
  } else if (el.id === "tempo") {
    const bpm = Math.round(Number(el.value) * 10) / 10;
    if (!(bpm >= TEMPO_MIN && bpm <= TEMPO_MAX)) return say(`Tempo must be between ${TEMPO_MIN} and ${TEMPO_MAX} BPM.`, "error");
    c.setTempo(n, bpm);
  } else if (el.id === "beat") {
    c.setBeat(n, Number(el.value));
  } else if (el.dataset.path?.endsWith(".J") && el.dataset.path.includes("TRACK")) {
    const track = Number(el.dataset.path.match(/TRACK(\d)/)![1]);
    const j = Number(el.value);
    if (!c.canChangeMeasure(n, track, j)) return say("Note-length measures can't be set from the editor yet.", "error");
    c.setMeasure(n, track, j);
  } else if (el.dataset.path) {
    const v = Number(el.value);
    const min = Number(el.getAttribute("min") ?? -Infinity);
    const max = Number(el.getAttribute("max") ?? Infinity);
    const scale = Number(el.dataset.scale ?? 1);
    if (el.value === "" || !Number.isInteger(Math.round(v * scale * 1000) / 1000) || v < min || v > max) {
      return say(scale === 1 ? `Enter a whole number from ${min} to ${max}.` : `Enter a value from ${min} to ${max}.`, "error");
    }
    c.set(n, el.dataset.path, Math.round(v * scale) + Number(el.dataset.offset ?? 0));
  } else return;
  state.message = null;
  render();
});

// Hovering or focusing an info button previews its explanation in the info pane
for (const type of ["mouseover", "focusin"]) {
  app.addEventListener(type, (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-info]");
    if (b) showInfo(b.dataset.info!, b.dataset.infoLabel!, false);
  });
}

// Footswitches: pointing at a switch or a function shows what it does in the info pane;
// leaving the picker shows the selected switch's function again
const showFoot = (value: number) => showInfo(`foot:${value}`, footFunction(value).name, false);
const slotValue = (slot: string) => state.changes!.value(pedalTarget().n, slotPaths(slot).a);
for (const type of ["mouseover", "focusin"]) {
  app.addEventListener(type, (e) => {
    if (state.view !== "pedals" || !state.changes) return;
    const el = e.target as HTMLElement;
    const fn = el.closest<HTMLElement>(".fnchoices [data-value]");
    if (fn) return showFoot(Number(fn.dataset.value));
    const card = el.closest<HTMLElement>("[data-slot]");
    if (card) showFoot(slotValue(card.dataset.slot!));
  });
}
app.addEventListener("mouseout", (e) => {
  if (state.view !== "pedals" || !state.pedalSlot || !state.changes) return;
  const from = (e.target as HTMLElement).closest(".fnchoices, [data-slot]");
  const to = (e as MouseEvent).relatedTarget as HTMLElement | null;
  if (!from || to?.closest(".fnchoices, [data-slot]")) return;
  showFoot(slotValue(state.pedalSlot));
});

// Swipe left/right (touch or pen) to move between menu items. Not on sliders, inputs or
// anything that scrolls sideways itself, and only for a quick, mostly horizontal swipe.
let swipeStart: { x: number; y: number; t: number } | null = null;
app.addEventListener("pointerdown", (e) => {
  const el = e.target as HTMLElement;
  if (e.pointerType === "mouse" || el.closest("input, select, textarea, .liveboard, .tracks, dialog")) return void (swipeStart = null);
  swipeStart = { x: e.clientX, y: e.clientY, t: e.timeStamp };
});
app.addEventListener("pointerup", (e) => {
  if (!swipeStart) return;
  const dx = e.clientX - swipeStart.x;
  const dy = e.clientY - swipeStart.y;
  const quick = e.timeStamp - swipeStart.t < 700;
  swipeStart = null;
  if (!quick || Math.abs(dx) < 80 || Math.abs(dx) < 2 * Math.abs(dy)) return;
  const order = VIEWS.map(([id]) => id as View);
  const next = order[order.indexOf(state.view) + (dx < 0 ? 1 : -1)];
  if (next) goToView(next);
});

window.addEventListener("beforeunload", (e) => {
  if (state.changes?.size) e.preventDefault();
});

// Installable app: offline support in the built version (the dev server stays uncached), and
// an "Install app" button in the top bar when the browser offers installing
let installPrompt: (Event & { prompt(): Promise<void> }) | null = null;
if (import.meta.env.PROD && "serviceWorker" in navigator) void navigator.serviceWorker.register("./sw.js");
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e as typeof installPrompt;
  render();
});
window.addEventListener("appinstalled", () => {
  installPrompt = null;
  render();
});
const isInstallable = () => installPrompt !== null;
async function install() {
  await installPrompt?.prompt();
  installPrompt = null;
  render();
}

render();


