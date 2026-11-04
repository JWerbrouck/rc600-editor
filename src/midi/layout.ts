// The user's live control board: buttons, toggles and sliders, each sending one MIDI
// message. Saved in this browser (localStorage) and exportable as a JSON file, so the
// same board can be loaded on another computer or tablet.

import { defaultMessage, type MidiMessage } from "./messages";

export type ControlKind = "button" | "toggle" | "slider";

export interface Control {
  id: string;
  kind: ControlKind;
  label: string;
  message: MidiMessage;
  /** CC values: button sends `on` while pressed and `off` on release; toggle alternates; slider ranges between them. */
  on: number;
  off: number;
  /** Button only: send `off` on release (momentary). Otherwise only `on` is sent. */
  momentary: boolean;
}

export interface Board {
  version: 1;
  channel: number; // default channel for new controls: the RC-600's RX CTL channel
  controls: Control[];
}

export const KIND_LABELS: Record<ControlKind, string> = { button: "Button", toggle: "Toggle", slider: "Slider" };

const STORAGE_KEY = "rc600-editor.live-board";

export function newControl(kind: ControlKind, channel: number, existing: Control[]): Control {
  // Pick the next free CC the RC-600 accepts for ASSIGN, starting at 1
  const used = new Set(existing.flatMap((c) => (c.message.type === "cc" ? [c.message.controller] : [])));
  const cc = [...Array.from({ length: 31 }, (_, i) => i + 1), ...Array.from({ length: 32 }, (_, i) => i + 64)].find((n) => !used.has(n)) ?? 1;
  const message = { ...defaultMessage("cc", channel), controller: cc } as MidiMessage;
  return {
    id: Math.random().toString(36).slice(2, 10),
    kind,
    label: `${kind === "slider" ? "Slider" : kind === "toggle" ? "Toggle" : "Button"} ${existing.length + 1}`,
    message,
    on: 127,
    off: 0,
    momentary: kind === "button",
  };
}

export function emptyBoard(): Board {
  return { version: 1, channel: 1, controls: [] };
}

/** Starting board: memory switching and start/stop, which work without any ASSIGN on the pedal. */
export function starterBoard(): Board {
  const b = emptyBoard();
  const pc = (n: number): Control => ({
    id: `mem${n}`,
    kind: "button",
    label: `Memory ${String(n).padStart(2, "0")}`,
    message: { type: "pc", channel: 1, program: n },
    on: 127,
    off: 0,
    momentary: false,
  });
  b.controls = [
    pc(1),
    pc(2),
    pc(3),
    { id: "start", kind: "button", label: "Start", message: { type: "start" }, on: 127, off: 0, momentary: false },
    { id: "stop", kind: "button", label: "Stop", message: { type: "stop" }, on: 127, off: 0, momentary: false },
  ];
  return b;
}

/** Check and normalise a board from storage or an imported file. Throws with a readable message. */
export function parseBoard(json: unknown): Board {
  const b = json as Partial<Board>;
  if (!b || b.version !== 1 || !Array.isArray(b.controls)) throw new Error("This isn't an RC-600 Editor control board file.");
  const channel = inRange(b.channel, 1, 16) ? b.channel! : 1;
  const controls = b.controls.map((c, i) => {
    if (!c || !["button", "toggle", "slider"].includes(c.kind) || !c.message) throw new Error(`Control ${i + 1} is damaged.`);
    return {
      id: String(c.id ?? i),
      kind: c.kind,
      label: String(c.label ?? ""),
      message: c.message,
      on: inRange(c.on, 0, 127) ? c.on : 127,
      off: inRange(c.off, 0, 127) ? c.off : 0,
      momentary: Boolean(c.momentary),
    } as Control;
  });
  return { version: 1, channel, controls };
}

const inRange = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

export function loadBoard(): Board {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseBoard(JSON.parse(raw)) : starterBoard();
  } catch {
    return starterBoard();
  }
}

export function saveBoard(board: Board): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
  } catch {
    // storage blocked (private window): the board still works for this session
  }
}

/** Slider position 0–1 → CC value between `off` (bottom) and `on` (top). */
export const sliderValue = (c: Control, position: number) => Math.round(c.off + (c.on - c.off) * position);
