// An arrangement: sections (Intro, Verse…) in order, and per section which block each
// lane (RC-600 track) plays and how many times. Blocks are referenced by name, never
// copied, so re-exporting a block from MuseScore updates the whole arrangement.
//
// buildScore() joins the blocks into one MusicXML score with one staff per used lane.

import { barLength, leadingAttributes, type Block, type Time } from "./block";

export interface Cell {
  block: string; // block name (file name without extension)
  part: number; // which staff of the block
  times: number;
}

export interface Section {
  id: string;
  name: string;
  /** Bars when longer than its blocks, e.g. for an empty or shorter-than-the-rest section. */
  minBars: number;
  cells: (Cell | null)[]; // one per lane
}

export interface Arrangement {
  version: 1;
  title: string;
  tempo: number | null;
  lanes: string[];
  sections: Section[];
}

export const ARRANGEMENT_FILE = "arrangement.json";
export const SOFTWARE = "RC-600 Editor arranger";

const newId = () => Math.random().toString(36).slice(2, 10);

export function newSection(name: string, lanes: number): Section {
  return { id: newId(), name, minBars: 0, cells: Array.from({ length: lanes }, () => null) };
}

export function newArrangement(title: string): Arrangement {
  const lanes = Array.from({ length: 6 }, (_, i) => `Track ${i + 1}`);
  return { version: 1, title, tempo: null, lanes, sections: [newSection("Intro", 6), newSection("Verse", 6), newSection("Chorus", 6)] };
}

export function parseArrangement(json: unknown): Arrangement {
  const a = json as Partial<Arrangement>;
  if (!a || a.version !== 1 || !Array.isArray(a.lanes) || !Array.isArray(a.sections)) throw new Error("This isn't an arrangement file.");
  const lanes = a.lanes.map(String);
  return {
    version: 1,
    title: String(a.title ?? "Untitled"),
    tempo: typeof a.tempo === "number" && a.tempo > 0 ? a.tempo : null,
    lanes,
    sections: a.sections.map((s) => ({
      id: String(s.id ?? newId()),
      name: String(s.name ?? ""),
      minBars: Number.isInteger(s.minBars) && s.minBars >= 0 ? s.minBars : 0,
      cells: lanes.map((_, i) => {
        const c = s.cells?.[i];
        return c && typeof c.block === "string"
          ? { block: c.block, part: Number.isInteger(c.part) ? c.part : 0, times: Number.isInteger(c.times) && c.times > 0 ? c.times : 1 }
          : null;
      }),
    })),
  };
}

/** Bars a cell fills, or 0 when its block is missing. */
export function cellBars(c: Cell | null, blocks: Map<string, Block>): number {
  const b = c && blocks.get(c.block);
  return b ? b.bars * c.times : 0;
}

export function sectionBars(s: Section, blocks: Map<string, Block>): number {
  return Math.max(1, s.minBars, ...s.cells.map((c) => cellBars(c, blocks)));
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

export interface ScoreResult {
  xml: string;
  bars: number;
  problems: string[];
}

const DEFAULT_TIME: Time = { beats: 4, beatType: 4, text: "4/4" };
const DEFAULT_KEY = "<key><fifths>0</fifths></key>";
const DEFAULT_CLEF = "<clef><sign>G</sign><line>2</line></clef>";

export function buildScore(arr: Arrangement, blocks: Map<string, Block>): ScoreResult {
  const problems: string[] = [];
  const partOf = (c: Cell | null) => {
    const b = c && blocks.get(c.block);
    return b && b.parts[c.part] ? b.parts[c.part] : b?.parts[0] ?? null;
  };
  for (const s of arr.sections) {
    s.cells.forEach((c, lane) => {
      if (c && !blocks.has(c.block)) problems.push(`${s.name} › ${arr.lanes[lane]}: block "${c.block}" isn't in the song folder.`);
    });
  }
  const lanes = arr.lanes.map((_, i) => i).filter((i) => arr.sections.some((s) => partOf(s.cells[i])));

  // One divisions value for the whole score, so every block's durations fit
  let divisions = 1;
  for (const s of arr.sections) for (const c of s.cells) partOf(c)?.states.forEach((st) => (divisions = lcm(divisions, st.divisions)));

  // Time signature per section: from the first block in it, else carried over
  const sectionTimes: Time[] = [];
  let carry: Time = DEFAULT_TIME;
  for (const s of arr.sections) {
    const first = s.cells.map(partOf).find((p) => p?.states[0]?.time);
    carry = first?.states[0].time ?? carry;
    sectionTimes.push(carry);
    s.cells.forEach((c, lane) => {
      const t = partOf(c)?.states[0]?.time;
      if (t && t.text !== carry.text) problems.push(`${s.name} › ${arr.lanes[lane]}: "${c!.block}" is in ${t.text} but the section is in ${carry.text}.`);
    });
  }

  const doc = document.implementation.createDocument(null, "score-partwise", null);
  const root = doc.documentElement;
  root.setAttribute("version", "4.0");
  const el = (tag: string, content?: string | Node[], attrs: Record<string, string> = {}) => {
    const e = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (typeof content === "string") e.textContent = content;
    else content?.forEach((n) => e.appendChild(n));
    return e;
  };
  const fragment = (xml: string) => doc.importNode(new DOMParser().parseFromString(xml, "application/xml").documentElement, true);

  root.appendChild(el("work", [el("work-title", arr.title)]));
  root.appendChild(el("identification", [el("encoding", [el("software", SOFTWARE)])]));
  root.appendChild(el("part-list", lanes.map((l, i) => el("score-part", [el("part-name", arr.lanes[l])], { id: `P${i + 1}` }))));

  let totalBars = 0;
  lanes.forEach((lane, li) => {
    const part = el("part", [], { id: `P${li + 1}` });
    root.appendChild(part);
    const blockParts = arr.sections.map((s) => partOf(s.cells[lane]));
    const firstPart = blockParts.find(Boolean)!;
    const staves = Math.max(...blockParts.map((p) => p?.staves ?? 1));
    // What the lane's staff shows right now, so repeated key/time/clefs aren't written again
    let key: string | null = null;
    let time: Time | null = null;
    const clefs = new Map<string, string>();
    let bar = 0;

    const attributes = (want: { key: string; time: Time; clefs: Map<string, string> }, rest: Element[]) => {
      const out: Element[] = [];
      if (bar === 0) out.push(el("divisions", String(divisions)));
      if (want.key !== key) out.push(fragment(want.key));
      if (want.time.text !== time?.text) out.push(timeElement(want.time));
      const before = rest.filter((r) => ["staves", "part-symbol", "instruments"].includes(r.localName));
      const after = rest.filter((r) => !before.includes(r));
      if (bar === 0 && staves > 1 && !before.some((r) => r.localName === "staves")) before.push(el("staves", String(staves)));
      out.push(...before);
      for (const [n, c] of want.clefs) if (clefs.get(n) !== c) out.push(fragment(c));
      out.push(...after);
      key = want.key;
      time = want.time;
      for (const [n, c] of want.clefs) clefs.set(n, c);
      return out.length ? el("attributes", out) : null;
    };
    const timeElement = (t: Time) => {
      const [beats, type] = t.text.includes("+") ? [String(t.beats), String(t.beatType)] : t.text.split("/");
      return el("time", [el("beats", beats), el("beat-type", type)]);
    };
    const firstState = firstPart.states[0];
    const laneDefault = {
      key: firstState?.key ?? DEFAULT_KEY,
      clefs: firstState?.clefs.size ? firstState.clefs : new Map([["1", DEFAULT_CLEF]]),
    };

    arr.sections.forEach((s, si) => {
      const length = sectionBars(s, blocks);
      const bp = blockParts[si];
      const cell = s.cells[lane];
      const playing = bp && cell ? Array.from({ length: cell.times }, () => bp.measures.map((m, i) => [m, bp.states[i]] as const)).flat() : [];
      for (let b = 0; b < length; b++) {
        let measure: Element;
        if (b < playing.length) {
          const [source, st] = playing[b];
          measure = copyMeasure(doc, source, divisions / st.divisions);
          const lead = leadingAttributes(measure);
          const rest = lead.flatMap((a) => [...a.children].filter((c) => !["divisions", "key", "time", "clef"].includes(c.localName)));
          lead.forEach((a) => a.remove());
          const attrs = attributes(
            { key: st.key ?? key ?? laneDefault.key, time: st.time ?? time ?? sectionTimes[si], clefs: st.clefs.size ? st.clefs : laneDefault.clefs },
            rest,
          );
          if (attrs) measure.insertBefore(attrs, measure.firstChild);
        } else {
          measure = el("measure");
          const t = sectionTimes[si];
          const attrs = attributes({ key: key ?? laneDefault.key, time: t, clefs: clefs.size ? new Map(clefs) : laneDefault.clefs }, []);
          if (attrs) measure.appendChild(attrs);
          for (let staff = 1; staff <= staves; staff++) {
            if (staff > 1) measure.appendChild(el("backup", [el("duration", String(barLength(t, divisions)))]));
            const note = el("note", [el("rest", [], { measure: "yes" }), el("duration", String(barLength(t, divisions))), el("voice", String(staff))]);
            if (staves > 1) note.appendChild(el("staff", String(staff)));
            measure.appendChild(note);
          }
        }
        bar++;
        measure.setAttribute("number", String(bar));
        // Section name above the top staff, tempo at the very start
        if (li === 0 && b === 0) {
          const where = [...measure.children].find((c) => c.localName !== "attributes") ?? null;
          if (bar === 1 && arr.tempo) {
            measure.insertBefore(
              el("direction", [el("direction-type", [el("metronome", [el("beat-unit", "quarter"), el("per-minute", String(arr.tempo))])]), el("sound", [], { tempo: String(arr.tempo) })], { placement: "above" }),
              where,
            );
          }
          if (s.name.trim()) measure.insertBefore(el("direction", [el("direction-type", [el("rehearsal", s.name.trim())])], { placement: "above" }), where);
        }
        if (b === length - 1) {
          const last = si === arr.sections.length - 1;
          measure.appendChild(el("barline", [el("bar-style", last ? "light-heavy" : "light-light")], { location: "right" }));
        }
        part.appendChild(measure);
      }
    });
    totalBars = bar;
  });

  if (!lanes.length) problems.push("No blocks placed yet.");
  const xml =
    `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n` +
    `<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n` +
    new XMLSerializer().serializeToString(root);
  return { xml, bars: totalBars, problems };
}

/** Copy a block's bar into the score: rescale durations, drop layout, barlines, tempo marks and instrument references. */
function copyMeasure(doc: XMLDocument, source: Element, factor: number): Element {
  const m = doc.importNode(source, true) as Element;
  m.removeAttribute("implicit");
  m.removeAttribute("width");
  for (const tag of ["duration", "offset"]) {
    for (const d of [...m.getElementsByTagName(tag)]) d.textContent = String(Math.round(Number(d.textContent) * factor));
  }
  for (const a of [...m.getElementsByTagName("attributes")]) for (const d of [...a.getElementsByTagName("divisions")]) d.remove();
  for (const a of [...m.getElementsByTagName("attributes")]) if (!a.children.length) a.remove();
  const drop = [...m.children].filter(
    (c) => c.localName === "print" || c.localName === "barline" || (c.localName === "direction" && c.getElementsByTagName("metronome").length),
  );
  drop.forEach((c) => c.remove());
  for (const s of [...m.getElementsByTagName("sound")]) s.removeAttribute("tempo");
  for (const i of [...m.getElementsByTagName("instrument")]) i.remove();
  return m;
}


