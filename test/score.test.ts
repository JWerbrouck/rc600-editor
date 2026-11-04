// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseBlock, type Block } from "../src/score/block";
import { buildScore, newArrangement, parseArrangement, sectionBars, type Arrangement } from "../src/score/arrangement";
import { readMxl } from "../src/score/zip";

const dir = path.resolve(__dirname, "../examples/demo-song");
const load = (file: string) => parseBlock(file, fs.readFileSync(path.join(dir, file), "utf8"));
const blocks = new Map<string, Block>(fs.readdirSync(dir).filter((f) => f.endsWith(".musicxml")).map((f) => [load(f).name, load(f)]));

function arrangement(): Arrangement {
  const a = newArrangement("Demo");
  a.tempo = 96;
  const [intro, verse, chorus] = a.sections;
  intro.cells[0] = { block: "Bass A", part: 0, times: 1 }; // 2 bars
  verse.cells[0] = { block: "Bass A", part: 0, times: 2 }; // 4 bars
  verse.cells[1] = { block: "Chords A", part: 0, times: 2 }; // 2 bars, then rests
  chorus.cells[0] = { block: "Bass B", part: 0, times: 2 };
  chorus.cells[2] = { block: "Melody", part: 0, times: 1 };
  return a;
}

const parse = (xml: string) => new DOMParser().parseFromString(xml, "application/xml");

describe("blocks", () => {
  it("reads bars, staves, time and key from MuseScore MusicXML", () => {
    const chords = blocks.get("Chords A")!;
    expect(chords.parts.map((p) => p.name)).toEqual(["Chords", "Hook"]);
    expect(chords.bars).toBe(1);
    expect(chords.time?.text).toBe("4/4");
    expect(chords.keyName).toBe("C");
    expect(chords.problems).toEqual([]);
    expect(blocks.get("Bass A")!.bars).toBe(2);
  });

  it("flags bars that don't fill the time signature", () => {
    const xml = fs.readFileSync(path.join(dir, "Bass B.musicxml"), "utf8").replace(/<note>(?:(?!<\/note>).)*<\/note><barline/, "<barline");
    expect(parseBlock("Short.musicxml", xml).problems).toEqual(["Bar 1 is shorter than 4/4."]);
    expect(parseBlock("Broken.musicxml", "<nope").problems[0]).toMatch(/readable/);
  });

  it("reads compressed .mxl files", async () => {
    const score = fs.readFileSync(path.join(dir, "Melody.musicxml"));
    const zip = makeZip({
      "META-INF/container.xml": Buffer.from('<container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>'),
      "score.xml": score,
    });
    expect(await readMxl(zip)).toBe(score.toString("utf8"));
  });
});

describe("arrangement", () => {
  it("measures sections by their longest lane", () => {
    const a = arrangement();
    expect(a.sections.map((s) => sectionBars(s, blocks))).toEqual([2, 4, 2]);
  });

  it("joins blocks into one score with a staff per used lane", () => {
    const { xml, bars, problems } = buildScore(arrangement(), blocks);
    expect(problems).toEqual([]);
    expect(bars).toBe(8);
    const doc = parse(xml);
    expect([...doc.querySelectorAll("part-list part-name")].map((e) => e.textContent)).toEqual(["Track 1", "Track 2", "Track 3"]);
    const parts = [...doc.querySelectorAll("part")];
    expect(parts.map((p) => p.querySelectorAll("measure").length)).toEqual([8, 8, 8]);
    // One divisions value (lcm of 1, 2, 4), set once per staff
    expect([...doc.querySelectorAll("divisions")].map((d) => d.textContent)).toEqual(["4", "4", "4"]);
    // Every bar is exactly a 4/4 bar long in every staff
    for (const p of parts) {
      for (const m of p.querySelectorAll("measure")) {
        let pos = 0;
        for (const c of m.children) {
          const d = Number(c.querySelector(":scope > duration")?.textContent ?? 0);
          if (c.localName === "note" && !c.querySelector("chord")) pos += d;
          if (c.localName === "backup") pos -= d;
        }
        expect(pos).toBe(16);
      }
    }
  });

  it("writes key, time and clef only when they change, and marks sections", () => {
    const doc = parse(buildScore(arrangement(), blocks).xml);
    const [bass, chords] = [...doc.querySelectorAll("part")];
    expect(bass.querySelectorAll("time").length).toBe(1);
    expect(bass.querySelectorAll("clef sign")[0].textContent).toBe("F");
    expect(bass.querySelectorAll("clef").length).toBe(1);
    // The chords lane starts with rests but already shows its block's treble clef
    expect(chords.querySelector("measure clef sign")?.textContent).toBe("G");
    expect([...doc.querySelectorAll("rehearsal")].map((r) => r.textContent)).toEqual(["Intro", "Verse", "Chorus"]);
    expect(doc.querySelectorAll("metronome per-minute")[0].textContent).toBe("96"); // arrangement tempo, block's 100 dropped
    expect(doc.querySelectorAll("metronome").length).toBe(1);
    expect(doc.querySelectorAll("print").length).toBe(0);
    expect([...bass.querySelectorAll("bar-style")].map((b) => b.textContent)).toEqual(["light-light", "light-light", "light-heavy"]);
  });

  it("uses the chosen staff of a multi-staff block and reports missing blocks", () => {
    const a = arrangement();
    a.sections[0].cells[3] = { block: "Chords A", part: 1, times: 1 };
    a.sections[1].cells[4] = { block: "Gone", part: 0, times: 1 };
    const { xml, problems } = buildScore(a, blocks);
    expect(problems).toEqual(['Verse › Track 5: block "Gone" isn\'t in the song folder.']);
    const hook = parse(xml).querySelectorAll("part")[3];
    expect(hook.querySelector("measure note pitch step")?.textContent).toBe("E");
  });

  it("round-trips through JSON", () => {
    const a = arrangement();
    expect(parseArrangement(JSON.parse(JSON.stringify(a)))).toEqual(a);
    expect(() => parseArrangement({})).toThrow(/arrangement/);
  });
});

/** Build a zip with deflated entries (the shape MuseScore writes .mxl in). */
function makeZip(files: Record<string, Buffer>): Uint8Array {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const deflated = zlib.deflateRawSync(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(deflated.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBytes.length, 26);
    local.push(lh, nameBytes, deflated);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(deflated.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBytes.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBytes);
    offset += 30 + nameBytes.length + deflated.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...local, cd, end]));
}
