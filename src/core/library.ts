// The 99 memories on the pedal, staged edits, and writing them back the way the
// pedal does: each memory has an A and a B copy, and a save goes to the older copy
// with the write counter raised by one.

import { Rc0, type Path } from "./rc0";
import { COPY_GROUPS, TRACKS, namePaths, samplesPerMeasure, type CopyGroup } from "./schema";

/** Where the RC0 files live: the pedal's ROLAND/DATA folder, or a dev sandbox. */
export interface Store {
  readonly label: string;
  read(name: string): Promise<string>;
  write(name: string, text: string): Promise<void>;
}

export const MEMORY_COUNT = 99;
export const memoryFile = (n: number, copy: "A" | "B") => `MEMORY${String(n).padStart(3, "0")}${copy}.RC0`;

export class Memory {
  constructor(
    readonly number: number,
    private a: Rc0,
    private b: Rc0,
  ) {}

  /** The copy the pedal loads: the one with the higher write counter. */
  get current(): Rc0 {
    return this.b.count > this.a.count ? this.b : this.a;
  }

  get olderCopy(): "A" | "B" {
    return this.b.count > this.a.count ? "A" : "B";
  }

  /** Replace the older copy after a successful write. */
  replaceOlder(doc: Rc0): void {
    if (this.olderCopy === "A") this.a = doc;
    else this.b = doc;
  }
}

export async function loadMemories(store: Store): Promise<Memory[]> {
  const memories: Memory[] = [];
  for (let n = 1; n <= MEMORY_COUNT; n++) {
    const [a, b] = await Promise.all([store.read(memoryFile(n, "A")), store.read(memoryFile(n, "B"))]);
    memories.push(new Memory(n, new Rc0(a), new Rc0(b)));
  }
  return memories;
}

/** System settings: SYSTEM1/SYSTEM2, the same two-copy scheme as memories. Read-only for now. */
export async function loadSystem(store: Store): Promise<Rc0> {
  const [one, two] = await Promise.all([store.read("SYSTEM1.RC0"), store.read("SYSTEM2.RC0")]).then((t) => t.map((x) => new Rc0(x)));
  return two.count > one.count ? two : one;
}

export function readName(doc: Rc0): string {
  return namePaths.map((p) => String.fromCharCode(doc.get(p))).join("").trimEnd();
}

export function nameEdits(name: string): [Path, number][] {
  const padded = name.slice(0, namePaths.length).padEnd(namePaths.length, " ");
  return namePaths.map((p, i) => [p, padded.charCodeAt(i)]);
}

export function isValidNameChar(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return c >= 32 && c <= 126;
}

export const tempoOf = (doc: Rc0) => doc.get("mem/MASTER.A") / 10;
export const hasAudio = (doc: Rc0, track: number) => doc.get(`mem/TRACK${track}.W`) === 1;
export const recordedTracks = (doc: Rc0) => TRACKS.filter((t) => hasAudio(doc, t));
export const recordedMeasures = (doc: Rc0, track: number) => doc.get(`mem/TRACK${track}.S`);

/** Staged, unwritten edits per memory. Values equal to what's on the pedal are dropped. */
export class Changes {
  private edits = new Map<number, Map<Path, number>>();

  constructor(private memories: Memory[]) {}

  private mem(n: number): Memory {
    return this.memories[n - 1];
  }

  /** Value as it will be written: staged edit if any, else what's on the pedal. */
  value(n: number, path: Path): number {
    return this.edits.get(n)?.get(path) ?? this.mem(n).current.get(path);
  }

  isChanged(n: number, path: Path): boolean {
    return this.edits.get(n)?.has(path) ?? false;
  }

  set(n: number, path: Path, value: number): void {
    const original = this.mem(n).current.get(path);
    let staged = this.edits.get(n);
    if (value === original) {
      staged?.delete(path);
      if (staged?.size === 0) this.edits.delete(n);
      return;
    }
    if (!staged) this.edits.set(n, (staged = new Map()));
    staged.set(path, value);
  }

  setName(n: number, name: string): void {
    for (const [p, v] of nameEdits(name)) this.set(n, p, v);
  }

  name(n: number): string {
    return namePaths.map((p) => String.fromCharCode(this.value(n, p))).join("").trimEnd();
  }

  /** Tempo and beat also update samples-per-measure, which the pedal keeps in MASTER.B. */
  setTempo(n: number, bpm: number): void {
    this.set(n, "mem/MASTER.A", Math.round(bpm * 10));
    this.set(n, "mem/MASTER.B", samplesPerMeasure(bpm, this.value(n, "mem/RHYTHM.F")));
  }

  setBeat(n: number, beat: number): void {
    this.set(n, "mem/RHYTHM.F", beat);
    this.set(n, "mem/MASTER.B", samplesPerMeasure(this.value(n, "mem/MASTER.A") / 10, beat));
  }

  /** Tempo and beat can only change on memories with no recorded audio. */
  canChangeTempo(n: number): boolean {
    return recordedTracks(this.mem(n).current).length === 0;
  }

  /**
   * The measure setting (TRACKn.J) is stored together with R, S and T, which the pedal
   * updates at the same time (round 1 test 7, round 2 tests 9–10):
   *   Auto (0): R 0, S 0, T 0    Free (1): R 1, S 0, T 0    n measures (n + 7): R 2, S n, T 0
   * Note lengths (2–7) aren't supported yet. Only on tracks without audio.
   */
  canChangeMeasure(n: number, track: number, j?: number): boolean {
    return !hasAudio(this.mem(n).current, track) && (j === undefined || j <= 1 || j >= 8);
  }

  setMeasure(n: number, track: number, j: number): void {
    if (!this.canChangeMeasure(n, track, j)) throw new Error(`Track ${track} of memory ${n} can't be set to measure value ${j}`);
    const p = `mem/TRACK${track}`;
    this.set(n, `${p}.J`, j);
    this.set(n, `${p}.R`, j <= 1 ? j : 2);
    this.set(n, `${p}.S`, j <= 1 ? 0 : j - 7);
    this.set(n, `${p}.T`, 0);
  }

  /** Copy setting groups from one memory to others. Returns what was left alone, with a reason. */
  copy(from: number, to: number[], groups: CopyGroup[]): { skipped: { n: number; reason: string }[] } {
    const skipped: { n: number; reason: string }[] = [];
    for (const n of to) {
      if (n === from) continue;
      for (const g of groups) {
        if (g === "tempo" && !this.canChangeTempo(n)) {
          skipped.push({ n, reason: "has recordings, so tempo and beat were left alone" });
          continue;
        }
        for (const p of COPY_GROUPS[g].paths) {
          const measure = p.match(/^mem\/TRACK(\d)\.J$/);
          if (!measure) {
            this.set(n, p, this.value(from, p));
            continue;
          }
          const track = Number(measure[1]);
          const j = this.value(from, p);
          if (j === this.value(n, p)) continue;
          if (this.canChangeMeasure(n, track, j)) this.setMeasure(n, track, j);
          else skipped.push({ n, reason: `track ${track} measures left alone` });
        }
      }
    }
    return { skipped };
  }

  discard(n?: number): void {
    if (n === undefined) this.edits.clear();
    else this.edits.delete(n);
  }

  changedMemories(): number[] {
    return [...this.edits.keys()].sort((a, b) => a - b);
  }

  changesFor(n: number): [Path, number][] {
    return [...(this.edits.get(n) ?? [])];
  }

  get size(): number {
    return this.edits.size;
  }

  /** Build the file to save: current copy + edits, counter + 1, written over the older copy. */
  prepare(n: number): { file: string; doc: Rc0 } {
    const m = this.mem(n);
    const doc = m.current.clone();
    for (const [p, v] of this.changesFor(n)) doc.set(p, v);
    doc.count = m.current.count + 1;
    return { file: memoryFile(n, m.olderCopy), doc };
  }

  /** Write every changed memory. A memory's edits are cleared only after its file is written. */
  async writeAll(store: Store, onProgress?: (n: number) => void): Promise<number[]> {
    const written: number[] = [];
    for (const n of this.changedMemories()) {
      const { file, doc } = this.prepare(n);
      await store.write(file, doc.serialize());
      this.mem(n).replaceOlder(doc);
      this.edits.delete(n);
      written.push(n);
      onProgress?.(n);
    }
    return written;
  }
}
