// Meaning of the values in a memory's <mem> block. Mirrors schema/memory.json;
// keep the two in step when a device test confirms or corrects a field.
//
// confidence:
//   confirmed / likely  editable
//   guess               shown as a raw number, not editable until a device test confirms it
//   state               written by the pedal while recording; never edited, never copied

export type Confidence = "confirmed" | "likely" | "guess";

interface Base {
  key: string; // field letter inside the container
  label: string;
  confidence: Confidence;
  hint?: string;
}

export type Field =
  | (Base & { kind: "enum"; options: string[] })
  | (Base & {
      kind: "range";
      min: number;
      max: number;
      format?: (v: number) => string;
      /** Shown and typed as stored value − offset, with a unit (e.g. delay time: stored ms + 11). */
      offset?: number;
      unit?: string;
      /** Shown as stored value ÷ scale (tempo ×10 → 60.0). */
      scale?: number;
    })
  | (Base & { kind: "bitmask"; bits: string[]; groups?: { label: string; bits: [bit: number, short: string][] }[] })
  | (Base & { kind: "measure" })
  | (Base & { kind: "raw" });

const OFF_ON = ["Off", "On"];

export const TRACK_FIELDS: Field[] = [
  { key: "A", label: "Reverse", kind: "enum", options: OFF_ON, confidence: "likely" },
  { key: "B", label: "One-shot", kind: "enum", options: OFF_ON, confidence: "likely" },
  { key: "C", label: "Pan", kind: "range", min: 0, max: 100, confidence: "likely", format: formatPan },
  { key: "D", label: "Play level", kind: "range", min: 0, max: 200, confidence: "confirmed" },
  { key: "E", label: "Start", kind: "enum", options: ["Immediate", "Fade in"], confidence: "likely" },
  { key: "F", label: "Stop", kind: "enum", options: ["Immediate", "Fade out", "End of loop"], confidence: "likely" },
  { key: "G", label: "Overdub mode", kind: "enum", options: ["Overdub", "Replace 1", "Replace 2"], confidence: "likely" },
  { key: "H", label: "Effects", kind: "enum", options: OFF_ON, confidence: "likely" },
  { key: "I", label: "Play mode", kind: "enum", options: ["Multi", "Single"], confidence: "likely" },
  { key: "J", label: "Measures", kind: "measure", confidence: "confirmed" },
  { key: "L", label: "Loop sync", kind: "enum", options: OFF_ON, confidence: "confirmed" },
  // Loop sync mode is stored at the end of the track block, after the recording state
  { key: "Y", label: "Loop sync mode", kind: "enum", options: ["Immediate", "Measure", "Loop length"], confidence: "confirmed" },
  { key: "M", label: "Tempo sync", kind: "enum", options: OFF_ON, confidence: "likely" },
  { key: "N", label: "Tempo sync mode", kind: "enum", options: ["Pitch", "XFade"], confidence: "confirmed" },
  { key: "O", label: "Speed", kind: "enum", options: ["Half", "Normal", "Double"], confidence: "likely" },
  { key: "P", label: "Bounce in", kind: "enum", options: OFF_ON, confidence: "likely" },
  {
    key: "Q",
    label: "Inputs",
    kind: "bitmask",
    bits: ["Mic 1", "Mic 2", "Inst 1 L", "Inst 1 R", "Inst 2 L", "Inst 2 R", "Rhythm"],
    // Laid out like the pedal's jacks, so it fits a narrow track column
    groups: [
      { label: "Mic", bits: [[0, "1"], [1, "2"]] },
      { label: "Inst 1", bits: [[2, "L"], [3, "R"]] },
      { label: "Inst 2", bits: [[4, "L"], [5, "R"]] },
      { label: "Rhythm", bits: [[6, "On"]] },
    ],
    confidence: "likely",
    hint: "Mic 1 and Rhythm confirmed by tests 4–5. With stereo link on, the pedal only switches the L bit of a pair.",
  },
  { key: "K", label: "Track (K)", kind: "raw", confidence: "guess", hint: "0 in every memory so far; meaning unknown" },
];

/** Fade time: 4 note lengths (0 = shortest, a 1/16 note), then 1–64 measures at 4–67. */
export const FADE_TIMES = [
  "Note value 1 (1/16)",
  "Note value 2",
  "Note value 3",
  "Note value 4",
  ...Array.from({ length: 64 }, (_, i) => `${i + 1} meas.`),
];

export const REC_FIELDS: Field[] = [
  { key: "A", label: "Rec action", kind: "enum", options: ["Rec → Dub", "Rec → Play"], confidence: "confirmed" },
  { key: "B", label: "Quantize", kind: "enum", options: ["Off", "Measure"], confidence: "likely" },
  { key: "C", label: "Auto rec", kind: "enum", options: OFF_ON, confidence: "likely" },
  { key: "D", label: "Auto rec sensitivity", kind: "range", min: 1, max: 100, confidence: "likely" },
  { key: "E", label: "Bounce", kind: "enum", options: OFF_ON, confidence: "likely" },
  { key: "F", label: "Bounce tracks", kind: "bitmask", bits: ["1", "2", "3", "4", "5", "6"], confidence: "likely" },
];

export const PLAY_FIELDS: Field[] = [
  { key: "A", label: "Single-track change", kind: "enum", options: ["Immediate", "End of loop"], confidence: "likely" },
  { key: "B", label: "Fade-in time", kind: "enum", options: FADE_TIMES, confidence: "confirmed" },
  { key: "C", label: "Fade-out time", kind: "enum", options: FADE_TIMES, confidence: "confirmed" },
  { key: "D", label: "Start with all", kind: "bitmask", bits: ["1", "2", "3", "4", "5", "6"], confidence: "likely" },
  { key: "E", label: "Stop with all", kind: "bitmask", bits: ["1", "2", "3", "4", "5", "6"], confidence: "likely" },
  { key: "F", label: "Loop length", kind: "range", min: 0, max: 99, confidence: "likely", format: (v) => (v === 0 ? "Auto" : `${v} meas.`) },
  { key: "G", label: "Speed change", kind: "enum", options: ["Immediate", "End of loop"], confidence: "likely" },
  { key: "H", label: "Sync adjust", kind: "enum", options: ["Beat", "Measure"], confidence: "confirmed" },
];

export const GENRES = ["Acoustic", "Ballad", "Blues", "Jazz", "Fusion", "R&B", "Soul", "Funk", "Pop", "Soft rock", "Rock", "Alt rock", "Punk", "Heavy rock", "Metal", "Trad", "World", "Ballroom", "Electro", "Guide", "User"];
export const KITS = ["Studio", "Live", "Light", "Heavy", "Rock", "Metal", "Jazz", "Brush", "Cajon", "Drum & bass", "R&B", "Dance", "Techno", "Dance beats", "Hip-hop", "808+909"];
export const BEATS = ["2/4", "3/4", "4/4", "5/4", "6/4", "7/4", "5/8", "6/8", "7/8", "8/8", "9/8", "10/8", "11/8", "12/8", "13/8", "14/8", "15/8"];
/** Length of each beat setting in quarter notes. */
const BEAT_QUARTERS = [2, 3, 4, 5, 6, 7, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5];

// RHYTHM.F (beat) is handled with tempo, because it can't change once a track is recorded.
export const RHYTHM_FIELDS: Field[] = [
  { key: "A", label: "Genre", kind: "enum", options: GENRES, confidence: "likely" },
  { key: "B", label: "Pattern", kind: "range", min: 0, max: 99, confidence: "likely", format: (v) => String(v + 1), hint: "Number within the genre, as the pedal shows it (Parameter Guide p. 46)" },
  { key: "C", label: "Variation", kind: "enum", options: ["A", "B", "C", "D"], confidence: "likely" },
  { key: "E", label: "Kit", kind: "enum", options: KITS, confidence: "likely" },
  { key: "K", label: "Start", kind: "enum", options: ["Loop start", "Rec end", "Before loop"], confidence: "confirmed" },
  { key: "L", label: "Stop", kind: "enum", options: ["Off", "Loop stop", "Rec end"], confidence: "confirmed" },
  { key: "H", label: "Intro on rec", kind: "enum", options: OFF_ON, confidence: "confirmed" },
  { key: "I", label: "Intro on play", kind: "enum", options: OFF_ON, confidence: "confirmed" },
  { key: "J", label: "Ending", kind: "enum", options: OFF_ON, confidence: "confirmed" },
  { key: "G", label: "Fill", kind: "enum", options: OFF_ON, confidence: "confirmed" },
  { key: "D", label: "Variation change", kind: "enum", options: ["Measure", "End of loop"], confidence: "likely", hint: "Test 13 also changed M" },
  { key: "M", label: "Rhythm (M)", kind: "raw", confidence: "guess", hint: "Changed together with variation change in test 13" },
];

export const TRACKS = [1, 2, 3, 4, 5, 6] as const;

/** Groups the editor can copy from one memory to others. Only setting values, never recording state. */
export const COPY_GROUPS = {
  tracks: { label: "Track settings (all six tracks)", paths: TRACKS.flatMap((t) => TRACK_FIELDS.map((f) => `mem/TRACK${t}.${f.key}`)) },
  rec: { label: "Recording", paths: REC_FIELDS.map((f) => `mem/REC.${f.key}`) },
  play: { label: "Playback", paths: PLAY_FIELDS.map((f) => `mem/PLAY.${f.key}`) },
  rhythm: { label: "Rhythm (not the beat)", paths: RHYTHM_FIELDS.map((f) => `mem/RHYTHM.${f.key}`) },
  tempo: { label: "Tempo and beat (only into memories without recordings)", paths: ["mem/MASTER.A", "mem/MASTER.B", "mem/RHYTHM.F"] },
} as const;
export type CopyGroup = keyof typeof COPY_GROUPS;

export const NAME_LENGTH = 12;
const NAME_KEYS = "ABCDEFGHIJKL".split("");
export const namePaths = NAME_KEYS.map((k) => `mem/NAME.${k}`);

export const TEMPO_MIN = 40;
export const TEMPO_MAX = 300;

export function formatPan(v: number): string {
  if (v === 50) return "Center";
  return v < 50 ? `L${50 - v}` : `R${v - 50}`;
}

/** Measure setting: 0 Auto, 1 Free, 2–7 note lengths (2 = shortest), 8+ = (n − 7) measures. */
export function formatMeasure(v: number): string {
  if (v === 0) return "Auto";
  if (v === 1) return "Free";
  if (v < 8) return `Note value ${v - 1}`;
  return `${v - 7} meas.`;
}
/** The pedal goes to at least 600 measures (round 2, test 10); the editor offers up to this many. */
export const MEASURE_MAX_MEASURES = 64;

/** Samples per measure at 44.1 kHz, which the pedal stores next to the tempo (MASTER.B). */
export function samplesPerMeasure(tempoBpm: number, beat: number): number {
  return Math.round((44100 * 60 * BEAT_QUARTERS[beat]) / tempoBpm);
}

export function decodeBitmask(value: number, count: number): boolean[] {
  return Array.from({ length: count }, (_, i) => Boolean(value & (1 << i)));
}

export function encodeBitmask(bits: boolean[]): number {
  return bits.reduce((acc, on, i) => (on ? acc | (1 << i) : acc), 0);
}

export function displayValue(field: Field, v: number): string {
  switch (field.kind) {
    case "enum":
      return field.options[v] ?? `? (${v})`;
    case "range":
      if (field.format) return field.format(v);
      if (field.offset !== undefined || field.scale) {
        if (v < field.min && field.offset) return "synced to tempo";
        return `${(v - (field.offset ?? 0)) / (field.scale ?? 1)}${field.unit ? ` ${field.unit}` : ""}`;
      }
      return String(v);
    case "bitmask": {
      const on = field.bits.filter((_, i) => v & (1 << i));
      return on.length === field.bits.length ? "All" : on.length ? on.join(", ") : "None";
    }
    case "measure":
      return formatMeasure(v);
    case "raw":
      return String(v);
  }
}

export const isEditable = (f: Field) => f.confidence !== "guess";

/**
 * Short explanations shown behind the info buttons, keyed by `SECTION.FIELD`
 * (TRACK applies to all six tracks). Written for this editor, based on the Parameter Guide.
 */
export const INFO: Record<string, string> = {
  "TRACK.A": "Plays the track backwards. Once a reversed track is recorded, you can't overdub on it.",
  "TRACK.B": "One-shot: the track plays once to the end and stops. Pressing REC/PLAY while it plays restarts it from the beginning. No overdubbing.",
  "TRACK.C": "Where the track sits in the stereo image.",
  "TRACK.D": "Playback volume of the track. 100 is unity.",
  "TRACK.E": "Whether the track starts at full volume or fades in. The fade length is the playback fade-in time.",
  "TRACK.F": "What STOP does: stop at once, fade out, or play to the end of the loop first.",
  "TRACK.G": "Overdub layers new playing on top. Replace 1 overwrites while you hear the old part; Replace 2 overwrites without playing it.",
  "TRACK.H": "Whether the input and track effects apply to this track.",
  "TRACK.I": "Multi plays all tracks together. Single plays one track at a time: starting another track stops the current one.",
  "TRACK.J": "Length of the track before you record. Free follows your recording; a number of measures makes the loop close by itself at that length.",
  "TRACK.K": "A track value that is 0 in every memory so far. Its meaning isn't known, so it's left alone.",
  "TRACK.L": "On: the track records and plays in time with the memory tempo or other synced tracks. Off: free length, no syncing.",
  "TRACK.Y": "How loop sync lines up: Immediate starts at once and rounds the length to whole measures; Measure starts on the next measure; Loop length lines tracks up to the playback loop length.",
  "TRACK.M": "On: the track plays at the memory's tempo. Off: it keeps the tempo it was recorded at.",
  "TRACK.N": "With tempo sync on, whether a tempo change also changes the pitch, or keeps the pitch.",
  "TRACK.O": "Plays the track at half, normal or double speed.",
  "TRACK.P": "Whether the sound of other tracks may be recorded into this track (bounce).",
  "TRACK.Q": "Which inputs are recorded into this track. With stereo link on, the pedal treats L and R as one input.",
  "REC.A": "The order REC/PLAY steps through after recording: record → overdub → play, or record → play → overdub.",
  "REC.B": "Off: recording starts the moment you press. Measure: it snaps to the start of the next measure (with rhythm or synced tracks).",
  "REC.C": "Recording waits until you start playing, instead of starting on the switch press.",
  "REC.D": "How loud the input has to be before auto rec starts recording.",
  "REC.E": "Turns bounce recording on, so tracks can be recorded into another track.",
  "REC.F": "The tracks that are bounced into the track you're recording.",
  "PLAY.A": "In single play mode: switch tracks at once, or at the end of the loop.",
  "PLAY.B": "How long a fade-in lasts when a track's start is set to fade in. The four shortest steps are note values (the first is a 1/16 note).",
  "PLAY.C": "How long a fade-out lasts when a track's stop is set to fade out.",
  "PLAY.D": "Tracks that start when ALL START (or MIDI start) is used.",
  "PLAY.E": "Tracks that stop when ALL STOP (or MIDI stop) is used.",
  "PLAY.F": "Length that loop sync lines tracks up to. Auto uses the first recorded track.",
  "PLAY.G": "When a speed change (half/double) takes effect: at once, or at the end of the loop.",
  "PLAY.H": "How far out of line tracks may be before they're pulled back in sync: a beat or a measure.",
  "RHYTHM.A": "Style of the built-in rhythm. Guide is a simple click.",
  "RHYTHM.B": "Pattern within the genre. The list is in the Parameter Guide.",
  "RHYTHM.C": "Variation A–D of the pattern.",
  "RHYTHM.E": "Drum kit that plays the pattern.",
  "RHYTHM.K": "When the rhythm starts: with the loop, after the first recording, or before the loop (one press starts the rhythm, the next starts recording in time).",
  "RHYTHM.L": "When the rhythm stops: never, when the loop stops, or when the first recording ends (a guide for recording only).",
  "RHYTHM.H": "Plays a count-in intro before recording starts.",
  "RHYTHM.I": "Plays the rhythm's intro when playback starts (not while tracks or the rhythm are already playing).",
  "RHYTHM.J": "Plays the rhythm's ending when it stops.",
  "RHYTHM.G": "Adds drum fills when you switch variation.",
  "RHYTHM.D": "When a variation change happens: at the next measure, or at the end of the loop.",
  "RHYTHM.M": "Not known yet. It changed together with variation change in test 13.",
  tempo: "Tempo of the memory and its rhythm. Locked once a track has audio, because the recording is tied to it.",
  beat: "Time signature of the rhythm and loop measures. Can't change after recording.",
};
