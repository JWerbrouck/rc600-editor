// Meaning of the values in SYSTEM1/2 (<sys> block), by section. Mapped from the
// Parameter Guide's menu order and checked against the factory defaults in the user's
// backups; same confidence rules as schema.ts (guess = shown, not editable).
//
// Evidence per section:
//   COLOR     values 4,7,1,3,2 are exactly the factory colors of BLANK, STOP, REC, DUB, PLAY
//   EQ_*      12 values in the guide's order; every gain and the level sit at 20 (= 0 dB)
//   INPUT     J–M are 40, the default of the four noise suppressors
//   MIDI      all ten values match what the pedal showed (round 3 part A), in the guide's order
//   INPUT     A–G match part A: phantom on/on, inst gain inst/inst, stereo link off/on/on
//   SETUP     A follows the last memory used across backups (45 → 74 → 81); B/C = 0/98
//   USB       D/E = 100, the default of the USB input/output levels
// Round 3 part C (TESTS.md) changed settings to known values and confirmed: SETUP D/G/I/V,
// MIDI F/H/J/K, PREF C–E (0 = memory), INPUT H, OUTPUT A, MIXER A/I/U/V, MASTER_FX A/B and the
// EQ frequency, low-cut and high-cut steps. Fields still marked guess weren't covered.

import type { Field } from "./schema";

export interface SystemSection {
  id: string; // container name, e.g. "EQ_MIC1"
  title: string;
  /** One line under the tile: what you find in this section. */
  summary?: string;
  fields: Field[];
  /** Shown above the fields: what the section depends on. */
  note?: string;
}

const OFF_ON = ["Off", "On"];
const COLORS = ["Off", "Red", "Green", "Amber", "Blue", "Purple", "Cyan", "White"];
const channel = (v: number) => `Ch ${v + 1}`;
const dB = (v: number) => `${v > 20 ? "+" : ""}${v - 20} dB`;

const PREF_NOTE =
  "Only used when the PREFERENCE for these inputs is SYSTEM (MENU › INPUT › SETUP). With MEMORY, each memory's own copy applies instead.";
const OUT_PREF_NOTE = "Only used when the PREFERENCE for these outputs is SYSTEM (MENU › OUTPUT › SETUP).";

/** EQ frequency steps (both mid bands): 1.00 kHz is step 17. */
const FREQS = ["20 Hz", "25 Hz", "31.5 Hz", "40 Hz", "50 Hz", "63 Hz", "80 Hz", "100 Hz", "125 Hz", "160 Hz", "200 Hz", "250 Hz", "315 Hz", "400 Hz", "500 Hz", "630 Hz", "800 Hz", "1.00 kHz", "1.25 kHz", "1.60 kHz", "2.00 kHz", "2.50 kHz", "3.15 kHz", "4.00 kHz", "5.00 kHz", "6.30 kHz", "8.00 kHz", "10.0 kHz"];
const LOW_CUT = ["Flat", ...FREQS.slice(0, 17)]; // up to 800 Hz; 100 Hz is step 8
const HIGH_CUT = [...FREQS.slice(15), "12.5 kHz", "Flat"]; // from 630 Hz; 8.00 kHz is step 11, flat 14
const level = (key: string, label: string, confidence: Field["confidence"] = "likely"): Field => ({ key, label, kind: "range", min: 0, max: 200, confidence });

function eq(id: string, title: string): SystemSection {
  return {
    id,
    title: `EQ: ${title}`,
    note: id.includes("OUT") ? OUT_PREF_NOTE : PREF_NOTE,
    fields: [
      { key: "A", label: "EQ on", kind: "enum", options: OFF_ON, confidence: "likely" },
      { key: "B", label: "Low gain", kind: "range", min: 0, max: 40, format: dB, confidence: "likely" },
      { key: "C", label: "High gain", kind: "range", min: 0, max: 40, format: dB, confidence: "likely" },
      { key: "D", label: "Low-mid frequency", kind: "enum", options: FREQS, confidence: "likely" },
      { key: "E", label: "Low-mid Q", kind: "raw", confidence: "guess", hint: "Index into 0.5–16" },
      { key: "F", label: "Low-mid gain", kind: "range", min: 0, max: 40, format: dB, confidence: "likely" },
      { key: "G", label: "High-mid frequency", kind: "enum", options: FREQS, confidence: "likely" },
      { key: "H", label: "High-mid Q", kind: "raw", confidence: "guess", hint: "Index into 0.5–16" },
      { key: "I", label: "High-mid gain", kind: "range", min: 0, max: 40, format: dB, confidence: "likely" },
      { key: "J", label: "Level", kind: "range", min: 0, max: 40, format: dB, confidence: "likely" },
      { key: "K", label: "Low cut", kind: "enum", options: LOW_CUT, confidence: "likely" },
      { key: "L", label: "High cut", kind: "enum", options: HIGH_CUT, confidence: "likely" },
    ],
  };
}

export const SYSTEM_SECTIONS: SystemSection[] = [
  {
    id: "MIDI",
    title: "MIDI",
    fields: [
      { key: "A", label: "Receive channel (control)", kind: "range", min: 0, max: 15, format: channel, confidence: "likely", hint: "Program change, CC and start/stop from Live MIDI use this channel" },
      { key: "C", label: "Receive channel (rhythm)", kind: "range", min: 0, max: 15, format: channel, confidence: "likely" },
      { key: "D", label: "Receive channel (voice)", kind: "raw", confidence: "guess", hint: "Channel 1 is stored as 0 but channel 3 as 3, so the steps aren't clear yet" },
      { key: "E", label: "Transmit channel", kind: "enum", options: [...Array.from({ length: 16 }, (_, i) => channel(i)), "Same as receive (control)"], confidence: "confirmed" },
      { key: "F", label: "Sync clock", kind: "enum", options: ["Auto", "Internal", "MIDI", "USB"], confidence: "confirmed" },
      { key: "G", label: "Sync out (clock)", kind: "enum", options: OFF_ON, confidence: "likely" },
      { key: "H", label: "Sync start", kind: "enum", options: ["Off", "All", "Rhythm"], confidence: "confirmed", hint: "What a MIDI start message starts" },
      { key: "I", label: "Program change out", kind: "enum", options: OFF_ON, confidence: "likely" },
      { key: "J", label: "Thru from MIDI in", kind: "enum", options: ["Off", "MIDI out", "USB out", "USB & MIDI"], confidence: "confirmed" },
      { key: "K", label: "Thru from USB in", kind: "enum", options: ["Off", "MIDI out", "USB out", "USB & MIDI"], confidence: "confirmed" },
    ],
  },
  {
    id: "SETUP",
    title: "Setup",
    fields: [
      { key: "A", label: "Memory at start-up", kind: "range", min: 0, max: 98, format: (v) => `Memory ${String(v + 1).padStart(2, "0")}`, confidence: "likely", hint: "The pedal updates this itself when you change memory" },
      { key: "B", label: "Lowest memory (memory extent)", kind: "range", min: 0, max: 98, format: (v) => String(v + 1).padStart(2, "0"), confidence: "likely", hint: "Memory up/down only moves between the lowest and highest memory" },
      { key: "C", label: "Highest memory (memory extent)", kind: "range", min: 0, max: 98, format: (v) => String(v + 1).padStart(2, "0"), confidence: "likely" },
      { key: "I", label: "Display contrast", kind: "range", min: 0, max: 9, format: (v) => String(v + 1), confidence: "confirmed" },
      { key: "D", label: "Screen at start-up", kind: "enum", options: ["Memory number", "Track status", "Loop tracks", "Loop status", "Loop level", "Input FX", "Track FX"], confidence: "confirmed" },
      { key: "G", label: "Loop indicator (outer ring)", kind: "enum", options: ["Loop", "Rhythm", "Beat", "Tempo"], confidence: "confirmed" },
      { key: "V", label: "Auto off", kind: "enum", options: OFF_ON, confidence: "confirmed", hint: "Turns the pedal off after 10 hours without use" },
      ...["E", "F", "H", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U"].map(
        (key): Field => ({ key, label: `Setup ${key}`, kind: "raw", confidence: "guess", hint: "Orb indicator or knob functions 1–4; not mapped yet" }),
      ),
    ],
  },
  {
    id: "COLOR",
    title: "Track indicator colors",
    fields: [
      { key: "C", label: "Recording", kind: "enum", options: COLORS, confidence: "likely" },
      { key: "E", label: "Playing", kind: "enum", options: COLORS, confidence: "likely" },
      { key: "D", label: "Overdubbing", kind: "enum", options: COLORS, confidence: "likely" },
      { key: "B", label: "Stopped", kind: "enum", options: COLORS, confidence: "likely" },
      { key: "A", label: "Empty", kind: "enum", options: COLORS, confidence: "likely" },
    ],
  },
  {
    id: "INPUT",
    title: "Input",
    note: PREF_NOTE,
    fields: [
      { key: "J", label: "Mic 1 noise suppressor", kind: "range", min: 0, max: 100, confidence: "likely" },
      { key: "K", label: "Mic 2 noise suppressor", kind: "range", min: 0, max: 100, confidence: "likely" },
      { key: "L", label: "Inst 1 noise suppressor", kind: "range", min: 0, max: 100, confidence: "likely" },
      { key: "M", label: "Inst 2 noise suppressor", kind: "range", min: 0, max: 100, confidence: "likely" },
      { key: "H", label: "Mic 1 compressor", kind: "range", min: 0, max: 100, format: (v) => (v ? String(v) : "Off"), confidence: "confirmed" },
      { key: "I", label: "Mic 2 compressor", kind: "range", min: 0, max: 100, format: (v) => (v ? String(v) : "Off"), confidence: "likely" },
      { key: "A", label: "Mic 1 phantom power", kind: "enum", options: OFF_ON, confidence: "likely", hint: "Change it on the pedal: switching phantom power on can damage microphones that aren't condenser mics" },
      { key: "B", label: "Mic 2 phantom power", kind: "enum", options: OFF_ON, confidence: "likely", hint: "Change it on the pedal" },
      { key: "C", label: "Inst 1 gain", kind: "enum", options: ["Inst", "Line"], confidence: "guess", hint: "0 = Inst confirmed; Line not seen yet" },
      { key: "D", label: "Inst 2 gain", kind: "enum", options: ["Inst", "Line"], confidence: "guess", hint: "0 = Inst confirmed; Line not seen yet" },
      { key: "E", label: "Mic stereo link", kind: "enum", options: OFF_ON, confidence: "likely" },
      { key: "F", label: "Inst 1 stereo link", kind: "enum", options: OFF_ON, confidence: "likely" },
      { key: "G", label: "Inst 2 stereo link", kind: "enum", options: OFF_ON, confidence: "likely" },
    ],
  },
  {
    id: "USB",
    title: "USB",
    fields: [
      { key: "D", label: "USB input level", kind: "range", min: 0, max: 200, confidence: "likely" },
      { key: "E", label: "USB output level", kind: "range", min: 0, max: 200, confidence: "likely" },
      { key: "A", label: "USB A", kind: "raw", confidence: "guess" },
      { key: "B", label: "Audio driver mode?", kind: "raw", confidence: "guess", hint: "Guide order: Generic, Vendor" },
      { key: "C", label: "Audio routing?", kind: "raw", confidence: "guess", hint: "Guide order: Line out, Sub mix, Loop in" },
    ],
  },
  {
    id: "PREF",
    title: "Footswitch preference",
    note: "Whether a pedal mode uses the system footswitch assignments or each memory's own (MENU › CTL FUNC › PREFERENCE).",
    fields: [
      { key: "C", label: "Pedal mode 1", kind: "enum", options: ["Memory", "System"], confidence: "confirmed" },
      { key: "D", label: "Pedal mode 2", kind: "enum", options: ["Memory", "System"], confidence: "confirmed" },
      { key: "E", label: "Pedal mode 3", kind: "enum", options: ["Memory", "System"], confidence: "confirmed" },
      ...["A", "B", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T"].map(
        (key): Field => ({ key, label: `Preference ${key}`, kind: "raw", confidence: "guess", hint: "CTL, EXP, input or output preference; 1 = system" }),
      ),
    ],
  },
  {
    id: "OUTPUT",
    title: "Output",
    fields: [
      { key: "A", label: "Output level knob", kind: "enum", options: ["All", "Master", "Phones", "Off"], confidence: "confirmed", hint: "What the OUTPUT LEVEL knob adjusts" },
      { key: "B", label: "Main stereo link", kind: "enum", options: OFF_ON, confidence: "likely" },
      { key: "C", label: "Sub 1 stereo link", kind: "enum", options: OFF_ON, confidence: "likely" },
      { key: "D", label: "Sub 2 stereo link", kind: "enum", options: OFF_ON, confidence: "likely" },
    ],
  },
  {
    id: "MIXER",
    title: "Mixer",
    note: "Input levels follow the input PREFERENCE, output levels the output PREFERENCE. Master and phones may also follow the OUTPUT LEVEL knob.",
    fields: [
      level("A", "Mic 1 in"),
      level("C", "Mic 2 in"),
      level("E", "Inst 1 L in"),
      level("G", "Inst 1 R in"),
      level("I", "Inst 2 L in"),
      level("K", "Inst 2 R in"),
      level("M", "Main L out"),
      level("N", "Main R out"),
      level("O", "Sub 1 L out"),
      level("P", "Sub 1 R out"),
      level("Q", "Sub 2 L out"),
      level("R", "Sub 2 R out"),
      level("S", "Loop out"),
      level("T", "Rhythm out"),
      level("U", "Phones out"),
      level("V", "Master out"),
      ...["B", "D", "F", "H", "J", "L"].map((key): Field => ({ key, label: `Mute? (${key})`, kind: "raw", confidence: "guess", hint: "Probably the mute of the input above (0 = not muted)" })),
    ],
  },
  {
    id: "MASTER_FX",
    title: "Master FX",
    fields: [
      { key: "A", label: "Compressor", kind: "range", min: 0, max: 40, format: (v) => (v ? String(v) : "Off"), confidence: "confirmed" },
      { key: "B", label: "Reverb", kind: "range", min: 0, max: 100, confidence: "confirmed", hint: "The guide says 0–40, but values up to 80 occur" },
      { key: "C", label: "Applied to (C)", kind: "raw", confidence: "guess", hint: "Guide order: Main L, Main R, Sub 1 L, Sub 1 R, Sub 2 L, Sub 2 R, Off" },
    ],
  },
  eq("EQ_MIC1", "Mic 1"),
  eq("EQ_MIC2", "Mic 2"),
  eq("EQ_INST1L", "Inst 1 L"),
  eq("EQ_INST1R", "Inst 1 R"),
  eq("EQ_INST2L", "Inst 2 L"),
  eq("EQ_INST2R", "Inst 2 R"),
  eq("EQ_MAINOUTL", "Main out L"),
  eq("EQ_MAINOUTR", "Main out R"),
  eq("EQ_SUBOUT1L", "Sub out 1 L"),
  eq("EQ_SUBOUT1R", "Sub out 1 R"),
  eq("EQ_SUBOUT2L", "Sub out 2 L"),
  eq("EQ_SUBOUT2R", "Sub out 2 R"),
];

/** Sections not mapped yet: shown with their raw values. */
export const RAW_SECTIONS = ["ROUTING", "FIXED_VALUE"];

/** Values the editor must never write, even after a test round marks them likely. */
export const NEVER_EDIT = new Set(["sys/INPUT.A", "sys/INPUT.B"]);

// ---------------------------------------------------------------- explanations

// Short descriptions per section and setting, written for this editor from the Parameter
// Guide (System Settings, pp. 9–35). Shown on the tiles and under each setting.

const SUMMARY: Record<string, string> = {
  MIDI: "Channels, clock sync, thru",
  SETUP: "Display, memory range, auto off",
  COLOR: "Colors of the track LEDs",
  INPUT: "Compressor, noise suppressor, stereo link",
  USB: "USB audio levels",
  PREF: "System or per-memory footswitches",
  OUTPUT: "Level knob, stereo link",
  MIXER: "Input and output levels",
  MASTER_FX: "Compressor and reverb on the output",
};

const ABOUT: Record<string, string> = {
  "MIDI.A": "Channel on which the pedal listens for program changes (memory switching) and control changes. Live MIDI sends on this channel.",
  "MIDI.C": "Channel on which note messages play the rhythm's drum sounds.",
  "MIDI.E": "Channel the pedal sends MIDI on. \"Same as receive\" follows the control receive channel.",
  "MIDI.F": "Where the tempo comes from. Auto follows MIDI clock when it arrives (MIDI before USB) and otherwise uses the memory's own tempo. Internal always uses the memory's tempo.",
  "MIDI.G": "Send MIDI clock, so other gear can follow the pedal's tempo.",
  "MIDI.H": "What starts when a MIDI start message arrives: nothing, tracks and rhythm (All), or only the rhythm.",
  "MIDI.I": "Send a program change when you switch memory, so other gear can follow.",
  "MIDI.J": "Where messages arriving at MIDI IN are passed on to.",
  "MIDI.K": "Where messages arriving over USB are passed on to.",
  "SETUP.A": "The memory the pedal opens with. The pedal updates this itself whenever you change memory.",
  "SETUP.B": "Memory up/down switches only move between the lowest and highest memory. Handy to limit a set to a few memories.",
  "SETUP.C": "See lowest memory.",
  "SETUP.I": "Display contrast, 1–10.",
  "SETUP.D": "The play screen shown after switching on.",
  "SETUP.G": "What the outer ring of the loop indicator shows.",
  "SETUP.V": "Switches the pedal off after 10 hours without playing or touching it.",
  "COLOR.C": "Color of a track's REC/PLAY indicator while recording.",
  "COLOR.E": "Color while the track plays.",
  "COLOR.D": "Color while overdubbing.",
  "COLOR.B": "Color while the track is stopped.",
  "COLOR.A": "Color of a track with nothing recorded.",
  "INPUT.J": "Noise suppressor on Mic 1 while recording loops: higher removes more hiss and hum between notes.",
  "INPUT.K": "Noise suppressor on Mic 2.",
  "INPUT.L": "Noise suppressor on Inst 1.",
  "INPUT.M": "Noise suppressor on Inst 2.",
  "INPUT.H": "Compressor on Mic 1 while recording loops: evens out loud and soft playing. Off = no compression.",
  "INPUT.I": "Compressor on Mic 2.",
  "INPUT.A": "Phantom power for condenser microphones on MIC 1. Change it on the pedal: phantom power can damage other microphones.",
  "INPUT.B": "Phantom power on MIC 2. Change it on the pedal.",
  "INPUT.E": "Treat MIC 1 and 2 as one stereo pair, with shared settings.",
  "INPUT.F": "Treat INST 1 L and R as one stereo pair. Track input settings then switch both together.",
  "INPUT.G": "Treat INST 2 L and R as one stereo pair.",
  "USB.D": "Level of the audio coming in from the computer over USB.",
  "USB.E": "Level of the audio the pedal sends to the computer over USB.",
  "PREF.C": "System: mode 1 uses the same footswitch assignments in every memory. Memory: each memory has its own (saved with the memory).",
  "PREF.D": "The same for pedal mode 2.",
  "PREF.E": "The same for pedal mode 3.",
  "OUTPUT.A": "What the OUTPUT LEVEL knob on the pedal adjusts: everything, the master out, only the headphones, or nothing.",
  "OUTPUT.B": "Treat MAIN L and R as one stereo pair, with shared settings.",
  "OUTPUT.C": "Treat SUB 1 L and R as one stereo pair.",
  "OUTPUT.D": "Treat SUB 2 L and R as one stereo pair.",
  "MIXER.A": "Input level of Mic 1 (100 = unchanged, up to 200).",
  "MIXER.S": "Level of the loop playback.",
  "MIXER.T": "Level of the rhythm.",
  "MIXER.U": "Headphone level. The OUTPUT LEVEL knob may also set this.",
  "MIXER.V": "Overall level of MAIN, SUB 1 and SUB 2. The OUTPUT LEVEL knob may also set this.",
  "MASTER_FX.A": "Compressor on the output, for a more even overall level. Off = none.",
  "MASTER_FX.B": "Reverb on the output.",
};

const EQ_ABOUT: Record<string, string> = {
  A: "Switch this equalizer on or off.",
  B: "Boost or cut the lows.",
  C: "Boost or cut the highs.",
  D: "Center of the low-mid band.",
  F: "Boost or cut around the low-mid frequency.",
  G: "Center of the high-mid band.",
  I: "Boost or cut around the high-mid frequency.",
  J: "Overall level after the EQ.",
  K: "Remove everything below this frequency. Flat = no cut.",
  L: "Remove everything above this frequency. Flat = no cut.",
};

for (const s of SYSTEM_SECTIONS) {
  s.summary = SUMMARY[s.id] ?? s.summary;
  for (const f of s.fields) {
    const about = ABOUT[`${s.id}.${f.key}`] ?? (s.id.startsWith("EQ_") ? EQ_ABOUT[f.key] : undefined);
    if (about) f.hint = about;
  }
}
