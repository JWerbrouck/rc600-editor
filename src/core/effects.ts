// Input FX (<ifx>) and track FX (<tfx>) of a memory. Same layout in both:
//   SETUP          A = selected bank (pedal state, not edited)
//   A–D            banks: A on/off, B mode (single/multi), C FX target (A–D, for an expression pedal)
//   AA–DD          slots (bank + FX letter): A on/off, B switch mode, C type, D insert
//   AA_LPF …       per slot, one parameter block per effect type; the type picks which one is used
//   …_SEQ          FX sequence per block (not edited here)
//
// Type numbers (TYPE_ORDER): 0–39 follow the order of the blocks in the file (0 = LPF …
// 35 = DELAY, 36 = PANNING DELAY, 39 = TAPE_ECHO). After that the file has two blocks the
// numbering skips, TAPE_ECHO_V505V2 and ROLL_V505V2, which come last (49, 50; likely added in
// later firmware): 40 GRANULAR … 45 CHORUS, 46 REVERB, 47 GATE REVERB, 48 REVERSE REVERB, then
// 51–54 the beat effects (track FX only). Confirmed by round 4 (DELAY 35, REVERB 46, CHORUS 45,
// TREMOLO 31, PANNING DELAY 36, RADIO 7, PITCH BEND 14) and per memory in earlier backups
// (slots with PREAMP, MANUAL PAN, LPF, AUTO PAN, G2B settings changed had 22, 29, 0, 28, 9).
//
// Parameters follow the Parameter Guide's FX list (pp. 36–45) and were checked against the
// factory values in the user's backups (e.g. DELAY 211/20/100/0/29/50: time, feedback 20,
// direct 100, low cut flat, high cut flat, effect 50). Settings whose value list isn't known
// (voice, note, slicer patterns, …) are "guess": hidden, and left as they are.
//
// Value lists from round 4 (TESTS.md):
//   RATE       14 tempo-synced steps (4/2/1 measures, then note values), then 0–100 at 14–114
//   STEP RATE  OFF, then the same list one higher (2 MEAS = 2)
//   TIME       12 note values, then 1–2000 ms at 12–2011 (stored ms + 11)
//   REVERB     time ×10 seconds (5.0 s = 50); pre-delay in ms; density as shown

import type { Confidence, Field } from "./schema";

export type FxRoot = "ifx" | "tfx";
export const FX_ROOTS: [FxRoot, string][] = [
  ["ifx", "Input FX"],
  ["tfx", "Track FX"],
];
export const BANKS = ["A", "B", "C", "D"] as const;

const OFF_ON = ["Off", "On"];
const FREQS = ["20 Hz", "25 Hz", "31.5 Hz", "40 Hz", "50 Hz", "63 Hz", "80 Hz", "100 Hz", "125 Hz", "160 Hz", "200 Hz", "250 Hz", "315 Hz", "400 Hz", "500 Hz", "630 Hz", "800 Hz", "1.00 kHz", "1.25 kHz", "1.60 kHz", "2.00 kHz", "2.50 kHz", "3.15 kHz", "4.00 kHz", "5.00 kHz", "6.30 kHz", "8.00 kHz", "10.0 kHz"];
const LOW_CUT = ["Flat", ...FREQS, "12.5 kHz"];
const HIGH_CUT = [...FREQS, "12.5 kHz", "Flat"];
const QS = ["0.5", "1", "2", "4", "8", "16"];
const KEYS = ["C (Am)", "D♭ (B♭m)", "D (Bm)", "E♭ (Cm)", "E (C♯m)", "F (Dm)", "F♯ (D♯m)", "G (Em)", "A♭ (Fm)", "A (F♯m)", "B♭ (Gm)", "B (G♯m)"];
const NOTES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const MODES = ["1 (classic)", "2 (new)"];

// Omit applied to each kind of Field separately (plain Omit would merge the union)
const SYNCED = Array.from({ length: 14 }, (_, i) => `Synced to tempo (${i + 1})`);
const NUMBERS = Array.from({ length: 101 }, (_, i) => String(i));
const RATE_HINT = "0–100, or synced to the tempo (measures and note values; choose those on the pedal).";

type Param = Field extends infer F ? (F extends Field ? Omit<F, "key"> : never) : never;
const level = (label: string, hint?: string): Param => ({ label, kind: "range", min: 0, max: 100, confidence: "likely", hint });
const plusMinus = (label: string, half: number, unit = ""): Param => ({
  label,
  kind: "range",
  min: 0,
  max: 2 * half,
  confidence: "likely",
  format: (v) => `${v > half ? "+" : ""}${v - half}${unit}`,
});
const dB = (label: string) => plusMinus(label, 20, " dB");
const pan = (label: string): Param => ({ label, kind: "range", min: 0, max: 100, confidence: "likely", format: (v) => (v === 50 ? "Center" : v < 50 ? `L${50 - v}` : `R${v - 50}`) });
const choice = (label: string, options: string[]): Param => ({ label, kind: "enum", options, confidence: "likely" });
const unknown = (label: string): Param => ({ label, kind: "raw", confidence: "guess" });
const rate = (label = "Rate"): Param => ({ label, kind: "enum", options: [...SYNCED, ...NUMBERS], confidence: "likely", hint: RATE_HINT });
const stepRate = (): Param => ({ label: "Step rate", kind: "enum", options: ["Off", ...SYNCED, ...NUMBERS], confidence: "likely", hint: "How fast the effect changes in steps. Off = smoothly." });
const time = (label = "Time"): Param => ({ label, kind: "range", min: 12, max: 2011, offset: 11, unit: "ms", confidence: "likely", hint: "1–2000 ms. Times synced to the tempo (note values) are chosen on the pedal." });

const LOWCUT = choice("Low cut", LOW_CUT);
const HIGHCUT = choice("High cut", HIGH_CUT);
const DLEVEL = level("Direct level", "Volume of the dry sound.");
const ELEVEL = level("Effect level", "Volume of the effect sound.");
const BALANCE = level("Balance", "Balance between the dry sound and the effect.");
const MODE = choice("Mode", MODES);
const filter = (): Param[] => [rate(), level("Depth"), level("Resonance"), level("Cutoff"), stepRate()];
const delay = (): Param[] => [time(), level("Feedback", "Number of repeats."), DLEVEL, LOWCUT, HIGHCUT, ELEVEL];
const reverbTime = (): Param => ({ label: "Time", kind: "range", min: 1, max: 100, format: (v) => `${(v / 10).toFixed(1)} s`, confidence: "likely" });
const preDelay = (): Param => ({ label: "Pre-delay", kind: "range", min: 0, max: 500, unit: "ms", offset: 0, confidence: "likely", hint: "Delay before the reverb starts." });
const reverb = (third: Param, timeParam: Param = reverbTime()): Param[] => [timeParam, preDelay(), third, LOWCUT, HIGHCUT, DLEVEL, ELEVEL];

export interface FxType {
  id: string; // block suffix, e.g. "PREAMP"
  name: string;
  about: string;
  keys: string[]; // field letters of the block, in order
  params: Param[];
  trackOnly?: boolean;
}

const t = (id: string, name: string, about: string, keys: string, params: Param[], trackOnly = false): FxType => ({
  id,
  name,
  about,
  keys: keys.split(""),
  params,
  trackOnly,
});

/** Index = type number stored in the slot. */
export const FX_TYPES: FxType[] = [
  t("LPF", "LPF", "Low-pass filter: cuts the highs above the cutoff.", "ABCDE", filter()),
  t("BPF", "BPF", "Band-pass filter: keeps only the band around the cutoff.", "ABCDE", filter()),
  t("HPF", "HPF", "High-pass filter: cuts the lows below the cutoff.", "ABCDE", filter()),
  t("PHASER", "Phaser", "Swirling, phase-shifted sound.", "ABCDEFGH", [rate(), level("Depth"), level("Resonance"), level("Manual"), unknown("E"), unknown("F"), unknown("G"), choice("Stage", ["4", "8", "12", "Bi-phase"])]),
  t("FLANGER", "Flanger", "Metallic, jet-like sweep.", "ABCDEFGH", [rate(), level("Depth"), level("Resonance"), level("Manual"), stepRate(), DLEVEL, ELEVEL, level("Separation", "How wide the sound spreads.")]),
  t("SYNTH", "Synth", "Turns the input into a synthesizer sound.", "ABCD", [level("Frequency"), level("Resonance"), level("Decay"), BALANCE]),
  t("LOFI", "Lo-fi", "Deliberately degraded, crunchy sound.", "ABD", [choice("Bit depth", ["Off", ...Array.from({ length: 31 }, (_, i) => String(31 - i))]), choice("Sample rate", ["Off", ...Array.from({ length: 31 }, (_, i) => `1/${i + 2}`)]), BALANCE]),
  t("RADIO", "Radio", "Sounds like a small radio.", "AB", [{ label: "Lo-fi", kind: "range", min: 0, max: 9, format: (v) => String(v + 1), confidence: "likely", hint: "How muffled the sound is, 1–10." }, level("Level")]),
  t("RING_MODULATOR", "Ring mod", "Metallic, bell-like tones.", "ABC", [level("Frequency"), BALANCE, MODE]),
  t("G2B", "G2B", "Guitar to bass: adds a bass sound an octave down.", "AB", [BALANCE, MODE]),
  t("SUSTAINER", "Sustainer", "Evens out loud and soft notes for longer sustain, without distortion.", "ABCDEF", [level("Attack"), level("Release"), level("Level"), dB("Low gain"), dB("High gain"), level("Sustain")]),
  t("AUTO_RIFF", "Auto riff", "Plays a phrase based on the note you play (single notes only).", "ABCDEFG", [choice("Phrase", Array.from({ length: 30 }, (_, i) => `P${i + 1}`)), unknown("Tempo"), choice("Hold", OFF_ON), level("Attack"), choice("Loop", OFF_ON), choice("Key", KEYS), BALANCE]),
  t("SLOW_GEAR", "Slow gear", "Volume swells, like a violin.", "ABCD", [level("Sensitivity"), level("Rise time"), level("Level"), MODE]),
  t("TRANSPOSE", "Transpose", "Shifts the pitch while the effect is on.", "AB", [plusMinus("Transpose", 12, " st"), MODE]),
  t("PITCH_BEND", "Pitch bend", "Bends the pitch, e.g. with an expression pedal.", "ABC", [choice("Pitch", ["-3 oct", "-2 oct", "-1 oct", "+1 oct", "+2 oct", "+3 oct", "+4 oct"]), level("Bend"), MODE]),
  t("ROBOT", "Robot", "Robot voice on a fixed note.", "ABC", [choice("Note", NOTES), plusMinus("Formant", 50), MODE]),
  t("ELECTRIC", "Electric", "Pitch-corrected, mechanical sound.", "ABCDE", [plusMinus("Shift", 12, " st"), plusMinus("Formant", 50), { label: "Speed", kind: "range", min: 0, max: 10, confidence: "likely" }, plusMinus("Stability", 10), choice("Scale", ["Chromatic", ...KEYS])]),
  t("HARMONIST_MANUAL", "Harmonist (manual)", "Adds a harmony in a fixed key.", "ABCDEF", [unknown("Voice"), plusMinus("Formant", 50), pan("Pan"), choice("Key", KEYS), DLEVEL, level("Harmony level")]),
  t("HARMONIST_AUTO", "Harmonist (MIDI)", "Adds a harmony that follows chords received over MIDI.", "ABCDEFG", [unknown("Voice"), plusMinus("Formant", 50), pan("Pan"), choice("Harmony mode", ["Hybrid", "Auto"]), choice("Key", KEYS), DLEVEL, level("Harmony level")]),
  t("VOCODER", "Vocoder", "Your voice shapes the sound of an input or track.", "ABCDEF", [choice("Carrier", ["Mic 1", "Mic 2", "Inst 1 L", "Inst 1 R", "Inst 2 L", "Inst 2 R", "Track 1", "Track 2", "Track 3", "Track 4", "Track 5", "Track 6"]), plusMinus("Tone", 50), level("Attack"), plusMinus("Mod sensitivity", 50), BALANCE, choice("Carrier thru", OFF_ON)]),
  t("OSC_VOCODER", "Osc vocoder (MIDI)", "Vocoder on a built-in oscillator played over MIDI.", "ABCDEFG", [choice("Carrier", ["Saw", "Vintage saw", "Detune saw", "Square", "Rect"]), plusMinus("Tone", 50), level("Attack"), choice("Octave", ["-2 oct", "-1 oct", "0", "+1 oct"]), plusMinus("Mod sensitivity", 50), level("Release"), BALANCE]),
  t("OSC_BOT", "Osc bot", "Oscillator that plays a set note, e.g. with the FX sequencer.", "ABCDEF", [choice("Oscillator", ["Saw", "Vintage saw", "Detune saw", "Square", "Rect"]), plusMinus("Tone", 50), level("Attack"), unknown("Note"), plusMinus("Mod sensitivity", 50), BALANCE]),
  t("PREAMP", "Preamp", "Guitar amp simulation.", "ABCDEFGHIJKL", [
    choice("Amp type", ["JC-120", "Natural clean", "Full range", "Combo crunch", "Stack crunch", "HiGain stack", "Power drive", "Extreme lead", "Core metal"]),
    choice("Speaker", ["Off", "Original", "1×8″", "1×10″", "1×12″", "2×12″", "4×10″", "4×12″", "8×12″"]),
    { label: "Gain", kind: "range", min: 0, max: 120, confidence: "likely" },
    plusMinus("T-comp", 10),
    level("Bass"),
    level("Middle"),
    level("Treble"),
    level("Presence"),
    choice("Mic type", ["DYN57", "DYN421", "CND451", "CND87", "Flat"]),
    choice("Mic distance", ["Off mic", "On mic"]),
    { label: "Mic position", kind: "range", min: 0, max: 10, confidence: "likely" },
    ELEVEL,
  ]),
  t("DIST", "Dist", "Distortion.", "ABCDE", [choice("Type", ["Vocal", "Boost", "OD", "DS", "Metal", "Fuzz"]), plusMinus("Tone", 50), level("Distortion"), DLEVEL, ELEVEL]),
  t("DYNAMICS", "Dynamics", "Compressors and limiters for an even level.", "AB", [
    choice("Type", ["Natural comp", "Mixer comp", "Live comp", "Natural lim", "Hard lim", "Jingle comp", "Hard comp", "Soft comp", "Clean comp", "Dance comp", "Orch comp", "Vocal comp", "Acoustic", "Rock band", "Orchestra", "Low boost", "Brighten", "DJ's voice", "Phone vox"]),
    plusMinus("Dynamics", 20),
  ]),
  t("EQ", "EQ", "Four-band equalizer.", "ABCDEFGHI", [dB("Low"), dB("Low-mid"), dB("High-mid"), dB("High"), dB("Level"), choice("Low-mid frequency", FREQS), choice("Low-mid Q", QS), choice("High-mid frequency", FREQS), choice("High-mid Q", QS)]),
  t("ISOLATOR", "Isolator", "Cuts or boosts one frequency band, rhythmically.", "ABCDEF", [choice("Band", ["Low", "Mid", "High"]), rate(), level("Band level"), level("Depth"), stepRate(), level("Waveform")]),
  t("OCTAVE", "Octave", "Adds notes one or two octaves down.", "ABC", [choice("Octave", ["-1 oct", "-2 oct", "-1 & -2 oct"]), level("Octave level"), MODE]),
  t("AUTO_PAN", "Auto pan", "Moves the sound left and right.", "ABCDE", [rate(), level("Waveform"), level("Depth"), { label: "Initial phase", kind: "range", min: 0, max: 180, confidence: "likely" }, stepRate()]),
  t("MANUAL_PAN", "Manual pan", "Sets the pan position, e.g. with an expression pedal.", "A", [pan("Position")]),
  t("STEREO_ENHANCE", "Stereo enhance", "Makes a mono sound wider.", "ABC", [LOWCUT, HIGHCUT, level("Enhance")]),
  t("TREMOLO", "Tremolo", "Volume that wobbles up and down.", "ABCD", [rate(), level("Depth"), level("Waveform"), unknown("D")]),
  t("VIBRATO", "Vibrato", "Pitch that wobbles up and down.", "ABCDE", [rate(), level("Depth"), level("Color"), DLEVEL, ELEVEL]),
  t("PATTERN_SLICER", "Pattern slicer", "Chops the sound in a rhythmic pattern.", "ABCDEFG", ["Rate", "Duty", "Attack", "Pattern", "Depth", "Threshold", "Gain"].map(unknown)),
  t("STEP_SLICER", "Step slicer", "Chops the sound in programmable steps.", "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#", Array.from({ length: 37 }, (_, i) => unknown(`Step value ${i + 1}`))),
  t("DELAY", "Delay", "Echoes of the sound.", "ABCDEF", delay()),
  t("PANNING_DELAY", "Panning delay", "Echoes that alternate left and right.", "ABCDEF", delay()),
  t("REVERSE_DELAY", "Reverse delay", "Echoes played backwards.", "ABCDEF", delay()),
  t("MOD_DELAY", "Mod delay", "Delay with a chorus-like shimmer.", "ABCDEFG", [time(), level("Feedback"), level("Mod depth"), DLEVEL, LOWCUT, HIGHCUT, ELEVEL]),
  t("TAPE_ECHO", "Tape echo (low/high cut)", "Tape echo with low and high cut.", "ABCDEF", [time("Repeat time"), level("Intensity"), DLEVEL, LOWCUT, HIGHCUT, ELEVEL]),
  t("TAPE_ECHO_V505V2", "Tape echo (bass/treble)", "Tape echo with bass and treble.", "ABCDEF", [unknown("Repeat rate"), level("Intensity"), DLEVEL, plusMinus("Bass", 50), plusMinus("Treble", 50), ELEVEL]),
  t("GRANULAR_DELAY", "Granular delay", "Delay made of tiny grains of sound.", "ABC", [level("Time"), level("Feedback"), ELEVEL]),
  t("WARP", "Warp", "Spacey, swelling sound.", "A", [level("Level")]),
  t("TWIST", "Twist", "Rising and falling sweep.", "ABCD", ["Release", "Rise", "Fall", "Level"].map(unknown)),
  t("ROLL", "Roll 1", "Repeats a short piece, like a stutter.", "ABCD", [unknown("Time"), level("Feedback"), unknown("Roll"), BALANCE]),
  t("ROLL_V505V2", "Roll 2", "Repeats a short piece, like a stutter.", "ABCD", [unknown("Time"), level("Repeat"), unknown("Roll"), BALANCE]),
  t("FREEZE", "Freeze", "Holds the sound like a pad.", "ABCDE", [level("Attack"), level("Release"), level("Decay"), level("Sustain"), BALANCE]),
  t("CHORUS", "Chorus", "Thickens the sound with a slightly detuned copy.", "ABCDEF", [rate(), level("Depth"), LOWCUT, HIGHCUT, DLEVEL, ELEVEL]),
  t("REVERB", "Reverb", "Room or hall ambience.", "ABCDEFG", reverb({ label: "Density", kind: "range", min: 0, max: 10, confidence: "likely" })),
  t("GATE_REVERB", "Gate reverb", "Reverb that is cut off abruptly.", "ABCDEFG", reverb(level("Threshold"))),
  t("REVERSE_REVERB", "Reverse reverb", "Reverb that swells in before the sound.", "ABCDEFG", reverb(unknown("Gate time"), unknown("Time"))),
  t("BEAT_SCATTER", "Beat scatter", "Shuffles beats of the loop.", "AB", ["Type", "Length"].map(unknown), true),
  t("BEAT_REPEAT", "Beat repeat", "Repeats beats of the loop.", "AB", ["Type", "Length"].map(unknown), true),
  t("BEAT_SHIFT", "Beat shift", "Shifts the loop in time.", "AB", ["Type", "Shift"].map(unknown), true),
  t("VINYL_FLICK", "Vinyl flick", "Record-player noise and wobble.", "A", [level("Flick")], true),
];

/** Block ids in type-number order: the number stored in a slot is the index here. */
const TYPE_ORDER = [
  ...FX_TYPES.slice(0, 40).map((f) => f.id), // LPF … TAPE_ECHO
  "GRANULAR_DELAY", "WARP", "TWIST", "ROLL", "FREEZE", "CHORUS", "REVERB", "GATE_REVERB", "REVERSE_REVERB",
  "TAPE_ECHO_V505V2", "ROLL_V505V2",
  "BEAT_SCATTER", "BEAT_REPEAT", "BEAT_SHIFT", "VINYL_FLICK",
];

/** The effect stored as type number n, or undefined. */
export const typeByNumber = (n: number): FxType | undefined => FX_TYPES.find((f) => f.id === TYPE_ORDER[n]);

/** Types offered for input or track FX, as [type number, type], in number order. */
export const typesFor = (root: FxRoot) =>
  TYPE_ORDER.map((id, n) => [n, FX_TYPES.find((f) => f.id === id)!] as const).filter(([, f]) => root === "tfx" || !f.trackOnly);

/** Slot letters: bank A–D + FX A–D, e.g. "BC" = bank B, FX C. */
export const slotId = (bank: number, fx: number) => `${BANKS[bank]}${BANKS[fx]}`;

export const BANK_FIELDS: Field[] = [
  { key: "A", label: "Bank on", kind: "enum", options: OFF_ON, confidence: "likely", hint: "Turns this FX bank on or off." },
  { key: "B", label: "Mode", kind: "enum", options: ["Single", "Multi"], confidence: "likely", hint: "Single: only one of FX A–D can be on at a time. Multi: any combination." },
  { key: "C", label: "Expression pedal controls", kind: "enum", options: ["FX A", "FX B", "FX C", "FX D"], confidence: "likely", hint: "Which effect's intensity an expression pedal controls." },
];

export function slotFields(root: FxRoot): Field[] {
  return [
    { key: "A", label: "On", kind: "enum", options: OFF_ON, confidence: "confirmed" },
    { key: "B", label: "Switch mode", kind: "enum", options: ["Toggle", "Momentary"], confidence: "likely", hint: "Toggle: each press turns it on or off. Momentary: on only while the switch is held." },
    {
      key: "D",
      label: "Applies to",
      kind: "enum",
      options: root === "ifx" ? ["All inputs", "Mic 1", "Mic 2", "Inst 1 L", "Inst 1 R", "Inst 2 L", "Inst 2 R"] : ["All tracks", "Track 1", "Track 2", "Track 3", "Track 4", "Track 5", "Track 6"],
      confidence: "likely",
      hint: root === "ifx" ? "Which inputs this effect is applied to." : "Which tracks this effect is applied to.",
    },
  ];
}

/** The parameters of a type as fields (key = the block's field letter). */
export function typeFields(type: FxType): Field[] {
  return type.params.map((p, i) => ({ ...p, key: type.keys[i] }) as Field);
}

export const fxPath = (root: FxRoot, container: string, key: string) => `${root}/${container}.${key}`;

/** Label for a changed value in the write review, or null if it isn't an FX value. */
export function describeFx(path: string): { label: string; field?: Field } | null {
  const m = path.match(/^(ifx|tfx)\/([A-D])([A-D])?(?:_([A-Z0-9_]+))?\.([A-Z0-9#])$/);
  if (!m) return null;
  const [, root, bank, fx, block, key] = m;
  const where = `${root === "ifx" ? "Input" : "Track"} FX ${bank}${fx ? `-${fx}` : ""}`;
  if (!fx) {
    const field = BANK_FIELDS.find((f) => f.key === key);
    return { label: `${where} bank: ${field?.label.toLowerCase() ?? key}`, field };
  }
  if (!block) {
    if (key === "C") return { label: `${where}: type`, field: { key, label: "Type", kind: "enum", options: TYPE_ORDER.map((_, n) => typeByNumber(n)!.name), confidence: "confirmed" } };
    const field = slotFields(root as FxRoot).find((f) => f.key === key);
    return { label: `${where}: ${field?.label.toLowerCase() ?? key}`, field };
  }
  const type = FX_TYPES.find((f) => f.id === block);
  const field = type && typeFields(type).find((f) => f.key === key);
  return { label: `${where} ${type?.name ?? block}: ${field?.label.toLowerCase() ?? key}`, field };
}

export type { Confidence };
