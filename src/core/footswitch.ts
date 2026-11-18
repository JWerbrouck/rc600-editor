// Footswitch (CTL FUNC) assignments: pedals 1–9 in pedal modes 1–3, stored as
// ICTL{mode}_PEDAL{n} in both SYSTEM and MEMORY files, and the external CTL1–4 jacks
// (ECTL_CTLn), which use the same function list. Which file the pedal uses is set per mode
// in MENU › CTL FUNC › PREFERENCE (system PREF.C–E: 0 = memory, 1 = system).
//
// A = function number. B and C = the value range the function switches between (min/max):
// 0/1 for on/off functions, 1/2 for DOUBLE SPEED (MOMENT), 0/7 for LED, 0/100 for TEMPO
// UP/DOWN. The pedal sets B/C when you choose a function, so the editor does too.
//
// Numbering (round 3, TESTS.md): the original list, in the guide's order but without the
// functions added in later firmware, which are appended after LED:
//   1–156    6 tracks × 26: REC/PLAY1–4, MOMENT PLAY, PLAY/STOP2–3, STOP1–5, CLEAR, REVERSE,
//            UNDO/REDO, MARK BACK1–2, REC BACK, MARK SET1–2, MARK CLEAR, HALF SPEED (+MOMENT),
//            DOUBLE SPEED (+MOMENT), TRACK FX   (no PLAY/STOP1, no TRACK EDIT on this pedal)
//   157–182  current track, same 26
//   183      CUR.TRK INC1      186–188 ALL START/STOP1–3   189 ALL CLEAR1   190 TAP TEMPO
//   191/192  TEMPO UP/DOWN     193 PEDAL MODE   194 PEDAL MODE INC   195 INPUT FX
//   196–200  INPUT FX A–D, CUR 201 TRACK FX     202–206 TRACK FX A–D, CUR
//   207–209  RHYTHM START/STOP, START, STOP     216 LED
//   218      TRK1 PLAY/STOP1   226 ALL START/STOP4   228 ALL START/STOP6   229 ALL CLEAR2
//   230      MEMORY INC2

import type { Confidence } from "./schema";

export interface FootFunction {
  value: number;
  name: string;
  confidence: Confidence;
}

const TRACK_FUNCS: [string, Confidence][] = [
  ["Rec/play 1", "confirmed"],
  ["Rec/play 2", "confirmed"],
  ["Rec/play 3", "likely"],
  ["Rec/play 4", "confirmed"],
  ["Moment play", "confirmed"],
  ["Play/stop 2", "confirmed"],
  ["Play/stop 3", "confirmed"],
  ["Stop 1", "confirmed"],
  ["Stop 2", "confirmed"],
  ["Stop 3", "confirmed"],
  ["Stop 4", "confirmed"],
  ["Stop 5", "confirmed"],
  ["Clear", "confirmed"],
  ["Reverse", "confirmed"],
  ["Undo/redo", "confirmed"],
  ["Mark back 1", "confirmed"],
  ["Mark back 2", "likely"],
  ["Rec back", "likely"],
  ["Mark set 1", "likely"],
  ["Mark set 2", "likely"],
  ["Mark clear", "likely"],
  ["Half speed", "confirmed"],
  ["Half speed (momentary)", "guess"], // value range not seen yet (probably 1/0)
  ["Double speed", "guess"], // value range not seen yet
  ["Double speed (momentary)", "confirmed"],
  ["Track FX", "confirmed"],
];
const TRACK_BLOCK = TRACK_FUNCS.length; // 26
const CUR_BASE = 1 + 6 * TRACK_BLOCK; // 157
const PLAY_STOP_1 = 218; // TRK1 PLAY/STOP1, appended in later firmware

const OTHER: [number, string, Confidence][] = [
  [183, "Current track: next (INC1)", "confirmed"],
  [184, "Current track (#184)", "guess"],
  [185, "Current track (#185)", "guess"],
  [186, "All start/stop 1", "confirmed"],
  [187, "All start/stop 2", "confirmed"],
  [188, "All start/stop 3", "confirmed"],
  [189, "All clear 1", "confirmed"],
  [190, "Tap tempo", "confirmed"],
  [191, "Tempo up", "confirmed"],
  [192, "Tempo down", "confirmed"],
  [193, "Pedal mode", "confirmed"],
  [194, "Pedal mode next", "confirmed"],
  [195, "Input FX on/off", "confirmed"],
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
  [207, "Rhythm start/stop", "confirmed"],
  [208, "Rhythm start", "likely"],
  [209, "Rhythm stop", "likely"],
  [210, "Memory up 1", "likely"], // factory CTL1; pairs with 211
  [211, "Memory down 1", "likely"], // CTL2 shows PUSH DEC / HOLD DEC
  [212, "Memory function (#212)", "guess"], // range 0–127 in the user's system
  [213, "Mic mute? (#213)", "guess"],
  [214, "Mic mute? (#214)", "guess"],
  [215, "Mic mute? (#215)", "guess"],
  [216, "LED", "confirmed"],
  [217, "Function #217", "guess"],
  [226, "All start/stop 4", "confirmed"],
  [227, "All start/stop 5", "likely"],
  [228, "All start/stop 6", "confirmed"],
  [229, "All clear 2", "confirmed"],
  [230, "Memory up 2", "confirmed"],
];

/** Name and confidence for a function number. */
export function footFunction(value: number): FootFunction {
  if (value === 0) return { value, name: "Off", confidence: "confirmed" };
  if (value >= 1 && value < CUR_BASE) {
    const track = Math.floor((value - 1) / TRACK_BLOCK) + 1;
    const [name, confidence] = TRACK_FUNCS[(value - 1) % TRACK_BLOCK];
    return { value, name: `Track ${track} ${lowerFirst(name)}`, confidence };
  }
  if (value >= CUR_BASE && value < CUR_BASE + TRACK_BLOCK) {
    const [name, confidence] = TRACK_FUNCS[value - CUR_BASE];
    return { value, name: `Current track ${lowerFirst(name)}`, confidence };
  }
  if (value === PLAY_STOP_1) return { value, name: "Track 1 play/stop 1", confidence: "confirmed" };
  // Tracks 2–6 and the current track most likely follow track 1's PLAY/STOP1
  if (value > PLAY_STOP_1 && value <= PLAY_STOP_1 + 6) {
    const n = value - PLAY_STOP_1 + 1;
    return { value, name: n === 7 ? "Current track play/stop 1" : `Track ${n} play/stop 1`, confidence: "likely" };
  }
  const known = OTHER.find(([v]) => v === value);
  if (known) return { value, name: known[1], confidence: known[2] };
  return { value, name: `Function #${value}`, confidence: "guess" };
}

const lowerFirst = (s: string) => s[0].toLowerCase() + s.slice(1);

/**
 * B/C (value range) the pedal stores with a function, or null when not known yet; functions
 * without a known range can't be assigned from the editor.
 */
export function footRange(value: number): { B: number; C: number } | null {
  const f = footFunction(value);
  if (f.confidence === "guess") return null;
  const inBlock = value >= 1 && value < CUR_BASE + TRACK_BLOCK;
  const slot = inBlock ? (value - 1) % TRACK_BLOCK : -1;
  if (slot === 24) return { B: 1, C: 2 }; // double speed (momentary): normal → double
  if (value === 191 || value === 192) return { B: 0, C: 100 };
  if (value === 216) return { B: 0, C: 7 }; // LED colors
  return { B: 0, C: 1 };
}

/** Every function with a place in the list, grouped the way the pedal lists them. */
export function functionGroups(): { label: string; options: FootFunction[] }[] {
  const list = (values: number[]) => values.map(footFunction);
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const groups = [{ label: "Off", options: list([0]) }];
  for (let t = 0; t < 6; t++) {
    const block = range(1 + t * TRACK_BLOCK, (t + 1) * TRACK_BLOCK);
    // PLAY/STOP1 sits with its track in the pedal's list, after MOMENT PLAY
    groups.push({ label: `Track ${t + 1}`, options: list([...block.slice(0, 5), PLAY_STOP_1 + t, ...block.slice(5)]) });
  }
  const cur = range(CUR_BASE, CUR_BASE + TRACK_BLOCK - 1);
  groups.push({ label: "Current track", options: list([...cur.slice(0, 5), PLAY_STOP_1 + 6, ...cur.slice(5), 183, 184, 185]) });
  groups.push({ label: "All tracks and tempo", options: list([186, 187, 188, 226, 227, 228, 189, 229, 190, 191, 192]) });
  groups.push({ label: "Pedal mode and effects", options: list(range(193, 206)) });
  groups.push({ label: "Rhythm", options: list(range(207, 209)) });
  groups.push({ label: "Memory", options: list([210, 230, 211, 212]) });
  groups.push({ label: "Mute, LED and other", options: list([213, 214, 215, 216, 217, 225]) });
  return groups;
}

export const PEDALS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export const PEDAL_MODES = [1, 2, 3] as const;
export const pedalPath = (root: "mem" | "sys", mode: number, pedal: number) => `${root}/ICTL${mode}_PEDAL${pedal}.A`;
export const CTL_JACKS = [1, 2, 3, 4] as const;
export const ctlPath = (root: "mem" | "sys", ctl: number) => `${root}/ECTL_CTL${ctl}`;

// ---------------------------------------------------------------- what each function does

/** What a function does on PUSH, HOLD (long press) and CLICK (double-click), from the Parameter Guide (pp. 14–19). */
export interface FootHelp {
  push?: string;
  hold?: string;
  click?: string;
  about: string;
}

const TRACK_HELP: FootHelp[] = [
  { push: "Rec/play", about: "Record, then play; press again to overdub. The basic looping switch." },
  { push: "Rec/play", hold: "Undo (play)", about: "Like rec/play 1. Holding it undoes the last overdub and keeps playing." },
  { push: "Rec/play", hold: "Undo (play)", click: "Stop", about: "Rec/play 2 plus a double-click to stop the track." },
  { push: "Rec/play", hold: "Undo, then clear", click: "Stop", about: "Rec/play 3, but holding also clears the track when there's nothing left to undo." },
  { push: "Play while held", about: "The track plays only while you hold the switch down." },
  { push: "Play/stop", hold: "Undo (play)", about: "Start or stop the track. Holding undoes the last overdub." },
  { push: "Play/stop", hold: "Undo, then clear", about: "Play/stop 2, but holding also clears the track when there's nothing left to undo." },
  { push: "Stop", about: "Stop the track." },
  { push: "Stop", click: "Tap tempo", about: "Stop the track; tap twice quickly to set the tempo. Holding returns to the previous tempo." },
  { push: "Stop", hold: "Clear", click: "Tap tempo", about: "Stop the track, hold to clear it, double-click to tap the tempo." },
  { push: "Stop", hold: "Clear", about: "Stop the track; hold to clear it." },
  { push: "Stop", click: "Clear", about: "Stop the track; double-click to clear it." },
  { push: "Clear", about: "Clear the track." },
  { push: "Reverse", about: "Turn reverse playback of the track on or off." },
  { push: "Undo/redo", about: "Undo or redo the recording or the latest overdub." },
  { push: "Mark back", about: "Go back to the marked overdub state (set with Mark set)." },
  { push: "Mark back", hold: "Rec back", about: "Mark back; hold to go back to how the track was when recording ended." },
  { push: "Rec back", about: "Go back to how the track was when recording ended, removing all overdubs." },
  { push: "Mark set", about: "Mark the current overdub state, to return to it later with Mark back." },
  { push: "Mark set", hold: "Mark clear", about: "Mark set; hold to remove the mark." },
  { push: "Mark clear", about: "Remove the mark." },
  { push: "Half speed on/off", about: "Play the track at half speed (an octave lower), or back to normal." },
  { push: "Half speed while held", about: "Half speed only while you hold the switch down." },
  { push: "Double speed on/off", about: "Play the track at double speed (an octave higher), or back to normal." },
  { push: "Double speed while held", about: "Double speed only while you hold the switch down." },
  { push: "Track FX on/off", about: "Turn the track FX on or off for this track." },
];
const PLAY_STOP_1_HELP: FootHelp = { push: "Play/stop", about: "Start or stop the track." };

const OTHER_HELP: Record<number, FootHelp> = {
  0: { about: "The switch does nothing." },
  183: { push: "Next track", about: "Select the next track as the current track (1 → 2 → … → 6 → 1)." },
  186: { push: "All start/stop", about: "Start all tracks together; press again to stop them all (with fade-out if a track uses it)." },
  187: { push: "All start/stop", hold: "All clear", about: "All start/stop; hold to clear all tracks." },
  188: { push: "All start/stop", click: "All clear", about: "All start/stop; double-click to clear all tracks." },
  226: { push: "All start/stop, immediately", about: "Start or stop all tracks at once, ignoring each track's fade and loop-end settings." },
  227: { push: "All start/stop, immediately", hold: "All clear", about: "Immediate all start/stop; hold to clear all tracks." },
  228: { push: "All start/stop, immediately", click: "All clear", about: "Immediate all start/stop; double-click to clear all tracks." },
  189: { push: "All clear", about: "Clear all tracks with one press." },
  229: { hold: "All clear", about: "Clear all tracks by holding the switch, so it can't happen by accident." },
  190: { push: "Tap tempo", hold: "Tempo revert", about: "Tap to set the tempo; hold to go back to the previous tempo." },
  191: { push: "Tempo ×2", about: "Double the tempo." },
  192: { push: "Tempo ×½", about: "Halve the tempo." },
  193: { push: "Mode 1 ↔ 2", hold: "Mode 3", about: "Switch between pedal modes 1 and 2; hold for mode 3." },
  194: { push: "Next mode", about: "Go to the next pedal mode: 1 → 2 → 3 → 1." },
  195: { push: "Input FX on/off", about: "Turn the input effects on or off." },
  196: { push: "Input FX A on/off", about: "Turn input effect A of the current FX bank on or off." },
  197: { push: "Input FX B on/off", about: "Turn input effect B of the current FX bank on or off." },
  198: { push: "Input FX C on/off", about: "Turn input effect C of the current FX bank on or off." },
  199: { push: "Input FX D on/off", about: "Turn input effect D of the current FX bank on or off." },
  200: { push: "Current input FX on/off", about: "Turn the currently selected input effect on or off." },
  201: { push: "Track FX on/off", about: "Turn the track effects on or off." },
  202: { push: "Track FX A on/off", about: "Turn track effect A of the current FX bank on or off." },
  203: { push: "Track FX B on/off", about: "Turn track effect B of the current FX bank on or off." },
  204: { push: "Track FX C on/off", about: "Turn track effect C of the current FX bank on or off." },
  205: { push: "Track FX D on/off", about: "Turn track effect D of the current FX bank on or off." },
  206: { push: "Current track FX on/off", about: "Turn the currently selected track effect on or off." },
  207: { push: "Rhythm start/stop", about: "Start or stop the rhythm." },
  208: { push: "Rhythm start", about: "Start the rhythm." },
  209: { push: "Rhythm stop", about: "Stop the rhythm." },
  210: { push: "Next memory", about: "Go to the next memory (01 → 02 → … → 99)." },
  230: { push: "Next memory", hold: "Previous memory", about: "Next memory; hold to go to the previous one." },
  211: { push: "Previous memory", about: "Go to the previous memory (99 → 98 → … → 01). Holding keeps stepping down." },
  216: { push: "Change color", about: "Change the color of this switch's LED; it does nothing else." },
};

/** What a function does, or null when unknown. */
export function footHelp(value: number): FootHelp | null {
  if (value >= 1 && value < CUR_BASE + TRACK_BLOCK) {
    const h = TRACK_HELP[(value - 1) % TRACK_BLOCK];
    return value >= CUR_BASE ? { ...h, about: `${h.about} Acts on the current track.` } : h;
  }
  if (value >= PLAY_STOP_1 && value <= PLAY_STOP_1 + 6) return PLAY_STOP_1_HELP;
  return OTHER_HELP[value] ?? null;
}

/** Categories for the picker. Track functions are one list, applied to a chosen track. */
export type FootCategory = "track" | "all" | "modefx" | "rhythm" | "memory" | "other";
export const FOOT_CATEGORIES: [FootCategory, string][] = [
  ["track", "Track"],
  ["all", "All tracks and tempo"],
  ["modefx", "Pedal mode and effects"],
  ["rhythm", "Rhythm"],
  ["memory", "Memory"],
  ["other", "Off and LED"],
];

/** 1–6, or 7 for the current track. */
export type TrackChoice = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Function number for a track function (slot as in the pedal's list, PLAY/STOP1 at 5) on a track. */
export function trackFunctionValue(slot: number, track: TrackChoice): number {
  if (slot === 5) return PLAY_STOP_1 + track - 1;
  const inBlock = slot < 5 ? slot : slot - 1;
  return (track === 7 ? CUR_BASE : 1 + (track - 1) * TRACK_BLOCK) + inBlock;
}

/** The pedal's track function list, as slots (0 … 26) with their names. */
export const TRACK_SLOTS: string[] = [...TRACK_FUNCS.slice(0, 5).map(([n]) => n), "Play/stop 1", ...TRACK_FUNCS.slice(5).map(([n]) => n)];

/** Where a function number lives in the picker. */
export function footPlace(value: number): { category: FootCategory; track?: TrackChoice; slot?: number } {
  if (value >= 1 && value < CUR_BASE + TRACK_BLOCK) {
    const inBlock = (value - 1) % TRACK_BLOCK;
    const track = (value >= CUR_BASE ? 7 : Math.floor((value - 1) / TRACK_BLOCK) + 1) as TrackChoice;
    return { category: "track", track, slot: inBlock < 5 ? inBlock : inBlock + 1 };
  }
  if (value >= PLAY_STOP_1 && value <= PLAY_STOP_1 + 6) return { category: "track", track: (value - PLAY_STOP_1 + 1) as TrackChoice, slot: 5 };
  if ([183, 184, 185].includes(value)) return { category: "track", track: 7 };
  if ([186, 187, 188, 226, 227, 228, 189, 229, 190, 191, 192].includes(value)) return { category: "all" };
  if (value >= 193 && value <= 206) return { category: "modefx" };
  if (value >= 207 && value <= 209) return { category: "rhythm" };
  if ([210, 211, 212, 230].includes(value)) return { category: "memory" };
  return { category: "other" };
}

/** Non-track functions per category, in the pedal's order. */
export const CATEGORY_VALUES: Record<Exclude<FootCategory, "track">, number[]> = {
  all: [186, 187, 188, 226, 227, 228, 189, 229, 190, 191, 192],
  modefx: [193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206],
  rhythm: [207, 208, 209],
  memory: [210, 230, 211],
  other: [0, 216],
};
