// Footswitch (CTL FUNC) assignments: pedals 1–9 in pedal modes 1–3, stored as
// ICTL{mode}_PEDAL{n}.A in both SYSTEM and MEMORY files. Which of the two the pedal
// uses depends on MENU › CTL FUNC › PREFERENCE (not decoded yet).
//
// The value is an index into one long function list, in the Parameter Guide's order,
// where every "TRK1–6 …" function is repeated per track (26 per track). Anchors come
// from the factory defaults (memory 50) and the default pedal table in the guide (p. 14):
//   2 = TRK1 REC/PLAY2, 11 = TRK1 STOP4, 80 = TRK4 REC/PLAY2, 170 = CUR.TRK REVERSE,
//   171 = CUR.TRK UNDO/REDO, 178 = CUR.TRK HALF SPEED, 186 = ALL START/STOP1,
//   193 = PEDAL MODE, 196–198 = INPUT FX A–C, 202–204 = TRACK FX A–C.
// The guide lists 28 track functions but the file has 26: one of positions 4–9 and one
// of TRACK EDIT / TRACK FX are missing, so those slots aren't named yet (TESTS.md round 3).

import type { Confidence } from "./schema";

export interface FootFunction {
  value: number;
  name: string;
  confidence: Confidence;
}

const TRACK_FUNCS: [string, Confidence][] = [
  ["Rec/play 1", "likely"],
  ["Rec/play 2", "confirmed"],
  ["Rec/play 3", "likely"],
  ["Rec/play 4", "likely"],
  // Positions 4–9: five of Moment play, Play/stop 1–3, Stop 1–3 (one is missing)
  ["(4) Moment play / Play/stop / Stop", "guess"],
  ["(5) Play/stop / Stop", "guess"],
  ["(6) Play/stop / Stop", "guess"],
  ["(7) Play/stop / Stop", "guess"],
  ["(8) Stop", "guess"],
  ["(9) Stop", "guess"],
  ["Stop 4", "confirmed"],
  ["Stop 5", "likely"],
  ["Clear", "likely"],
  ["Reverse", "confirmed"],
  ["Undo/redo", "confirmed"],
  ["Mark back 1", "likely"],
  ["Mark back 2", "likely"],
  ["Rec back", "likely"],
  ["Mark set 1", "likely"],
  ["Mark set 2", "likely"],
  ["Mark clear", "likely"],
  ["Half speed", "confirmed"],
  ["Half speed (momentary)", "likely"],
  ["Double speed", "likely"],
  ["Double speed (momentary)", "likely"],
  ["Track edit or track FX", "guess"],
];
const TRACK_BLOCK = TRACK_FUNCS.length; // 26
const CUR_BASE = 1 + 6 * TRACK_BLOCK; // 157

const AFTER_CUR: [number, string, Confidence][] = [
  [CUR_BASE + TRACK_BLOCK, "Current track: next", "likely"],
  [CUR_BASE + TRACK_BLOCK + 1, "Current track: previous", "likely"],
  [CUR_BASE + TRACK_BLOCK + 2, "Current track: number", "likely"],
  [186, "All start/stop 1", "confirmed"],
  [193, "Pedal mode", "confirmed"],
  [194, "Pedal mode next", "likely"],
  [195, "Input FX on/off", "likely"],
  [196, "Input FX A", "confirmed"],
  [197, "Input FX B", "confirmed"],
  [198, "Input FX C", "confirmed"],
  [199, "Input FX D", "likely"],
  [200, "Input FX current", "likely"],
  [201, "Track FX on/off", "likely"],
  [202, "Track FX A", "confirmed"],
  [203, "Track FX B", "confirmed"],
  [204, "Track FX C", "confirmed"],
  [205, "Track FX D", "likely"],
  [206, "Track FX current", "likely"],
  [207, "Rhythm start/stop", "likely"],
  [208, "Rhythm start", "likely"],
  [209, "Rhythm stop", "likely"],
  [210, "Memory up 1", "likely"],
  [211, "Memory up 2", "likely"],
  [212, "Memory down 1", "likely"],
  [213, "Memory down 2", "likely"],
  [214, "Memory write", "likely"],
  [215, "Mic in mute", "likely"],
  [216, "Mic 1 in mute", "likely"],
  [217, "Mic 2 in mute", "likely"],
  [218, "LED", "likely"],
];

/** Name and confidence for a pedal function number. */
export function footFunction(value: number): FootFunction {
  if (value === 0) return { value, name: "Off", confidence: "likely" };
  if (value >= 1 && value < CUR_BASE) {
    const track = Math.floor((value - 1) / TRACK_BLOCK) + 1;
    const [name, confidence] = TRACK_FUNCS[(value - 1) % TRACK_BLOCK];
    return { value, name: `Track ${track} ${lowerFirst(name)}`, confidence };
  }
  if (value >= CUR_BASE && value < CUR_BASE + TRACK_BLOCK) {
    const [name, confidence] = TRACK_FUNCS[value - CUR_BASE];
    return { value, name: `Current track ${lowerFirst(name)}`, confidence };
  }
  const known = AFTER_CUR.find(([v]) => v === value);
  if (known) return { value, name: known[1], confidence: known[2] };
  if (value > 186 && value < 193) return { value, name: `All start/stop, all clear or tempo (#${value})`, confidence: "guess" };
  return { value, name: `Function #${value}`, confidence: "guess" };
}

const lowerFirst = (s: string) => (s.startsWith("(") ? s : s[0].toLowerCase() + s.slice(1));

export const PEDALS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export const PEDAL_MODES = [1, 2, 3] as const;
export const pedalPath = (root: "mem" | "sys", mode: number, pedal: number) => `${root}/ICTL${mode}_PEDAL${pedal}.A`;
export const CTL_JACKS = [1, 2, 3, 4] as const;
export const ctlPath = (root: "mem" | "sys", ctl: number) => `${root}/ECTL_CTL${ctl}`;
