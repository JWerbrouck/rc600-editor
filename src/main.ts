import "./styles.css";
import { Changes, MEMORY_COUNT, loadMemories, loadSystem, readName, recordedMeasures, recordedTracks, type Memory, type Store } from "./core/library";
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
import { CTL_JACKS, PEDAL_MODES, ctlPath, footFunction, pedalPath } from "./core/footswitch";
import type { Rc0 } from "./core/rc0";
import { mountLive } from "./live";
import { mountArranger } from "./arranger";

interface State {
  store: Store | null;
  memories: Memory[];
  system: Rc0 | null;
  changes: Changes | null;
  selected: number;
  view: "memory" | "pedals" | "system" | "live" | "arranger";
  pedalSource: "system" | "memory";
  pedalMode: number;
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
  info: null,
  backupFolder: null,
  message: null,
};
const app = document.querySelector<HTMLDivElement>("#app")!;

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
  await load(new DirectoryStore(data));
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
  state.changes = new Changes(state.memories);
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
  const editorScroll = app.querySelector(".editor")?.scrollTop ?? 0;
  const focused = document.activeElement?.id;
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <h1>RC-600 Editor</h1>
        <div class="picker" ${!filesOpen || state.view === "system" || own ? "hidden" : ""}>
          <button class="step" data-action="prev" aria-label="Previous memory" ${state.selected === 1 ? "disabled" : ""}>‹</button>
          <label>
            <span class="sr">Memory</span>
            <select id="memory">${filesOpen ? state.memories.map(memoryOption).join("") : ""}</select>
          </label>
          <button class="step" data-action="next" aria-label="Next memory" ${state.selected === MEMORY_COUNT ? "disabled" : ""}>›</button>
        </div>
        <nav class="views" aria-label="View">
          <button data-action="view-memory" aria-pressed="${state.view === "memory"}">Memory settings</button>
          <button data-action="view-pedals" aria-pressed="${state.view === "pedals"}">Footswitches</button>
          <button data-action="view-system" aria-pressed="${state.view === "system"}">System</button>
          <button data-action="view-live" aria-pressed="${state.view === "live"}">Live MIDI</button>
          <button data-action="view-arranger" aria-pressed="${state.view === "arranger"}">Arranger</button>
        </nav>
        <p class="source" title="Pedal files are read from and written to this folder">${filesOpen ? esc(state.store!.label) : own ? "" : "Pedal not connected"}</p>
      </header>
      <div class="workspace ${own || needsFiles ? "noinfo" : ""}">
        <main class="editor">${
          own ? "" : needsFiles ? welcome() : state.view === "memory" ? editor(state.selected) : state.view === "pedals" ? pedals() : system()
        }</main>
        ${own || needsFiles ? "" : `<aside class="infopane" aria-live="polite">${infoPane()}</aside>`}
      </div>
      ${filesOpen ? `<footer class="bar">${footer()}</footer>` : ""}
    </div>`;
  if (state.view === "live") mountLive(app.querySelector<HTMLElement>(".editor")!);
  if (state.view === "arranger") mountArranger(app.querySelector<HTMLElement>(".editor")!);
  app.querySelector(".editor")!.scrollTop = editorScroll;
  if (focused) document.getElementById(focused)?.focus();
}

function welcome() {
  const sandbox = import.meta.env.DEV ? `<button class="quiet" data-action="sandbox">Use the sandbox copy</button>` : "";
  return `
    <section class="welcome">
      <h2>Connect the RC-600</h2>
      <p>To edit memory, footswitch and system settings, open the pedal's files. Live MIDI and the arranger work without this.</p>
      <ol class="steps">
        <li>On the RC-600, open the menu and switch USB to <strong>storage</strong> mode.</li>
        <li>Connect it to this computer with a USB cable.</li>
        <li>Open the pedal's drive. Picking the drive itself, its ROLAND folder, or ROLAND/DATA all work.</li>
      </ol>
      <div class="actions">
        <button class="primary" data-action="open">Open RC-600</button>
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

/** Info button: hovering or focusing shows the explanation in the info pane, clicking keeps it there. */
function info(key: string, label: string) {
  if (!INFO[key]) return "";
  const active = state.info?.key === key ? "active" : "";
  return ` <button class="info ${active}" data-info="${key}" data-info-label="${esc(label)}" aria-label="About ${esc(label)}">i</button>`;
}

function infoPane() {
  if (!state.info) {
    return `<p class="placeholder">Point at an <span class="info static" aria-hidden="true">i</span> to see what a setting does. Click it to keep the explanation here.</p>`;
  }
  return `
    <h2>${esc(state.info.label)}</h2>
    <p>${esc(INFO[state.info.key] ?? "")}</p>
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

/** Read-only overview of SYSTEM1/2 until its settings are mapped (like schema.ts for memories). */
function system() {
  const doc = state.system!;
  const sections = new Map<string, string[]>();
  for (const p of doc.paths("sys/")) {
    const section = p.slice(4, p.lastIndexOf("."));
    if (/^(ICTL|ECTL)/.test(section)) continue; // shown under Footswitches
    sections.set(section, [...(sections.get(section) ?? []), p]);
  }
  return `
    <header class="pedalhead"><h2>System settings</h2></header>
    <p class="note">
      Settings that apply to the whole pedal rather than one memory. They aren't decoded yet, so they're shown as stored and can't be edited.
      Mapping them works the same way as the memory settings: a round of tests on the pedal.
    </p>
    <div class="sysgrid">
      ${[...sections]
        .map(
          ([name, paths]) => `
        <details class="group">
          <summary>${esc(name)} <span class="hint">${paths.length} values</span></summary>
          <p class="rawvalues">${paths.map((p) => `<span>${esc(p.slice(p.lastIndexOf(".") + 1))} ${doc.get(p)}</span>`).join("")}</p>
        </details>`,
        )
        .join("")}
    </div>`;
}

// ---------------------------------------------------------------- footswitches

function pedalDoc(): { doc: Rc0; root: "mem" | "sys"; label: string } {
  return state.pedalSource === "system"
    ? { doc: state.system!, root: "sys", label: "System settings" }
    : { doc: state.memories[state.selected - 1].current, root: "mem", label: `Memory ${pad(state.selected)} ${state.changes!.name(state.selected)}` };
}

function pedalCard(doc: Rc0, root: "mem" | "sys", pedal: number) {
  const f = footFunction(doc.get(pedalPath(root, state.pedalMode, pedal)));
  return `
    <div class="pedal pedal-${pedal} ${f.confidence === "guess" ? "unconfirmed" : ""}">
      <span class="pedalnum">${pedal}</span>
      <span class="pedalfn">${esc(f.name)}${f.confidence === "guess" ? ` <span class="qmark" title="Function number ${f.value}; not confirmed yet">?</span>` : ""}</span>
    </div>`;
}

function pedals() {
  const { doc, root, label } = pedalDoc();
  return `
    <header class="pedalhead">
      <h2>Footswitches</h2>
      <div class="segmented" role="group" aria-label="Settings shown">
        <button data-action="pedal-source" data-source="system" aria-pressed="${state.pedalSource === "system"}">System</button>
        <button data-action="pedal-source" data-source="memory" aria-pressed="${state.pedalSource === "memory"}">This memory</button>
      </div>
    </header>
    <p class="note">
      Showing ${esc(label)}. The pedal uses either the system assignments or each memory's own, depending on
      MENU › CTL FUNC › PREFERENCE. The editor can't tell which yet, and assignments are read-only until round 3 of TESTS.md confirms the function list.
    </p>

    <div class="segmented modes" role="group" aria-label="Pedal mode">
      ${PEDAL_MODES.map((m) => `<button data-action="pedal-mode" data-mode="${m}" aria-pressed="${state.pedalMode === m}">Mode ${m}</button>`).join("")}
    </div>

    <section class="board" aria-label="Footswitches in mode ${state.pedalMode}">
      <div class="board-top">${[7, 8, 9].map((p) => pedalCard(doc, root, p)).join("")}</div>
      <div class="board-bottom">${[1, 2, 3, 4, 5, 6].map((p) => pedalCard(doc, root, p)).join("")}</div>
    </section>

    <section class="external">
      <h3>External footswitches</h3>
      <dl>
        ${CTL_JACKS.map((c) => {
          const p = ctlPath(root, c);
          return `<div class="row"><dt>CTL ${c}</dt><dd><span class="raw">${doc.get(`${p}.A`)} / ${doc.get(`${p}.B`)}</span></dd></div>`;
        }).join("")}
      </dl>
      <p class="fineprint">External switches use their own function list, which isn't decoded yet. The numbers are shown as stored.</p>
    </section>`;
}

function editor(n: number) {
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
          ${TRACK_FIELDS.map(
            (f) => `
            <tr class="${isEditable(f) ? "" : "unconfirmed"}">
              <th scope="row">${f.label}${isEditable(f) ? "" : unconfirmedMark(f)}${info(`TRACK.${f.key}`, f.label)}</th>
              ${TRACKS.map((t) => `<td>${control(n, `mem/TRACK${t}.${f.key}`, f, `Track ${t} ${f.label}`)}</td>`).join("")}
            </tr>`,
          ).join("")}
        </tbody>
      </table>
    </section>

    <div class="groups">
      ${group(n, "Recording", "REC", REC_FIELDS)}
      ${group(n, "Playback", "PLAY", PLAY_FIELDS)}
      ${group(n, "Rhythm", "RHYTHM", RHYTHM_FIELDS)}
    </div>

    <p class="fineprint">
      Effects, ASSIGN, control and routing settings aren't editable yet. They're kept exactly as they are on the pedal.
      Settings marked <span class="qmark" aria-hidden="true">?</span> are shown as raw values until a test on the pedal confirms what they mean.
    </p>`;
}

function group(n: number, title: string, section: string, fields: Field[]) {
  return `
    <section class="group">
      <h2>${title}</h2>
      <dl>
        ${fields
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
  const id = `f-${path.replace(/[^A-Za-z0-9]/g, "-")}`;
  const aria = `aria-label="${esc(label)}"`;
  const select = (opts: [number, string][]) => {
    if (!opts.some(([val]) => val === v)) opts.push([v, `? (${v})`]);
    return `<select id="${id}" class="${changed}" data-path="${path}" ${aria}>${opts
      .map(([val, text]) => `<option value="${val}" ${val === v ? "selected" : ""}>${esc(text)}</option>`)
      .join("")}</select>`;
  };

  if (!isEditable(f)) return `<span class="raw" title="${esc(f.hint ?? "")}">${v}</span>`;
  switch (f.kind) {
    case "enum":
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
      return `<input id="${id}" class="${changed}" type="number" min="${f.min}" max="${f.max}" value="${v}" data-path="${path}" ${aria} />${
        f.format ? `<span class="hint">${esc(displayValue(f, v))}</span>` : ""
      }`;
    case "bitmask": {
      const on = decodeBitmask(v, f.bits.length);
      const chip = (i: number, text: string) =>
        `<button class="chip ${on[i] ? "on" : ""}" aria-pressed="${on[i]}" aria-label="${esc(f.bits[i])}" data-path="${path}" data-bit="${i}" data-bits="${f.bits.length}">${esc(text)}</button>`;
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
  const summary = changed.length
    ? `${changed.length} ${changed.length === 1 ? "memory" : "memories"} changed: ${formatMemoryList(changed)}`
    : "No unsaved changes";
  return `
    <div class="status">${message() || `<span>${summary}</span>`}</div>
    <div class="actions">
      ${changed.length ? `<button class="quiet" data-action="discard-all">Discard all</button>` : ""}
      <button class="primary" data-action="review" ${changed.length ? "" : "disabled"}>Write to RC-600…</button>
    </div>`;
}

function message() {
  if (!state.message) return "";
  return `<span class="message ${state.message.tone}" role="status">${esc(state.message.text)}</span>`;
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
  if (path === "mem/MASTER.A") return `${v / 10} BPM`;
  if (path === "mem/RHYTHM.F") return BEATS[v] ?? String(v);
  return field ? displayValue(field, v) : String(v);
}

function reviewDialog() {
  const c = state.changes!;
  const items = c.changedMemories().map((n) => {
    const doc = state.memories[n - 1].current;
    const lines: string[] = [];
    if (changedIn(n, "mem/NAME.")) lines.push(`Name: ${esc(readName(doc))} → ${esc(c.name(n))}`);
    for (const [p, v] of c.changesFor(n)) {
      const d = describe(p);
      if (!d) continue;
      lines.push(`${esc(d.label)}: ${esc(formatValue(p, doc.get(p), d.field))} → ${esc(formatValue(p, v, d.field))}`);
    }
    return `<li><strong>${pad(n)} ${esc(c.name(n))}</strong><ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul></li>`;
  });
  const needsBackup = state.store instanceof DirectoryStore && !state.backupFolder;
  const d = openDialog(`
    <form method="dialog" class="review">
      <h2>Write to ${esc(state.store!.label)}</h2>
      <ol class="changelist">${items.join("")}</ol>
      ${
        needsBackup
          ? `<p>Before the first write, the editor copies every memory file to a backup folder you choose. Pick a folder on this computer, not on the pedal.</p>`
          : state.backupFolder
            ? `<p>Backup from this session: ${esc(state.backupFolder)}</p>`
            : ""
      }
      <div class="actions">
        <button value="cancel" class="quiet">Cancel</button>
        <button value="write" class="primary">${needsBackup ? "Choose backup folder and write" : "Write"}</button>
      </div>
    </form>`);
  d.querySelector<HTMLButtonElement>("[value=write]")!.addEventListener("click", (e) => {
    e.preventDefault();
    d.close();
    void write(needsBackup);
  });
}

async function write(needsBackup: boolean) {
  const store = state.store!;
  if (needsBackup && store instanceof DirectoryStore) {
    let target: FileSystemDirectoryHandle;
    try {
      target = await window.showDirectoryPicker({ id: "rc600-backup", mode: "readwrite" });
    } catch {
      return say("Nothing written: no backup folder was chosen.");
    }
    try {
      say("Backing up all memory files…");
      state.backupFolder = await store.backupTo(target);
    } catch (e) {
      return say(`Nothing written: the backup failed (${(e as Error).message}).`, "error");
    }
  }
  try {
    const written = await state.changes!.writeAll(store, (n) => say(`Writing memory ${pad(n)}…`));
    say(
      `Wrote ${written.length} ${written.length === 1 ? "memory" : "memories"}: ${formatMemoryList(written)}. Eject the drive and switch the pedal out of storage mode to load them.`,
    );
  } catch (e) {
    say(`Writing stopped: ${(e as Error).message}. Memories not listed as written still have their changes.`, "error");
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
  const target = (e.target as HTMLElement).closest<HTMLElement>("[data-action], [data-bit], [data-info]");
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
  if (target.dataset.bit && c) {
    const path = target.dataset.path!;
    const bits = decodeBitmask(c.value(state.selected, path), Number(target.dataset.bits));
    bits[Number(target.dataset.bit)] = !bits[Number(target.dataset.bit)];
    c.set(state.selected, path, encodeBitmask(bits));
    render();
    return;
  }
  switch (target.dataset.action) {
    case "open":
      return void openPedal();
    case "sandbox":
      return void load(new SandboxStore());
    case "view-memory":
    case "view-pedals":
    case "view-system":
    case "view-live":
    case "view-arranger":
      state.view = target.dataset.action!.slice(5) as State["view"];
      return render();
    case "pedal-source":
      state.pedalSource = target.dataset.source as "system" | "memory";
      return render();
    case "pedal-mode":
      state.pedalMode = Number(target.dataset.mode);
      return render();
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
  const n = state.selected;

  if (el.id === "memory") return selectMemory(Number(el.value));
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
    if (!Number.isInteger(v) || v < min || v > max) return say(`Enter a whole number from ${min} to ${max}.`, "error");
    c.set(n, el.dataset.path, v);
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

window.addEventListener("beforeunload", (e) => {
  if (state.changes?.size) e.preventDefault();
});

render();
