// Live MIDI view: a board of buttons, toggles and sliders that send MIDI to the RC-600
// over USB (Web MIDI, Chrome/Edge). Works without opening the pedal's files; the pedal
// must be in its normal mode, not USB storage mode.
//
// Mounted by main.ts into the editor area. Its state lives at module level so it survives
// main.ts re-rendering the page.

import { MESSAGE_TYPES, defaultMessage, describe, encode, isAssignableCc, type MessageType } from "./midi/messages";
import { KIND_LABELS, loadBoard, newControl, parseBoard, saveBoard, sliderValue, starterBoard, type Board, type Control, type ControlKind } from "./midi/layout";

let board: Board = loadBoard();
let editing = false;
let access: MIDIAccess | null = null;
let outputId: string | null = null;
let status = "";
let lastSent = "";
const toggles = new Map<string, boolean>();
const sliders = new Map<string, number>();
let root: HTMLElement | null = null;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

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
  const bytes = encode(c.message, value);
  if (!out) {
    lastSent = `Not sent (no MIDI output): ${describe(c.message)}`;
  } else {
    out.send(bytes);
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
  root.innerHTML = `
    <header class="pedalhead">
      <h2>Live MIDI</h2>
      <button class="${editing ? "primary" : ""}" data-live="edit">${editing ? "Done editing" : "Edit board"}</button>
    </header>
    ${connection()}
    <section class="liveboard ${editing ? "editing" : ""}" aria-label="Controls">
      ${board.controls.map(control).join("") || `<p class="note">No controls yet. Choose Edit board to add some.</p>`}
    </section>
    ${editing ? editTools() : ""}
    <p class="lastsent" aria-live="polite">${esc(lastSent)}</p>`;
}

function connection() {
  if (!access) {
    return `
      <div class="midiconnect">
        <p class="note">Connect the RC-600 to this computer by USB, in its normal mode (not USB storage). The browser asks once for permission to use MIDI.</p>
        <button class="primary" data-live="connect">Connect MIDI</button>
        ${status ? `<p class="message error">${esc(status)}</p>` : ""}
      </div>`;
  }
  const all = outputs();
  if (!all.length) {
    return `<p class="note">No MIDI outputs found. Is the RC-600 connected by USB and out of storage mode? It shows up here as soon as it's connected.</p>`;
  }
  return `
    <div class="midiconnect">
      <label>
        <span>Send to</span>
        <select data-live-field="output">${all
          .map((o) => `<option value="${esc(o.id)}" ${o.id === outputId ? "selected" : ""}>${esc(o.name ?? o.id)}</option>`)
          .join("")}</select>
      </label>
      ${
        editing
          ? `<label><span>Channel for new controls</span>
              <input type="number" min="1" max="16" value="${board.channel}" data-live-field="channel" /></label>
             <span class="hint">Match the RC-600's MIDI › RX CH › CTL.</span>`
          : ""
      }
    </div>`;
}

function control(c: Control) {
  const play =
    c.kind === "slider"
      ? `<label class="fader">
           <input type="range" min="0" max="1000" value="${Math.round((sliders.get(c.id) ?? 0) * 1000)}" data-slider="${c.id}" aria-label="${esc(c.label)}" ${editing ? "disabled" : ""} />
           <span class="ctl-label">${esc(c.label)}</span>
         </label>`
      : `<button class="pad ${c.kind === "toggle" && toggles.get(c.id) ? "on" : ""}" data-pad="${c.id}"
           ${c.kind === "toggle" ? `aria-pressed="${Boolean(toggles.get(c.id))}"` : ""} ${editing ? "disabled" : ""}>
           <span class="ctl-label">${esc(c.label)}</span>
           <span class="ctl-msg">${esc(describe(c.message))}</span>
         </button>`;
  return `<div class="ctl ctl-${c.kind}" data-id="${c.id}">${play}${editing ? editor(c) : ""}</div>`;
}

function editor(c: Control) {
  const m = c.message;
  const field = (label: string, input: string) => `<label><span>${label}</span>${input}</label>`;
  const num = (name: string, value: number, min: number, max: number) =>
    `<input type="number" min="${min}" max="${max}" value="${value}" data-edit="${name}" />`;
  const kinds = (Object.keys(KIND_LABELS) as ControlKind[])
    .map((k) => `<option value="${k}" ${k === c.kind ? "selected" : ""}>${KIND_LABELS[k]}</option>`)
    .join("");
  const types = MESSAGE_TYPES.filter((t) => c.kind !== "slider" || t.type === "cc")
    .map((t) => `<option value="${t.type}" ${t.type === m.type ? "selected" : ""}>${t.label}</option>`)
    .join("");
  const warning = m.type === "cc" && !isAssignableCc(m.controller) ? `<p class="message error">The RC-600 only reacts to CC 1–31 and 64–95.</p>` : "";
  return `
    <div class="ctl-edit">
      ${field("Label", `<input value="${esc(c.label)}" data-edit="label" maxlength="24" />`)}
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
      <div class="ctl-tools">
        <button class="quiet" data-move="-1" aria-label="Move ${esc(c.label)} earlier">← Move</button>
        <button class="quiet" data-move="1" aria-label="Move ${esc(c.label)} later">Move →</button>
        <button class="quiet danger" data-remove aria-label="Remove ${esc(c.label)}">Remove</button>
      </div>
    </div>`;
}

function editTools() {
  return `
    <section class="livetools">
      <div class="actions">
        <button data-live="add-button">Add button</button>
        <button data-live="add-toggle">Add toggle</button>
        <button data-live="add-slider">Add slider</button>
      </div>
      <div class="actions">
        <button class="quiet" data-live="export">Export board</button>
        <label class="quiet filebutton">Import board<input type="file" accept="application/json,.json" data-live-field="import" hidden /></label>
        <button class="quiet" data-live="starter">Start over</button>
      </div>
      <p class="fineprint">
        To make a CC do something on the RC-600, set an ASSIGN in the memory: source "MIDI CC#" with the same number,
        and the target you want. Program change switches memory and start/stop work without any setup.
        The board is saved in this browser; export it to use it on another computer.
      </p>
    </section>`;
}

// ---------------------------------------------------------------- events

function changed() {
  saveBoard(board);
  render();
}

function controlOf(el: HTMLElement): Control | undefined {
  const id = el.closest<HTMLElement>("[data-id]")?.dataset.id;
  return board.controls.find((c) => c.id === id);
}

document.addEventListener("pointerdown", (e) => {
  const pad = (e.target as HTMLElement).closest<HTMLElement>("[data-pad]");
  if (!pad || !root?.contains(pad) || editing) return;
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
    pad.setPointerCapture((e as PointerEvent).pointerId);
  }
});

document.addEventListener("pointerup", (e) => {
  const pad = (e.target as HTMLElement).closest<HTMLElement>("[data-pad]");
  if (!pad || !root?.contains(pad) || editing) return;
  const c = controlOf(pad);
  if (!c || c.kind !== "button") return;
  pad.classList.remove("on");
  if (c.momentary && c.message.type === "cc") send(c, c.off);
});

// Keyboard: Space/Enter on a pad acts like a press
document.addEventListener("keydown", (e) => {
  const pad = (e.target as HTMLElement).closest?.<HTMLElement>("[data-pad]");
  if (!pad || !root?.contains(pad) || editing || e.repeat || (e.key !== " " && e.key !== "Enter")) return;
  e.preventDefault();
  pad.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  if (controlOf(pad)?.kind === "button") pad.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
});

document.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  if (!el.dataset.slider || !root?.contains(el)) return;
  const c = controlOf(el);
  if (!c) return;
  const position = Number(el.value) / 1000;
  const value = sliderValue(c, position);
  if (value === sliderValue(c, sliders.get(c.id) ?? -1)) return; // only send when the CC value changes
  sliders.set(c.id, position);
  send(c, value);
});

document.addEventListener("click", (e) => {
  const el = e.target as HTMLElement;
  if (!root?.contains(el)) return;
  const action = el.closest<HTMLElement>("[data-live]")?.dataset.live;
  const c = controlOf(el);

  if (el.closest("[data-move]") && c) {
    const i = board.controls.indexOf(c);
    const j = i + Number(el.closest<HTMLElement>("[data-move]")!.dataset.move);
    if (j < 0 || j >= board.controls.length) return;
    [board.controls[i], board.controls[j]] = [board.controls[j], board.controls[i]];
    return changed();
  }
  if (el.closest("[data-remove]") && c) {
    board.controls = board.controls.filter((x) => x !== c);
    return changed();
  }
  switch (action) {
    case "connect":
      return void connect();
    case "edit":
      editing = !editing;
      return render();
    case "add-button":
    case "add-toggle":
    case "add-slider":
      board.controls.push(newControl(action.slice(4) as ControlKind, board.channel, board.controls));
      return changed();
    case "export": {
      const blob = new Blob([JSON.stringify(board, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "rc600-live-board.json";
      a.click();
      URL.revokeObjectURL(a.href);
      return;
    }
    case "starter":
      if (confirm("Replace this board with the starter board (memories 1–3, start, stop)?")) {
        board = starterBoard();
        return changed();
      }
      return;
  }
});

document.addEventListener("change", async (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  if (!root?.contains(el)) return;
  const f = el.dataset.liveField;
  if (f === "output") {
    outputId = el.value;
    return;
  }
  if (f === "channel") {
    const ch = Number(el.value);
    if (ch >= 1 && ch <= 16) board.channel = ch;
    return changed();
  }
  if (f === "import") {
    const file = (el as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      board = parseBoard(JSON.parse(await file.text()));
      lastSent = `Loaded ${board.controls.length} controls from ${file.name}.`;
      return changed();
    } catch (err) {
      lastSent = `Couldn't load ${file.name}: ${(err as Error).message}`;
      return render();
    }
  }

  const c = controlOf(el);
  const key = el.dataset.edit;
  if (!c || !key) return;
  const n = Number(el.value);
  const ok = (lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi;
  switch (key) {
    case "label":
      c.label = el.value.trim() || c.label;
      break;
    case "kind":
      c.kind = el.value as ControlKind;
      if (c.kind === "slider" && c.message.type !== "cc") c.message = { ...defaultMessage("cc", board.channel), controller: 1 } as Control["message"];
      c.momentary = c.kind === "button";
      break;
    case "type":
      c.message = defaultMessage(el.value as MessageType, "channel" in c.message ? c.message.channel : board.channel);
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

