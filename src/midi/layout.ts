// Live MIDI boards: buttons, toggles and sliders on a grid, each sending one MIDI message.
// Several named boards, one current; saved in this browser (localStorage), so they survive a
// restart, and exportable as JSON for another computer or tablet.

import { defaultMessage, type MidiMessage } from "./messages";

export type ControlKind = "button" | "toggle" | "slider";

/** Colors for quick recognition; the CSS defines each for light and dark themes. */
export const COLORS = ["blue", "teal", "green", "amber", "red", "purple", "grey"] as const;
export type Color = (typeof COLORS)[number];

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
  color: Color;
  /** Place on the board grid: column, row (0-based) and size in cells. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Board {
  id: string;
  name: string;
  channel: number; // default channel for new controls: the RC-600's RX CTL channel
  cols: number;
  rows: number;
  controls: Control[];
}

export interface Library {
  version: 2;
  current: string;
  boards: Board[];
}

export const KIND_LABELS: Record<ControlKind, string> = { button: "Button", toggle: "Toggle", slider: "Slider" };

const STORAGE_KEY = "rc600-editor.live-boards";
const OLD_KEY = "rc600-editor.live-board"; // version 1: a single board without layout

export const newId = () => Math.random().toString(36).slice(2, 10);
export const GRID_MAX = 12;

/** Whether a w×h control fits at x,y without leaving the grid or covering another control. */
export function fits(board: Board, x: number, y: number, w: number, h: number, ignore?: string): boolean {
  if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > board.cols || y + h > board.rows) return false;
  return !board.controls.some((c) => c.id !== ignore && x < c.x + c.w && c.x < x + w && y < c.y + c.h && c.y < y + h);
}

/** First free spot for a w×h control, adding rows when the board is full. */
export function freeSpot(board: Board, w: number, h: number): { x: number; y: number } {
  for (;;) {
    for (let y = 0; y + h <= board.rows; y++) for (let x = 0; x + w <= board.cols; x++) if (fits(board, x, y, w, h)) return { x, y };
    if (board.rows >= GRID_MAX) return { x: 0, y: 0 };
    board.rows++;
  }
}

export function newControl(kind: ControlKind, board: Board): Control {
  // Next free CC the RC-600 accepts for ASSIGN, starting at 1
  const used = new Set(board.controls.flatMap((c) => (c.message.type === "cc" ? [c.message.controller] : [])));
  const cc = [...Array.from({ length: 31 }, (_, i) => i + 1), ...Array.from({ length: 32 }, (_, i) => i + 64)].find((n) => !used.has(n)) ?? 1;
  const w = 1;
  const h = kind === "slider" ? Math.min(2, board.rows) : 1;
  const { x, y } = freeSpot(board, w, h);
  return {
    id: newId(),
    kind,
    label: `${KIND_LABELS[kind]} ${board.controls.length + 1}`,
    message: { ...defaultMessage("cc", board.channel), controller: cc } as MidiMessage,
    on: 127,
    off: 0,
    momentary: kind === "button",
    color: COLORS[board.controls.length % COLORS.length],
    x,
    y,
    w,
    h,
  };
}

/** Starting board: memory switching and start/stop, which work without any ASSIGN on the pedal. */
export function starterBoard(): Board {
  const base = { on: 127, off: 0, momentary: false, kind: "button" as const, w: 1, h: 1 };
  const pc = (n: number, x: number): Control => ({ ...base, id: `mem${n}`, label: `Memory ${String(n).padStart(2, "0")}`, message: { type: "pc", channel: 1, program: n }, color: "blue", x, y: 0 });
  return {
    id: newId(),
    name: "Starter",
    channel: 1,
    cols: 4,
    rows: 2,
    controls: [
      pc(1, 0),
      pc(2, 1),
      pc(3, 2),
      { ...base, id: "start", label: "Start", message: { type: "start" }, color: "green", x: 0, y: 1, w: 2 },
      { ...base, id: "stop", label: "Stop", message: { type: "stop" }, color: "red", x: 2, y: 1, w: 2 },
    ],
  };
}

const inRange = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

/** Check and normalise one board (from storage or a file, version 1 or 2). Throws with a readable message. */
export function parseBoard(json: unknown): Board {
  const b = json as Partial<Board> & { version?: number };
  if (!b || !Array.isArray(b.controls) || (b.version !== undefined && b.version !== 1 && b.version !== 2)) {
    throw new Error("This isn't an RC-600 Editor control board file.");
  }
  const board: Board = {
    id: typeof b.id === "string" ? b.id : newId(),
    name: typeof b.name === "string" && b.name.trim() ? b.name : "Board",
    channel: inRange(b.channel, 1, 16) ? b.channel! : 1,
    cols: inRange(b.cols, 1, GRID_MAX) ? b.cols! : 6,
    rows: inRange(b.rows, 1, GRID_MAX) ? b.rows! : 4,
    controls: [],
  };
  b.controls.forEach((c, i) => {
    if (!c || !["button", "toggle", "slider"].includes(c.kind) || !c.message) throw new Error(`Control ${i + 1} is damaged.`);
    const control: Control = {
      id: String(c.id ?? newId()),
      kind: c.kind,
      label: String(c.label ?? ""),
      message: c.message,
      on: inRange(c.on, 0, 127) ? c.on : 127,
      off: inRange(c.off, 0, 127) ? c.off : 0,
      momentary: Boolean(c.momentary),
      color: COLORS.includes(c.color) ? c.color : COLORS[i % COLORS.length],
      x: 0,
      y: 0,
      w: inRange(c.w, 1, GRID_MAX) ? c.w : 1,
      h: inRange(c.h, 1, GRID_MAX) ? c.h : c.kind === "slider" ? 2 : 1,
    };
    // Keep the saved place when it's free; otherwise (or for version 1 boards) find one
    if (inRange(c.x, 0, GRID_MAX - 1) && inRange(c.y, 0, GRID_MAX - 1) && fits(board, c.x, c.y, control.w, control.h)) {
      control.x = c.x;
      control.y = c.y;
    } else {
      control.w = Math.min(control.w, board.cols);
      control.h = Math.min(control.h, board.rows);
      Object.assign(control, freeSpot(board, control.w, control.h));
    }
    board.controls.push(control);
  });
  return board;
}

export function loadLibrary(): Library {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const lib = JSON.parse(raw) as Library;
      const boards = lib.boards.map(parseBoard);
      if (boards.length) return { version: 2, current: boards.some((b) => b.id === lib.current) ? lib.current : boards[0].id, boards };
    }
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const board = parseBoard(JSON.parse(old));
      board.name = "My board";
      return { version: 2, current: board.id, boards: [board] };
    }
  } catch {
    // damaged or blocked storage: start fresh
  }
  const board = starterBoard();
  return { version: 2, current: board.id, boards: [board] };
}

export function saveLibrary(lib: Library): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lib));
  } catch {
    // storage blocked (private window): the boards still work for this session
  }
}

/** Slider position 0–1 → CC value between `off` (bottom) and `on` (top). */
export const sliderValue = (c: Control, position: number) => Math.round(c.off + (c.on - c.off) * position);
