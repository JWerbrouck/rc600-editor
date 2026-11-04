// A block is one loop written in MuseScore and exported as MusicXML: one file, one or
// more staves (parts). The arranger references blocks by file name, so editing the file
// changes every place the block is used.

export interface Time {
  beats: number;
  beatType: number;
  text: string; // "4/4", "6/8"
}

/** What is in force at the start of a bar: key, time and clefs, as serialized XML for comparison. */
export interface BarState {
  key: string | null;
  time: Time | null;
  clefs: Map<string, string>; // staff number → <clef> XML
  divisions: number;
}

export interface BlockPart {
  name: string;
  measures: Element[];
  states: BarState[]; // per measure
  staves: number;
}

export interface Block {
  file: string;
  name: string;
  parts: BlockPart[];
  bars: number;
  time: Time | null; // of the first bar
  keyName: string | null;
  problems: string[];
}

const KEYS_MAJOR = ["C♭", "G♭", "D♭", "A♭", "E♭", "B♭", "F", "C", "G", "D", "A", "E", "B", "F♯", "C♯"];
const KEYS_MINOR = ["A♭m", "E♭m", "B♭m", "Fm", "Cm", "Gm", "Dm", "Am", "Em", "Bm", "F♯m", "C♯m", "G♯m", "D♯m", "A♯m"];

export const blockName = (file: string) => file.replace(/\.(musicxml|xml|mxl)$/i, "");
export const isBlockFile = (file: string) => /\.(musicxml|xml|mxl)$/i.test(file);

const kids = (el: Element, tag?: string) => [...el.children].filter((c) => !tag || c.localName === tag);
const text = (el: Element | undefined | null, tag: string) => (el ? kids(el, tag)[0]?.textContent?.trim() ?? null : null);
const serialize = (el: Element) => new XMLSerializer().serializeToString(el).replace(/\s+xmlns="[^"]*"/, "");

export function parseTime(el: Element): Time | null {
  if (el.getAttribute("symbol") === "senza-misura" || kids(el, "senza-misura").length) return null;
  const beats = kids(el, "beats").map((b) => b.textContent!.split("+").reduce((s, n) => s + Number(n), 0));
  const types = kids(el, "beat-type").map((b) => Number(b.textContent));
  if (!beats.length || !types.length) return null;
  // Composite signatures (2/4+3/8) are summed in quarter notes and shown as written
  const quarters = beats.reduce((s, b, i) => s + (b * 4) / (types[i] ?? types[0]), 0);
  const beatType = Math.max(...types);
  return {
    beats: (quarters * beatType) / 4,
    beatType,
    text: beats.map((b, i) => `${b}/${types[i] ?? types[0]}`).join("+"),
  };
}

/** Length of a bar in divisions under a time signature. */
export const barLength = (t: Time, divisions: number) => Math.round(((t.beats * 4) / t.beatType) * divisions);

/** How far a bar's notes reach, in divisions (the longest voice). */
export function measureLength(m: Element): number {
  let pos = 0;
  let max = 0;
  for (const c of kids(m)) {
    const d = Number(text(c, "duration") ?? 0);
    if (c.localName === "note") {
      if (kids(c, "chord").length || kids(c, "grace").length) continue;
      pos += d;
    } else if (c.localName === "backup") pos -= d;
    else if (c.localName === "forward") pos += d;
    max = Math.max(max, pos);
  }
  return max;
}

/** The attributes elements that come before the first note of a bar. */
export function leadingAttributes(m: Element): Element[] {
  const out: Element[] = [];
  for (const c of kids(m)) {
    if (c.localName === "note" || c.localName === "backup" || c.localName === "forward") break;
    if (c.localName === "attributes") out.push(c);
  }
  return out;
}

export function parseBlock(file: string, xml: string): Block {
  const block: Block = { file, name: blockName(file), parts: [], bars: 0, time: null, keyName: null, problems: [] };
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const root = doc.documentElement;
  if (root.localName === "parsererror" || doc.getElementsByTagName("parsererror").length) {
    block.problems.push("This file isn't readable MusicXML.");
    return block;
  }
  if (root.localName === "score-timewise") {
    block.problems.push("Timewise MusicXML isn't supported. Export from MuseScore as MusicXML.");
    return block;
  }
  if (root.localName !== "score-partwise") {
    block.problems.push("This file isn't a MusicXML score.");
    return block;
  }
  const names = new Map<string, string>();
  for (const sp of root.querySelectorAll("part-list > score-part")) {
    names.set(sp.getAttribute("id") ?? "", text(sp, "part-name") || text(sp, "part-abbreviation") || "Staff");
  }
  const problems = new Set<string>();
  for (const part of kids(root, "part")) {
    const measures = kids(part, "measure");
    const state: BarState = { key: null, time: null, clefs: new Map(), divisions: 1 };
    const states: BarState[] = [];
    let staves = 1;
    measures.forEach((m, i) => {
      for (const a of leadingAttributes(m)) {
        const div = Number(text(a, "divisions"));
        if (div > 0) state.divisions = div;
        const key = kids(a, "key")[0];
        if (key) state.key = serialize(key);
        const time = kids(a, "time")[0];
        if (time) state.time = parseTime(time);
        const st = Number(text(a, "staves"));
        if (st > 0) staves = st;
        for (const clef of kids(a, "clef")) state.clefs.set(clef.getAttribute("number") ?? "1", serialize(clef));
      }
      // divisions can also change mid-bar; the merge rescales from the bar's last value
      for (const a of kids(m, "attributes")) {
        const div = Number(text(a, "divisions"));
        if (div > 0 && !leadingAttributes(m).includes(a)) problems.add("Divisions change in the middle of a bar; durations may be off.");
      }
      states.push({ ...state, clefs: new Map(state.clefs) });
      if (state.time) {
        const want = barLength(state.time, state.divisions);
        const got = measureLength(m);
        if (i === 0 && m.getAttribute("implicit") === "yes") problems.add("Starts with a pickup bar. Blocks should be whole bars.");
        else if (got < want) problems.add(`Bar ${i + 1} is shorter than ${state.time.text}.`);
        else if (got > want) problems.add(`Bar ${i + 1} is longer than ${state.time.text}.`);
      }
    });
    block.parts.push({ name: names.get(part.getAttribute("id") ?? "") ?? `Staff ${block.parts.length + 1}`, measures, states, staves });
  }
  if (!block.parts.length) problems.add("This score has no staves.");
  block.bars = Math.max(0, ...block.parts.map((p) => p.measures.length));
  if (block.parts.some((p) => p.measures.length !== block.bars)) problems.add("Staves have different numbers of bars.");
  const first = block.parts[0]?.states[0];
  block.time = first?.time ?? null;
  if (first?.key) {
    const k = new DOMParser().parseFromString(first.key, "application/xml").documentElement;
    const fifths = Number(text(k, "fifths") ?? 0);
    block.keyName = (text(k, "mode") === "minor" ? KEYS_MINOR : KEYS_MAJOR)[fifths + 7] ?? null;
  }
  block.problems = [...problems];
  return block;
}
