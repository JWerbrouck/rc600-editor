// Live MIDI view: boards of buttons, toggles and sliders that send MIDI to the RC-600 over USB
// (Web MIDI, Chrome/Edge). Works without opening the pedal's files; the pedal must be in its
// normal mode, not USB storage mode.
//
// The board fills the screen as a grid. In edit mode, drag a control to move it, drag its
// corner to resize it, and tap it to edit it in the side panel.
//
// Mounted by main.ts into the editor area. State lives at module level so it survives
// main.ts re-rendering the page.

import { MESSAGE_TYPES, defaultMessage, describe, encode, isAssignableCc, type MessageType } from "./midi/messages";
import {
  COLORS,
  GRID_MAX,
  KIND_LABELS,
  fits,
  freeSpot,
  loadLibrary,
  newControl,
  newId,
  parseBoard,
  saveLibrary,
  sliderValue,

  type Board,
  type Color,
  type Control,
  type ControlKind,
} from "./midi/layout";

let lib = loadLibrary();
let editing = false;
let selectedId: string | null = null;
let access: MIDIAccess | null = null;
let outputId: string | null = null;
let status = "";
let lastSent = "";
const toggles = new Map<string, boolean>();
const sliders = new Map<string, number>();
let root: HTMLElement | null = null;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const board = (): Board => lib.boards.find((b) => b.id === lib.current) ?? lib.boards[0];
const selected = () => board().controls.find((c) => c.id === selectedId) ?? null;

// ---------------------------------------------------------------- MIDI

async function connect() {
  if (!navigator.requestMIDIAccess) {
    status = "This browser can't send MIDI. Use Chrome or Edge.";
    return render();
  }
  try {
    access = await navigator.requestMIDIAccess();
  } catch {
    status = "MIDI access was blocked. Allow MIDI for this page in the browser's site settings, then try again.";
    return render();
  }
  access.onstatechange = () => {
    pickOutput();
    render();
  };
  pickOutput();
  render();
}

function outputs(): MIDIOutput[] {
  return access ? [...access.outputs.values()] : [];
}

/** Keep the chosen port if it's still there, else prefer one named RC-600. */
function pickOutput() {
  const all = outputs();
  if (outputId && all.some((o) => o.id === outputId)) return;
  outputId = (all.find((o) => /RC-?600/i.test(o.name ?? "")) ?? all[0])?.id ?? null;
}

function send(c: Control, value: number) {
  const out = outputs().find((o) => o.id === outputId);
  if (!out) {
    lastSent = `Not sent (no MIDI output): ${describe(c.message)}`;
  } else {
    out.send(encode(c.message, value));
    lastSent = `${c.label}: ${describe(c.message)}${c.message.type === "cc" ? ` = ${value}` : ""}`;
  }
  const log = root?.querySelector(".lastsent");
  if (log) log.textContent = lastSent;
}

// ---------------------------------------------------------------- rendering

export function mountLive(el: HTMLElement) {
  root = el;
  render();
}

function render() {
  if (!root || !root.isConnected) return;
  const b = board();
  const focused = document.activeElement?.id;
  root.innerHTML = `
    <div class="livewrap ${editing ? "editing" : ""}">
      <header class="livebar">
        <label class="boardpick"><span class="sr">Board</span>
          <select id="live-board" data-live-field="board">${lib.boards
            .map((x) => `<option value="${x.id}" ${x.id === b.id ? "selected" : ""}>${esc(x.name)}</option>`)
            .join("")}</select>
        </label>
        ${connection()}
        <span class="lastsent" aria-live="polite">${esc(lastSent || status)}</span>
        <button class="${editing ? "primary" : ""}" data-live="edit">${editing ? "Done" : "Edit board"}</button>
      </header>
      <div class="livemain">
        <section class="liveboard" aria-label="Controls" style="grid-template-columns: repeat(${b.cols}, minmax(0, 1fr)); grid-template-rows: repeat(${b.rows}, minmax(0, 1fr))">
          ${editing ? gridCells(b) : ""}
          ${b.controls.map(control).join("")}
          ${!b.controls.length ? `<p class="note emptynote">No controls yet. Choose Edit board to add some.</p>` : ""}
        </section>
        ${editing ? `<aside class="sidepanel liveside">${selected() ? controlEditor(selected()!) : boardEditor(b)}</aside>` : ""}
      </div>
    </div>`;
  if (focused) document.getElementById(focused)?.focus();
}

/** Empty cells drawn behind the controls while editing, so the grid is visible. */
function gridCells(b: Board) {
  let out = "";
  for (let y = 0; y < b.rows; y++) for (let x = 0; x < b.cols; x++) out += `<span class="cell" style="grid-column:${x + 1};grid-row:${y + 1}"></span>`;
  return out;
}

function connection() {
  if (!access) return `<button class="quiet" data-live="connect">Connect MIDI</button>`;
  const all = outputs();
  if (!all.length) return `<span class="note">No MIDI output. Is the RC-600 connected, out of storage mode?</span>`;
  return `<label class="outpick"><span class="sr">Send to</span><select data-live-field="output">${all
    .map((o) => `<option value="${esc(o.id)}" ${o.id === outputId ? "selected" : ""}>${esc(o.name ?? o.id)}</option>`)
    .join("")}</select></label>`;
}

/** A broad, touch-friendly fader: a recessed channel filled from the bottom, with a wide cap. */
function fader(c: Control) {
  const pos = sliders.get(c.id) ?? 0;
  const value = sliderValue(c, pos);
  return `
    <div class="fader">
      <span class="fader-value" data-fader-value>${value}</span>
      <div class="fader-channel" data-fader="${c.id}" role="slider" tabindex="${editing ? -1 : 0}" aria-label="${esc(c.label)}"
        aria-valuemin="${Math.min(c.off, c.on)}" aria-valuemax="${Math.max(c.off, c.on)}" aria-valuenow="${value}" style="--pos: ${pos}">
        <span class="fader-fill"></span>
        <span class="fader-cap"></span>
      </div>
      <span class="ctl-label">${esc(c.label)}</span>
    </div>`;
}

function control(c: Control) {
  const place = `grid-column:${c.x + 1} / span ${c.w};grid-row:${c.y + 1} / span ${c.h}`;
  const isSel = editing && c.id === selectedId;
  const inner =
    c.kind === "slider"
      ? fader(c)
      : `<button class="pad ${c.kind === "toggle" && toggles.get(c.id) ? "on" : ""}" data-pad="${c.id}"
           ${c.kind === "toggle" ? `aria-pressed="${Boolean(toggles.get(c.id))}"` : ""} ${editing ? 'tabindex="-1"' : ""}>
           <span class="led" aria-hidden="true"></span>
           <span class="ctl-label">${esc(c.label)}</span>
           <span class="ctl-msg">${esc(describe(c.message))}</span>
         </button>`;
  return `
    <div class="ctl ctl-${c.kind} ${isSel ? "selected" : ""}" data-id="${c.id}" data-color="${c.color}" style="${place}">
      ${inner}
      ${editing ? `<span class="resize" data-resize aria-hidden="true"></span>` : ""}
    </div>`;
}

const field = (label: string, input: string) => `<label class="lfield"><span>${label}</span>${input}</label>`;

function controlEditor(c: Control) {
  const m = c.message;
  const num = (name: string, value: number, min: number, max: number) => `<input type="number" min="${min}" max="${max}" value="${value}" data-edit="${name}" />`;
  const kinds = (Object.keys(KIND_LABELS) as ControlKind[]).map((k) => `<option value="${k}" ${k === c.kind ? "selected" : ""}>${KIND_LABELS[k]}</option>`).join("");
  const types = MESSAGE_TYPES.filter((t) => c.kind !== "slider" || t.type === "cc")
    .map((t) => `<option value="${t.type}" ${t.type === m.type ? "selected" : ""}>${t.label}</option>`)
    .join("");
  const warning = m.type === "cc" && !isAssignableCc(m.controller) ? `<p class="message error">The RC-600 only reacts to CC 1–31 and 64–95.</p>` : "";
  return `
    <header class="panelhead"><h3>${esc(c.label || "Control")}</h3><button class="quiet" data-live="deselect">Board settings</button></header>
    ${field("Label", `<input id="live-label" value="${esc(c.label)}" data-edit="label" maxlength="24" />`)}
    <div class="lfield"><span>Color</span><div class="swatches" role="group" aria-label="Color">${COLORS.map(
      (col) => `<button class="swatch" data-color="${col}" data-swatch="${col}" aria-pressed="${col === c.color}" aria-label="${col}"></button>`,
    ).join("")}</div></div>
    ${field("Type", `<select data-edit="kind">${kinds}</select>`)}
    ${field("Sends", `<select data-edit="type">${types}</select>`)}
    ${"channel" in m ? field("Channel", num("channel", m.channel, 1, 16)) : ""}
    ${m.type === "cc" ? field("CC number", num("controller", m.controller, 0, 127)) : ""}
    ${m.type === "pc" ? field("Memory", num("program", m.program, 1, 128)) : ""}
    ${
      m.type === "cc"
        ? `${field(c.kind === "slider" ? "Top value" : "On value", num("on", c.on, 0, 127))}
           ${field(c.kind === "slider" ? "Bottom value" : "Off value", num("off", c.off, 0, 127))}
           ${c.kind === "button" ? `<label class="check"><input type="checkbox" data-edit="momentary" ${c.momentary ? "checked" : ""} /> Send off value on release</label>` : ""}`
        : ""
    }
    ${warning}
    <p class="fineprint">Drag the control to move it; drag its corner to resize it. For a CC to do something, set an ASSIGN in the memory with source "MIDI CC#" and the same number (Assign view).</p>
    <div class="actions">
      <button class="quiet" data-live="duplicate">Duplicate</button>
      <button class="quiet danger" data-live="remove">Remove</button>
    </div>`;
}

function boardEditor(b: Board) {
  return `
    <h3>Board</h3>
    ${field("Name", `<input id="live-name" value="${esc(b.name)}" data-live-field="name" maxlength="30" />`)}
    <div class="lfield"><span>Grid</span><span class="gridsize">
      <input type="number" min="1" max="${GRID_MAX}" value="${b.cols}" data-live-field="cols" aria-label="Columns" /> columns ×
      <input type="number" min="1" max="${GRID_MAX}" value="${b.rows}" data-live-field="rows" aria-label="Rows" /> rows</span></div>
    ${field("Channel for new controls", `<input type="number" min="1" max="16" value="${b.channel}" data-live-field="channel" />`)}
    <p class="fineprint">Match the RC-600's System › MIDI › receive channel (control).</p>
    <div class="actions addrow">
      <button data-live="add-button">Add button</button>
      <button data-live="add-toggle">Add toggle</button>
      <button data-live="add-slider">Add slider</button>
    </div>
    <p class="fineprint">Tap a control to edit it. Drag it to move it, drag its corner to resize it.</p>
    <h3>Boards</h3>
    <div class="actions">
      <button class="quiet" data-live="new-board">New board</button>
      <button class="quiet" data-live="duplicate-board">Duplicate board</button>
      <button class="quiet" data-live="export">Export board</button>
      <label class="quiet filebutton">Import board<input type="file" accept="application/json,.json" data-live-field="import" hidden /></label>
      ${lib.boards.length > 1 ? `<button class="quiet danger" data-live="delete-board">Delete board</button>` : ""}
    </div>
    <p class="fineprint">Boards are saved in this browser and stay after a restart. Export a board to use it on another computer.</p>`;
}

// ---------------------------------------------------------------- events

function changed() {
  saveLibrary(lib);
  render();
}

function controlOf(el: HTMLElement): Control | undefined {
  const id = el.closest<HTMLElement>("[data-id]")?.dataset.id;
  return board().controls.find((c) => c.id === id);
}

/** Keep receiving a pointer's events while it's dragged off the element (not possible for every pointer). */
function capture(el: HTMLElement, pointerId: number) {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // not an active pointer (e.g. synthetic); the document-level move/up handlers still work
  }
}

const inRoot = (el: EventTarget | null): el is HTMLElement => el instanceof HTMLElement && Boolean(root?.contains(el));

// Playing: pads respond on press (and release for momentary buttons)
document.addEventListener("pointerdown", (e) => {
  const pad = (e.target as HTMLElement).closest<HTMLElement>("[data-pad]");
  if (!pad || !inRoot(pad) || editing) return;
  const c = controlOf(pad);
  if (!c) return;
  if (c.kind === "toggle") {
    const on = !toggles.get(c.id);
    toggles.set(c.id, on);
    pad.classList.toggle("on", on);
    pad.setAttribute("aria-pressed", String(on));
    send(c, on ? c.on : c.off);
  } else {
    pad.classList.add("on");
    send(c, c.on);
    capture(pad, (e as PointerEvent).pointerId);
  }
});

document.addEventListener("pointerup", (e) => {
  const pad = (e.target as HTMLElement).closest<HTMLElement>("[data-pad]");
  if (!pad || !inRoot(pad) || editing) return;
  const c = controlOf(pad);
  if (!c || c.kind !== "button") return;
  pad.classList.remove("on");
  if (c.momentary && c.message.type === "cc") send(c, c.off);
});

// Keyboard: Space/Enter on a pad acts like a press
document.addEventListener("keydown", (e) => {
  const pad = (e.target as HTMLElement).closest?.<HTMLElement>("[data-pad]");
  if (!pad || !inRoot(pad) || editing || e.repeat || (e.key !== " " && e.key !== "Enter")) return;
  e.preventDefault();
  pad.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  if (controlOf(pad)?.kind === "button") pad.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
});

/** Move a fader to position 0–1: update it on screen, and send when the CC value changes. */
function setFader(channel: HTMLElement, position: number) {
  const c = controlOf(channel);
  if (!c) return;
  const p = Math.max(0, Math.min(1, position));
  const before = sliderValue(c, sliders.get(c.id) ?? -1);
  sliders.set(c.id, p);
  const value = sliderValue(c, p);
  channel.style.setProperty("--pos", String(p));
  channel.setAttribute("aria-valuenow", String(value));
  const readout = channel.closest(".fader")?.querySelector("[data-fader-value]");
  if (readout) readout.textContent = String(value);
  if (value !== before) send(c, value);
}

const faderPosition = (channel: HTMLElement, clientY: number) => {
  const r = channel.getBoundingClientRect();
  return 1 - (clientY - r.top) / r.height;
};

let faderDrag: HTMLElement | null = null;
document.addEventListener("pointerdown", (e) => {
  const channel = (e.target as HTMLElement).closest<HTMLElement>("[data-fader]");
  if (!channel || !inRoot(channel) || editing) return;
  faderDrag = channel;
  capture(channel, e.pointerId);
  channel.classList.add("active");
  setFader(channel, faderPosition(channel, e.clientY));
  e.preventDefault();
});
document.addEventListener("pointermove", (e) => {
  if (faderDrag) setFader(faderDrag, faderPosition(faderDrag, e.clientY));
});
document.addEventListener("pointerup", () => {
  faderDrag?.classList.remove("active");
  faderDrag = null;
});
// Keyboard: arrows move one CC step, Page Up/Down ten, Home/End to the ends
document.addEventListener("keydown", (e) => {
  const channel = (e.target as HTMLElement).closest?.<HTMLElement>("[data-fader]");
  if (!channel || !inRoot(channel) || editing) return;
  const c = controlOf(channel);
  if (!c) return;
  const step = 1 / Math.max(1, Math.abs(c.on - c.off));
  const p = sliders.get(c.id) ?? 0;
  const moves: Record<string, number> = { ArrowUp: p + step, ArrowRight: p + step, ArrowDown: p - step, ArrowLeft: p - step, PageUp: p + 10 * step, PageDown: p - 10 * step, Home: 0, End: 1 };
  if (!(e.key in moves)) return;
  e.preventDefault();
  setFader(channel, moves[e.key]);
});

// Editing: drag a control to move it, drag its corner to resize it, tap to select it
let drag: { id: string; mode: "move" | "resize"; grabX: number; grabY: number; startX: number; startY: number; moved: boolean; ghost: HTMLElement } | null = null;

function cellAt(e: PointerEvent): { x: number; y: number } {
  const grid = root!.querySelector<HTMLElement>(".liveboard")!;
  const r = grid.getBoundingClientRect();
  const b = board();
  return {
    x: Math.max(0, Math.min(b.cols - 1, Math.floor(((e.clientX - r.left) / r.width) * b.cols))),
    y: Math.max(0, Math.min(b.rows - 1, Math.floor(((e.clientY - r.top) / r.height) * b.rows))),
  };
}

/** Where control c would go for the pointer over `cell` during drag d. */
function target(c: Control, cell: { x: number; y: number }, d: NonNullable<typeof drag>) {
  return d.mode === "move"
    ? { x: cell.x - d.grabX, y: cell.y - d.grabY, w: c.w, h: c.h }
    : { x: c.x, y: c.y, w: Math.max(1, cell.x - c.x + 1), h: Math.max(1, cell.y - c.y + 1) };
}

document.addEventListener("pointerdown", (e) => {
  if (!editing || !inRoot(e.target)) return;
  const el = e.target as HTMLElement;
  const ctl = el.closest<HTMLElement>(".liveboard .ctl");
  if (!ctl) return;
  const c = controlOf(ctl)!;
  const cell = cellAt(e);
  const ghost = document.createElement("span");
  ghost.className = "ghost";
  ghost.style.cssText = `grid-column:${c.x + 1} / span ${c.w};grid-row:${c.y + 1} / span ${c.h}`;
  root!.querySelector(".liveboard")!.appendChild(ghost);
  drag = { id: c.id, mode: el.closest("[data-resize]") ? "resize" : "move", grabX: cell.x - c.x, grabY: cell.y - c.y, startX: e.clientX, startY: e.clientY, moved: false, ghost };
  capture(ctl, e.pointerId);
  e.preventDefault();
});

document.addEventListener("pointermove", (e) => {
  if (!drag) return;
  if (Math.abs(e.clientX - drag.startX) + Math.abs(e.clientY - drag.startY) > 6) drag.moved = true;
  if (!drag.moved) return;
  const c = board().controls.find((x) => x.id === drag!.id)!;
  const t = target(c, cellAt(e), drag);
  const ok = fits(board(), t.x, t.y, t.w, t.h, c.id);
  drag.ghost.style.cssText = `grid-column:${Math.max(0, t.x) + 1} / span ${t.w};grid-row:${Math.max(0, t.y) + 1} / span ${t.h}`;
  drag.ghost.classList.toggle("blocked", !ok);
});

document.addEventListener("pointerup", (e) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  d.ghost.remove();
  const c = board().controls.find((x) => x.id === d.id);
  if (!c) return;
  if (!d.moved) {
    selectedId = selectedId === c.id ? null : c.id;
    return render();
  }
  const t = target(c, cellAt(e), d);
  if (fits(board(), t.x, t.y, t.w, t.h, c.id)) Object.assign(c, t);
  selectedId = c.id;
  changed();
});

document.addEventListener("click", (e) => {
  const el = e.target as HTMLElement;
  if (!inRoot(el)) return;
  const swatch = el.closest<HTMLElement>("[data-swatch]");
  if (swatch && selected()) {
    selected()!.color = swatch.dataset.swatch as Color;
    return changed();
  }
  const b = board();
  switch (el.closest<HTMLElement>("[data-live]")?.dataset.live) {
    case "connect":
      return void connect();
    case "edit":
      editing = !editing;
      selectedId = null;
      return render();
    case "deselect":
      selectedId = null;
      return render();
    case "add-button":
    case "add-toggle":
    case "add-slider": {
      const kind = el.closest<HTMLElement>("[data-live]")!.dataset.live!.slice(4) as ControlKind;
      const c = newControl(kind, b);
      b.controls.push(c);
      selectedId = c.id;
      return changed();
    }
    case "duplicate": {
      const c = selected();
      if (!c) return;
      const copy = { ...structuredClone(c), id: newId(), label: `${c.label} copy` };
      const spot = freeSpot(b, c.w, c.h); // adds rows when the board is full
      if (!fits(b, spot.x, spot.y, c.w, c.h)) {
        status = "No room for a copy of that size. Make the grid bigger or the control smaller.";
        lastSent = "";
        return render();
      }
      Object.assign(copy, spot);
      b.controls.push(copy);
      selectedId = copy.id;
      return changed();
    }
    case "remove":
      b.controls = b.controls.filter((c) => c.id !== selectedId);
      selectedId = null;
      return changed();
    case "new-board": {
      const nb: Board = { id: newId(), name: `Board ${lib.boards.length + 1}`, channel: b.channel, cols: 4, rows: 3, controls: [] };
      lib.boards.push(nb);
      lib.current = nb.id;
      selectedId = null;
      return changed();
    }
    case "duplicate-board": {
      const copy: Board = { ...structuredClone(b), id: newId(), name: `${b.name} copy` };
      lib.boards.push(copy);
      lib.current = copy.id;
      return changed();
    }
    case "delete-board":
      if (lib.boards.length < 2 || !confirm(`Delete the board "${b.name}"?`)) return;
      lib.boards = lib.boards.filter((x) => x.id !== b.id);
      lib.current = lib.boards[0].id;
      selectedId = null;
      return changed();
    case "export": {
      const blob = new Blob([JSON.stringify({ version: 2, ...b }, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `rc600-board-${b.name.replace(/[^\w-]+/g, "-").toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      return;
    }
  }
});

document.addEventListener("change", async (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  if (!inRoot(el)) return;
  const b = board();
  const f = el.dataset.liveField;
  const n = Number(el.value);
  const ok = (lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi;
  switch (f) {
    case "board":
      lib.current = el.value;
      selectedId = null;
      toggles.clear();
      sliders.clear();
      return changed();
    case "output":
      outputId = el.value;
      return;
    case "name":
      b.name = el.value.trim() || b.name;
      return changed();
    case "channel":
      if (ok(1, 16)) b.channel = n;
      return changed();
    case "cols":
    case "rows": {
      if (!ok(1, GRID_MAX)) return render();
      // Shrinking must keep every control on the board
      const need = Math.max(0, ...b.controls.map((c) => (f === "cols" ? c.x + c.w : c.y + c.h)));
      if (n < need) {
        status = `Move or shrink the controls first: they use ${need} ${f === "cols" ? "columns" : "rows"}.`;
        lastSent = "";
        return render();
      }
      b[f] = n;
      return changed();
    }
    case "import": {
      const file = (el as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const imported = parseBoard(JSON.parse(await file.text()));
        imported.id = newId();
        lib.boards.push(imported);
        lib.current = imported.id;
        lastSent = `Loaded "${imported.name}" with ${imported.controls.length} controls from ${file.name}.`;
        return changed();
      } catch (err) {
        lastSent = `Couldn't load ${file.name}: ${(err as Error).message}`;
        return render();
      }
    }
  }

  const c = selected();
  const key = el.dataset.edit;
  if (!c || !key) return;
  switch (key) {
    case "label":
      c.label = el.value.trim() || c.label;
      break;
    case "kind":
      c.kind = el.value as ControlKind;
      if (c.kind === "slider" && c.message.type !== "cc") c.message = { ...defaultMessage("cc", b.channel), controller: 1 } as Control["message"];
      c.momentary = c.kind === "button";
      break;
    case "type":
      c.message = defaultMessage(el.value as MessageType, "channel" in c.message ? c.message.channel : b.channel);
      break;
    case "channel":
      if (ok(1, 16) && "channel" in c.message) c.message.channel = n;
      break;
    case "controller":
      if (ok(0, 127) && c.message.type === "cc") c.message.controller = n;
      break;
    case "program":
      if (ok(1, 128) && c.message.type === "pc") c.message.program = n;
      break;
    case "on":
    case "off":
      if (ok(0, 127)) c[key] = n;
      break;
    case "momentary":
      c.momentary = (el as HTMLInputElement).checked;
      break;
  }
  changed();
});
