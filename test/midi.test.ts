import { describe, expect, it } from "vitest";
import { encode, isAssignableCc } from "../src/midi/messages";
import { fits, newControl, parseBoard, sliderValue, starterBoard, type Board } from "../src/midi/layout";

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
  const empty = (): Board => ({ id: "b", name: "Test", channel: 1, cols: 3, rows: 2, controls: [] });

  it("gives new controls the next free assignable CC and a free place", () => {
    const b = empty();
    const a = newControl("button", b);
    b.controls.push(a);
    const s = newControl("slider", b);
    expect(a.message).toEqual({ type: "cc", channel: 1, controller: 1 });
    expect(s.message).toEqual({ type: "cc", channel: 1, controller: 2 });
    expect([a.x, a.y, a.w, a.h]).toEqual([0, 0, 1, 1]);
    expect([s.x, s.y, s.w, s.h]).toEqual([1, 0, 1, 2]); // sliders start two cells high
  });

  it("only places controls inside the grid and not over each other", () => {
    const b = empty();
    b.controls.push({ ...newControl("button", b), x: 0, y: 0, w: 2, h: 1 });
    expect(fits(b, 1, 0, 1, 1)).toBe(false);
    expect(fits(b, 2, 0, 1, 2)).toBe(true);
    expect(fits(b, 2, 0, 2, 1)).toBe(false);
    expect(fits(b, 0, 0, 2, 1, b.controls[0].id)).toBe(true);
  });

  it("adds rows when the board is full", () => {
    const b = empty();
    for (let i = 0; i < 7; i++) b.controls.push(newControl("button", b));
    expect(b.rows).toBe(3);
    expect(b.controls[6]).toMatchObject({ x: 0, y: 2 });
  });

  it("maps slider position between off and on", () => {
    const s = { ...newControl("slider", empty()), off: 20, on: 100 };
    expect([0, 0.5, 1].map((p) => sliderValue(s, p))).toEqual([20, 60, 100]);
  });

  it("round-trips through JSON, upgrades version 1 boards and rejects other files", () => {
    const board = starterBoard();
    expect(parseBoard(JSON.parse(JSON.stringify(board)))).toEqual(board);
    const v1 = { version: 1, channel: 2, controls: [{ id: "x", kind: "slider", label: "Old", message: { type: "cc", channel: 2, controller: 5 }, on: 127, off: 0, momentary: false }] };
    const up = parseBoard(v1);
    expect(up.controls[0]).toMatchObject({ label: "Old", x: 0, y: 0, w: 1, h: 2 });
    expect(() => parseBoard({ hello: 1 })).toThrow(/isn't an RC-600/);
  });
});
