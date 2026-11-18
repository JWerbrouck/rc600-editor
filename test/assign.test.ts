// ASSIGN lists against round 4 (TESTS.md) and, where available, the round 4 backup.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Rc0 } from "../src/core/rc0";
import { SOURCES, TARGETS, ccSource, targetRange } from "../src/core/assign";

describe("ASSIGN lists", () => {
  it("numbers sources and targets as the pedal does", () => {
    expect(SOURCES).toHaveLength(109);
    expect([SOURCES[65].name, SOURCES[44].name, SOURCES[25].name, SOURCES[42].name]).toEqual(["MIDI CC#20", "Expression pedal 1", "Pedal 4, mode 2", "CTL 3 jack"]);
    expect(ccSource(20)).toBe(65);
    expect(TARGETS).toHaveLength(936);
    expect([TARGETS[21].name, TARGETS[82].name, TARGETS[104].name, TARGETS[728].name]).toEqual(["Track 2 level", "Tempo", "Input FX B on/off", "Rhythm level"]);
    expect(TARGETS[935].name).toBe("Send MIDI CC#127");
    expect(targetRange(82).format?.(600)).toBe("60.0 BPM");
  });
});

const file = path.resolve(__dirname, "../tests/round4/DATA/MEMORY083A.RC0");
describe.skipIf(!fs.existsSync(file))("round 4 backup", () => {
  it("reads the four ASSIGNs as set on the pedal", () => {
    const [a, b] = ["A", "B"].map((c) => new Rc0(fs.readFileSync(file.replace("083A", `083${c}`), "utf8")));
    const doc = b.count > a.count ? b : a;
    const read = (n: number) => ({
      on: doc.get(`mem/ASSIGN${n}.A`),
      source: SOURCES[doc.get(`mem/ASSIGN${n}.B`)].name,
      toggle: doc.get(`mem/ASSIGN${n}.D`),
      act: [doc.get(`mem/ASSIGN${n}.E`), doc.get(`mem/ASSIGN${n}.F`)],
      target: TARGETS[doc.get(`mem/ASSIGN${n}.G`)].name,
      minmax: [doc.get(`mem/ASSIGN${n}.I`), doc.get(`mem/ASSIGN${n}.J`)],
    });
    expect(read(1)).toEqual({ on: 1, source: "MIDI CC#20", toggle: 1, act: [10, 90], target: "Track 2 level", minmax: [30, 170] });
    expect(read(2)).toEqual({ on: 1, source: "Expression pedal 1", toggle: 0, act: [0, 127], target: "Tempo", minmax: [600, 1800] });
    expect(read(3)).toEqual({ on: 0, source: "Pedal 4, mode 2", toggle: 1, act: [5, 120], target: "Input FX B on/off", minmax: [0, 1] });
    expect(read(4)).toEqual({ on: 1, source: "CTL 3 jack", toggle: 0, act: [20, 100], target: "Rhythm level", minmax: [50, 150] });
  });
});
