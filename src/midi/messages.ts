// MIDI messages the live controls can send, and their bytes.
//
// What the RC-600 does with them (Parameter Guide, MIDI and ASSIGN):
//   Control change   CC#1–31 and CC#64–95 can be ASSIGN sources, on the RX CTL channel
//   Program change   switches memory: program 1 = memory 01 … program 99 = memory 99
//   Start / Stop     starts or stops tracks and/or rhythm, depending on MIDI › SYNC START

export type MidiMessage =
  | { type: "cc"; channel: number; controller: number }
  | { type: "pc"; channel: number; program: number } // program 1–128, as shown on devices
  | { type: "start" }
  | { type: "stop" };

export type MessageType = MidiMessage["type"];

export const MESSAGE_TYPES: { type: MessageType; label: string }[] = [
  { type: "cc", label: "Control change (CC)" },
  { type: "pc", label: "Program change (memory)" },
  { type: "start", label: "Start" },
  { type: "stop", label: "Stop" },
];

/** CC numbers the RC-600 accepts as ASSIGN sources. */
export const isAssignableCc = (cc: number) => (cc >= 1 && cc <= 31) || (cc >= 64 && cc <= 95);

const clamp7 = (v: number) => Math.max(0, Math.min(127, Math.round(v)));

/** Bytes for a message. `value` is the CC value (0–127); other types ignore it. */
export function encode(msg: MidiMessage, value = 127): number[] {
  switch (msg.type) {
    case "cc":
      return [0xb0 | (msg.channel - 1), clamp7(msg.controller), clamp7(value)];
    case "pc":
      return [0xc0 | (msg.channel - 1), clamp7(msg.program - 1)];
    case "start":
      return [0xfa];
    case "stop":
      return [0xfc];
  }
}

export function describe(msg: MidiMessage): string {
  switch (msg.type) {
    case "cc":
      return `CC ${msg.controller}, ch ${msg.channel}`;
    case "pc":
      return `Program ${msg.program} (memory ${String(msg.program).padStart(2, "0")}), ch ${msg.channel}`;
    case "start":
      return "MIDI start";
    case "stop":
      return "MIDI stop";
  }
}

export function defaultMessage(type: MessageType, channel = 1): MidiMessage {
  switch (type) {
    case "cc":
      return { type, channel, controller: 1 };
    case "pc":
      return { type, channel, program: 1 };
    default:
      return { type };
  }
}
