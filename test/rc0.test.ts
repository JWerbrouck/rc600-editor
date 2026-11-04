// Runs against the real backup in DATA/ (read-only). Skips if it isn't there.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Rc0 } from "../src/core/rc0";
import { Changes, loadMemories, memoryFile, readName, type Store } from "../src/core/library";
import { COPY_GROUPS, FADE_TIMES, PLAY_FIELDS, REC_FIELDS, RHYTHM_FIELDS, TRACK_FIELDS } from "../src/core/schema";

const DATA = path.resolve(__dirname, "../DATA");
const hasData = fs.existsSync(DATA);

/** In-memory store seeded from DATA/, so tests never touch the backup. */
function memoryStore(): Store & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    label: "test",
    files,
    async read(name) {
      return files.get(name) ?? fs.readFileSync(path.join(DATA, name), "utf8");
    },
    async write(name, text) {
      files.set(name, text);
    },
  };
}

describe.skipIf(!hasData)("RC0 files from the backup", () => {
  const names = hasData ? fs.readdirSync(DATA).filter((f) => /^(MEMORY|SYSTEM).*\.RC0$/.test(f)) : [];

  it("parses and serializes every memory and system file byte for byte", () => {
    expect(names.length).toBe(200);
    for (const name of names) {
      const text = fs.readFileSync(path.join(DATA, name), "utf8");
      expect(new Rc0(text).serialize(), name).toBe(text);
    }
  });

  it("finds the memory id, all mapped fields and the count", () => {
    const doc = new Rc0(fs.readFileSync(path.join(DATA, "MEMORY002A.RC0"), "utf8"));
    expect(doc.ids.mem).toBe(1);
    for (let t = 1; t <= 6; t++) for (const f of TRACK_FIELDS) expect(doc.has(`mem/TRACK${t}.${f.key}`)).toBe(true);
    for (const g of Object.values(COPY_GROUPS)) for (const p of g.paths) expect(doc.has(p), p).toBe(true);
    expect(doc.count).toBeGreaterThan(0);
  });

  it("changes only the edited value lines and the count", () => {
    const text = fs.readFileSync(path.join(DATA, "MEMORY050A.RC0"), "utf8");
    const doc = new Rc0(text);
    doc.set("mem/TRACK1.D", 150);
    doc.count = 0x1a;
    const before = text.split("\n");
    const after = doc.serialize().split("\n");
    const diff = before.flatMap((l, i) => (l === after[i] ? [] : [[l, after[i]]]));
    expect(diff).toEqual([
      ["\t<D>100</D>", "\t<D>150</D>"],
      [before.at(-1), "<count>001A</count>"],
    ]);
  });
});

describe("device test backups", () => {
  const round2 = path.resolve(__dirname, "../tests/round2/DATA");
  const store = (dir: string): Store => ({ label: dir, read: async (n) => fs.readFileSync(path.join(dir, n), "utf8"), write: async () => {} });

  it.skipIf(!fs.existsSync(round2))("decode to what was set on the pedal in round 2", async () => {
    const m = await loadMemories(store(round2));
    const v = (n: number, p: string) => m[n - 1].current.get(p);
    expect(v(60, "mem/TRACK1.L")).toBe(0); // loop sync off
    expect(v(61, "mem/TRACK1.Y")).toBe(0); // loop sync mode immediate
    expect(v(62, "mem/TRACK1.N")).toBe(0); // tempo sync mode pitch
    expect(v(68, "mem/PLAY.H")).toBe(0); // sync adjust beat
    expect(FADE_TIMES[v(76, "mem/PLAY.B")]).toMatch(/1\/16/);
    expect(FADE_TIMES[v(77, "mem/PLAY.C")]).toBe("64 meas.");
    expect([v(81, "mem/TRACK1.J"), v(81, "mem/TRACK1.S")]).toEqual([607, 600]);
  });

  it.skipIf(!hasData)("hold only values the editor knows for every editable list setting", async () => {
    const dirs = [DATA, path.resolve(__dirname, "../tests/round1/DATA"), round2].filter((d) => fs.existsSync(d));
    for (const dir of dirs) {
      for (const mem of await loadMemories(store(dir))) {
        const sections: [string, typeof TRACK_FIELDS][] = [
          ...[1, 2, 3, 4, 5, 6].map((t) => [`TRACK${t}`, TRACK_FIELDS] as [string, typeof TRACK_FIELDS]),
          ["REC", REC_FIELDS],
          ["PLAY", PLAY_FIELDS],
          ["RHYTHM", RHYTHM_FIELDS],
        ];
        for (const [sec, fields] of sections)
          for (const f of fields)
            if (f.kind === "enum") expect(f.options[mem.current.get(`mem/${sec}.${f.key}`)], `${dir} ${mem.number} ${sec}.${f.key}`).toBeDefined();
      }
    }
  });
});

describe.skipIf(!hasData)("writing memories", () => {
  it("writes the older copy with count + 1, and the new copy becomes current", async () => {
    const store = memoryStore();
    const memories = await loadMemories(store);
    const m = memories[0];
    const oldCount = m.current.count;
    const target = memoryFile(1, m.olderCopy);

    const changes = new Changes(memories);
    changes.setName(1, "Test name");
    changes.set(1, "mem/TRACK2.D", 120);
    await changes.writeAll(store);

    const written = new Rc0(store.files.get(target)!);
    expect(written.count).toBe(oldCount + 1);
    expect(readName(written)).toBe("Test name");
    expect(written.get("mem/TRACK2.D")).toBe(120);
    expect(m.current.count).toBe(oldCount + 1);
    expect(changes.size).toBe(0);
  });

  it("drops edits that set a value back to what's on the pedal", async () => {
    const changes = new Changes(await loadMemories(memoryStore()));
    const original = changes.value(5, "mem/TRACK1.C");
    changes.set(5, "mem/TRACK1.C", original + 10);
    changes.set(5, "mem/TRACK1.C", original);
    expect(changes.size).toBe(0);
  });

  it("copies settings but never tempo into memories with recordings", async () => {
    const changes = new Changes(await loadMemories(memoryStore()));
    changes.setTempo(50, 95);
    const { skipped } = changes.copy(50, [1, 60], ["tempo", "tracks"]);
    expect([...new Set(skipped.map((s) => s.n))]).toEqual([1]); // memory 1 has recorded tracks
    expect(changes.value(60, "mem/MASTER.A")).toBe(950);
    expect(changes.value(60, "mem/MASTER.B")).toBe(111411); // 44100 * 60 * 4 / 95, rounded
    // Tracks with audio keep their measures and recording state
    const recorded = [2, 3, 4, 6]; // memory 1
    expect(changes.changesFor(1).some(([p]) => recorded.some((t) => p.startsWith(`mem/TRACK${t}.`) && /\.[JR-X]$/.test(p)))).toBe(false);
  });

  it("sets measures together with R, S and T, like the pedal does", async () => {
    const changes = new Changes(await loadMemories(memoryStore()));
    changes.setMeasure(50, 1, 11); // 4 measures
    expect(["J", "R", "S", "T"].map((k) => changes.value(50, `mem/TRACK1.${k}`))).toEqual([11, 2, 4, 0]);
    changes.setMeasure(50, 1, 0); // Auto
    expect(["J", "R", "S", "T"].map((k) => changes.value(50, `mem/TRACK1.${k}`))).toEqual([0, 0, 0, 0]);
    changes.setMeasure(50, 1, 1); // Free
    expect(changes.changesFor(50)).toEqual([]);
    expect(() => changes.setMeasure(1, 2, 11)).toThrow(); // memory 1 track 2 has audio
    expect(() => changes.setMeasure(50, 1, 2)).toThrow(); // note lengths not supported yet
  });
});
