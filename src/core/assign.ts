// ASSIGN 1–16 of a memory (<mem> ASSIGNn): a source (switch, pedal, MIDI CC…) controls a
// target (a function or setting) between a min and max value. Decoded in round 4 (TESTS.md):
//   A on/off   B source   D source mode (0 momentary, 1 toggle)   E/F source active range low/high
//   G target   I/J target min/max   C, H unknown (always 0 so far; left alone)
//
// Sources and targets are numbered in the Parameter Guide's order (pp. 26–29), with the
// "TRK1–6" and "IN FX A–D" style rows expanded per track or per FX. Checked against the pedal:
// sources CC#20 = 65, EXP1 = 44, PEDAL4 MODE2 = 25, CTL3 = 42; targets TRK2 LEVEL = 21,
// TEMPO = 82, IN FX B = 104, RHYTHM LEVEL = 728. (cjbagwell/rc600-editor's list has the same
// order, with one extra IMM ALL START/STOP after ALL ST/STP that this pedal doesn't have there.)

import type { Field } from "./schema";

export const ASSIGNS = Array.from({ length: 16 }, (_, i) => i + 1);
export const assignPath = (n: number, key: string) => `mem/ASSIGN${n}.${key}`;

const TRACKS = [1, 2, 3, 4, 5, 6];
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

export interface Option {
  name: string;
  group: string;
}

/** Sources by number. */
export const SOURCES: Option[] = [
  ...TRACKS.map((t) => ({ name: `Track ${t} starts recording/overdub`, group: "Track events" })),
  ...TRACKS.map((t) => ({ name: `Track ${t} goes to play/stop`, group: "Track events" })),
  { name: "All start/stop from MIDI", group: "Track events" },
  ...[1, 2, 3].flatMap((m) => range(1, 9).map((p) => ({ name: `Pedal ${p}, mode ${m}`, group: "Footswitches" }))),
  ...[1, 2, 3, 4].map((c) => ({ name: `CTL ${c} jack`, group: "External" })),
  { name: "Expression pedal 1", group: "External" },
  { name: "Expression pedal 2", group: "External" },
  ...[...range(1, 31), ...range(64, 95)].map((cc) => ({ name: `MIDI CC#${cc}`, group: "MIDI (e.g. from Live MIDI)" })),
];

/** The source number for MIDI CC#cc (1–31, 64–95), or -1. */
export const ccSource = (cc: number) => SOURCES.findIndex((s) => s.name === `MIDI CC#${cc}`);

const TRACK_FUNCS = ["rec/play", "play/stop", "stop", "clear", "reverse", "undo/redo", "mark back", "rec back", "mark set", "mark clear", "level"];
const fxFuncs = (who: string) => [
  `${who} on/off`,
  `${who} control`,
  `${who} type`,
  `${who} next type`,
  `${who} previous type`,
  `${who} switch mode`,
  ...[1, 2, 3, 4].map((p) => `${who} parameter ${p}`),
  `${who} sequence on/off`,
  `${who} sequence sync`,
  `${who} sequence retrigger`,
  `${who} sequence rate`,
  `${who} sequence max`,
];
const SLOTS = ["A", "B", "C", "D"].flatMap((b) => ["A", "B", "C", "D"].map((f) => `${b}-${f}`));
const fxTargets = (label: string, group: string): Option[] => [
  { name: `${label} on/off`, group },
  { name: `${label}: next FX target`, group },
  { name: `${label}: previous FX target`, group },
  { name: `${label}: next bank`, group },
  { name: `${label}: previous bank`, group },
  { name: `${label}: switch mode (all)`, group },
  ...["A", "B", "C", "D"].flatMap((x) => fxFuncs(`${label} ${x}`).map((name) => ({ name, group }))),
  ...SLOTS.flatMap((s) => fxFuncs(`${label} ${s}`).map((name) => ({ name, group: `${group} (per bank)` }))),
  ...fxFuncs(`${label} current`).map((name) => ({ name, group })),
];

/** Targets by number. */
export const TARGETS: Option[] = [
  ...TRACKS.flatMap((t) => TRACK_FUNCS.map((f) => ({ name: `Track ${t} ${f}`, group: "Tracks" }))),
  ...TRACK_FUNCS.map((f) => ({ name: `Current track ${f}`, group: "Current track" })),
  { name: "Current track: next", group: "Current track" },
  { name: "Current track: previous", group: "Current track" },
  { name: "Current track: number", group: "Current track" },
  { name: "All start/stop", group: "Tempo and all tracks" },
  { name: "Tap tempo", group: "Tempo and all tracks" },
  { name: "Tempo", group: "Tempo and all tracks" },
  ...fxTargets("Input FX", "Input FX"),
  ...fxTargets("Track FX", "Track FX"),
  { name: "Rhythm start/stop", group: "Rhythm" },
  { name: "Rhythm start", group: "Rhythm" },
  { name: "Rhythm stop", group: "Rhythm" },
  { name: "Rhythm level", group: "Rhythm" },
  { name: "Mic in mute", group: "Inputs and outputs" },
  { name: "Mic 1 in mute", group: "Inputs and outputs" },
  { name: "Mic 2 in mute", group: "Inputs and outputs" },
  ...TRACKS.flatMap((t) => ["fader", "one-shot", "pan", "FX", "speed", "bounce in"].map((f) => ({ name: `Track ${t} ${f}`, group: "Track settings" }))),
  { name: "Dub mode", group: "Recording" },
  { name: "Auto rec", group: "Recording" },
  { name: "Bounce", group: "Recording" },
  { name: "Rhythm variation", group: "Rhythm" },
  { name: "Rhythm kit", group: "Rhythm" },
  { name: "Mic 1 level", group: "Inputs and outputs" },
  { name: "Mic 2 level", group: "Inputs and outputs" },
  ...["Inst 1 L", "Inst 1 R", "Inst 2 L", "Inst 2 R"].flatMap((i) => [`${i} level`, `${i} mute`].map((name) => ({ name, group: "Inputs and outputs" }))),
  ...["Loop level", "Main L level", "Main R level", "Sub 1 L level", "Sub 1 R level", "Sub 2 L level", "Sub 2 R level", "Phones level", "Master level", "Inst 1 gain", "Inst 2 gain"].map((name) => ({ name, group: "Inputs and outputs" })),
  ...["Mic 1", "Mic 2", "Inst 1 L", "Inst 1 R", "Inst 2 L", "Inst 2 R"].map((i) => ({ name: `EQ ${i} on/off`, group: "EQ" })),
  { name: "Input thru", group: "Inputs and outputs" },
  ...["Main L", "Main R", "Sub 1 L", "Sub 1 R", "Sub 2 L", "Sub 2 R"].map((o) => ({ name: `EQ ${o} on/off`, group: "EQ" })),
  { name: "Pedal mode", group: "Tempo and all tracks" },
  ...range(0, 127).map((cc) => ({ name: `Send MIDI CC#${cc}`, group: "MIDI out" })),
];

/** Range of the target's min/max values, and how to show them. */
export function targetRange(target: number): { min: number; max: number; format?: (v: number) => string } {
  const name = TARGETS[target]?.name ?? "";
  if (name === "Tempo") return { min: 400, max: 3000, format: (v) => `${(v / 10).toFixed(1)} BPM` };
  if (/ level$| fader$|^Rhythm level$|^Master level$/.test(name)) return { min: 0, max: 200 };
  if (/ pan$/.test(name)) return { min: 0, max: 100, format: (v) => (v === 50 ? "Center" : v < 50 ? `L${50 - v}` : `R${v - 50}`) };
  if (/on\/off$|mute$|one-shot$|bounce in$|^Auto rec$|^Bounce$|^Input thru$/.test(name)) return { min: 0, max: 1, format: (v) => (v ? "On" : "Off") };
  return { min: 0, max: 127 };
}

export const ASSIGN_FIELDS: Field[] = [
  { key: "A", label: "On", kind: "enum", options: ["Off", "On"], confidence: "confirmed" },
  { key: "D", label: "Source mode", kind: "enum", options: ["Momentary", "Toggle"], confidence: "confirmed", hint: "For a switch as source. Momentary: max only while held. Toggle: each press switches between min and max." },
  { key: "E", label: "Source active from", kind: "range", min: 0, max: 127, confidence: "confirmed", hint: "The part of the source's movement (0–127) that controls the target. Normally 0." },
  { key: "F", label: "Source active to", kind: "range", min: 0, max: 127, confidence: "confirmed", hint: "Normally 127." },
];

/** Label for a changed ASSIGN value in the write review, or null. */
export function describeAssign(path: string, value: number, target?: number): { label: string; shown: string } | null {
  const m = path.match(/^mem\/ASSIGN(\d+)\.([A-Z])$/);
  if (!m) return null;
  const [, n, key] = m;
  const label = { A: "on", B: "source", D: "source mode", E: "source active from", F: "source active to", G: "target", I: "target min", J: "target max" }[key] ?? key;
  let shown = String(value);
  if (key === "A") shown = value ? "On" : "Off";
  if (key === "B") shown = SOURCES[value]?.name ?? `#${value}`;
  if (key === "D") shown = value ? "Toggle" : "Momentary";
  if (key === "G") shown = TARGETS[value]?.name ?? `#${value}`;
  if ((key === "I" || key === "J") && target !== undefined) shown = targetRange(target).format?.(value) ?? shown;
  return { label: `ASSIGN ${n}: ${label}`, shown };
}
