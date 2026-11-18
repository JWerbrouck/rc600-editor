// Round 3 (TESTS.md): footswitch functions, PREFERENCE and system settings set on the pedal.
// Runs against tests/round3/DATA; skips if it isn't there.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Rc0 } from "../src/core/rc0";
import { footFunction, footRange, functionGroups, pedalPath } from "../src/core/footswitch";
import { SYSTEM_SECTIONS } from "../src/core/system";
import { displayValue } from "../src/core/schema";

const DIR = path.resolve(__dirname, "../tests/round3/DATA");
const has = fs.existsSync(path.join(DIR, "SYSTEM1.RC0"));

/** The copy the pedal loads: the one with the higher write counter. */
function current(a: string, b: string): Rc0 {
  const [x, y] = [a, b].map((f) => new Rc0(fs.readFileSync(path.join(DIR, f), "utf8")));
  return y.count > x.count ? y : x;
}

describe.skipIf(!has)("round 3 on the pedal", () => {
  const mem = has ? current("MEMORY082A.RC0", "MEMORY082B.RC0") : null!;
  const sys = has ? current("SYSTEM1.RC0", "SYSTEM2.RC0") : null!;
  const names = (mode: number) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => footFunction(mem.get(pedalPath("mem", mode, p))).name);

  it("decodes the 27 functions set in memory 82", () => {
    expect(names(1)).toEqual([
      "Track 1 rec/play 1", "Track 1 moment play", "Track 1 play/stop 1", "Track 1 play/stop 2", "Track 1 play/stop 3",
      "Track 1 stop 1", "Track 1 stop 2", "Track 1 stop 3", "Track 1 stop 5",
    ]);
    // pedal 4 (TRACK EDIT) doesn't exist on this pedal and kept its factory function
    expect(names(2)).toEqual([
      "Track 1 clear", "Track 1 mark back 1", "Track 1 double speed (momentary)", "Track 5 stop 4", "Track 1 track FX",
      "Current track: next (INC1)", "All start/stop 2", "All start/stop 3", "All start/stop 4",
    ]);
    expect(names(3)).toEqual([
      "All start/stop 6", "All clear 1", "All clear 2", "Tap tempo", "Tempo up", "Tempo down", "Pedal mode next", "Input FX on/off", "LED",
    ]);
  });

  it("stores the value range the pedal set with each function", () => {
    for (const mode of [1, 2, 3]) {
      for (let p = 1; p <= 9; p++) {
        const a = pedalPath("mem", mode, p);
        const base = a.slice(0, -2);
        expect({ B: mem.get(`${base}.B`), C: mem.get(`${base}.C`) }, `mode ${mode} pedal ${p}`).toEqual(footRange(mem.get(a)));
      }
    }
  });

  it("reads PREFERENCE: modes 1–3 set to memory", () => {
    const pref = SYSTEM_SECTIONS.find((s) => s.id === "PREF")!;
    for (const key of ["C", "D", "E"]) expect(displayValue(pref.fields.find((f) => f.key === key)!, sys.get(`sys/PREF.${key}`))).toBe("Memory");
  });

  it("reads the part C system settings as set on the pedal", () => {
    const show = (id: string, key: string) => {
      const f = SYSTEM_SECTIONS.find((s) => s.id === id)!.fields.find((x) => x.key === key)!;
      return displayValue(f, sys.get(`sys/${id}.${key}`));
    };
    expect(show("SETUP", "I")).toBe("3");
    expect(show("SETUP", "D")).toBe("Loop level");
    expect(show("SETUP", "G")).toBe("Beat");
    expect(show("SETUP", "V")).toBe("Off");
    expect(show("MIDI", "E")).toBe("Ch 5");
    expect(show("MIDI", "F")).toBe("MIDI");
    expect(show("MIDI", "H")).toBe("Rhythm");
    expect(show("MIDI", "J")).toBe("USB out");
    expect(show("MIDI", "K")).toBe("MIDI out");
    expect(show("INPUT", "H")).toBe("25");
    expect(show("OUTPUT", "A")).toBe("Phones");
    expect([show("MIXER", "A"), show("MIXER", "I"), show("MIXER", "U"), show("MIXER", "V")]).toEqual(["111", "77", "66", "133"]);
    expect([show("MASTER_FX", "A"), show("MASTER_FX", "B")]).toEqual(["12", "7"]);
    expect([show("EQ_MIC1", "D"), show("EQ_MIC1", "K"), show("EQ_MIC1", "L")]).toEqual(["1.00 kHz", "100 Hz", "8.00 kHz"]);
  });
});

describe("footswitch list", () => {
  it("offers every function once", () => {
    const all = functionGroups().flatMap((g) => g.options.map((o) => o.value));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe.skipIf(!has || !fs.existsSync(path.resolve(__dirname, "../tests/round2/DATA")))("restoring round 2 after the round 3 tests", () => {
  it("stages exactly the test changes back, except the knob-driven levels", async () => {
    const { Changes, SYSTEM, loadMemories, loadSystem, stageRestore } = await import("../src/core/library");
    const store = (dir: string) => ({ label: dir, read: async (n: string) => fs.readFileSync(path.join(dir, n), "utf8"), write: async () => {} });
    const load = async (dir: string) => {
      const s = store(dir);
      return { system: await loadSystem(s), memories: await loadMemories(s) };
    };
    const pedal = await load(DIR);
    const backup = await load(path.resolve(__dirname, "../tests/round2/DATA"));
    const changes = new Changes(pedal.memories, pedal.system);

    expect(stageRestore(changes, pedal, backup)).toEqual([SYSTEM, 82]);
    const sysEdits = Object.fromEntries(changes.changesFor(SYSTEM));
    expect(Object.keys(sysEdits).sort()).toEqual(
      [
        "SETUP.D", "SETUP.G", "SETUP.I", "SETUP.V", "MIDI.D", "MIDI.E", "MIDI.F", "MIDI.H", "MIDI.J", "MIDI.K",
        "PREF.C", "PREF.D", "PREF.E", "INPUT.H", "OUTPUT.A", "MIXER.A", "MIXER.I",
        "EQ_MIC1.D", "EQ_MIC1.K", "EQ_MIC1.L", "MASTER_FX.A", "MASTER_FX.B",
      ].map((k) => `sys/${k}`).sort(),
    );
    expect(sysEdits["sys/SETUP.I"]).toBe(9); // contrast back to 10
    expect(sysEdits["sys/PREF.C"]).toBe(1); // mode 1 back to system
    // memory 82: every footswitch back to factory, with its value range
    for (const [p, v] of changes.changesFor(82)) expect(v, p).toBe(backup.memories[81].current.get(p));
    expect(changes.changesFor(82)).toHaveLength(31);
  });
});
