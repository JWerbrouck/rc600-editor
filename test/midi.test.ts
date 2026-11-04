import { describe, expect, it } from "vitest";
import { encode, isAssignableCc } from "../src/midi/messages";
import { newControl, parseBoard, sliderValue, starterBoard } from "../src/midi/layout";

describe("MIDI messages", () => {
  it("encodes control change on the given channel", () => {
    expect(encode({ type: "cc", channel: 1, controller: 80 }, 127)).toEqual([0xb0, 80, 127]);
    expect(encode({ type: "cc", channel: 16, controller: 1 }, 0)).toEqual([0xbf, 1, 0]);
    expect(encode({ type: "cc", channel: 1, controller: 1 }, 300)).toEqual([0xb0, 1, 127]);
  });

  it("encodes program change so program 1 selects memory 01", () => {
    expect(encode({ type: "pc", channel: 1, program: 1 })).toEqual([0xc0, 0]);
    expect(encode({ type: "pc", channel: 2, program: 99 })).toEqual([0xc1, 98]);
  });

  it("encodes start and stop as realtime bytes", () => {
    expect(encode({ type: "start" })).toEqual([0xfa]);
    expect(encode({ type: "stop" })).toEqual([0xfc]);
  });

  it("knows which CCs the RC-600 accepts for ASSIGN", () => {
    expect([1, 31, 64, 95].every(isAssignableCc)).toBe(true);
    expect([0, 32, 63, 96, 127].some(isAssignableCc)).toBe(false);
  });
});

describe("control board", () => {
  it("gives new controls the next free assignable CC", () => {
    const a = newControl("button", 1, []);
    const b = newControl("slider", 1, [a]);
    expect(a.message).toEqual({ type: "cc", channel: 1, controller: 1 });
    expect(b.message).toEqual({ type: "cc", channel: 1, controller: 2 });
  });

  it("maps slider position between off and on", () => {
    const s = { ...newControl("slider", 1, []), off: 20, on: 100 };
    expect([0, 0.5, 1].map((p) => sliderValue(s, p))).toEqual([20, 60, 100]);
  });

  it("round-trips through JSON and rejects other files", () => {
    const board = starterBoard();
    expect(parseBoard(JSON.parse(JSON.stringify(board)))).toEqual(board);
    expect(() => parseBoard({ hello: 1 })).toThrow(/isn't an RC-600/);
  });
});
