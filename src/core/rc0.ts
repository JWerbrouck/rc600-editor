// Lossless reader/writer for RC-600 .RC0 XML files.
//
// The files have a rigid line layout (see FORMAT.md): blocks and containers start at
// column 0, values are tab-indented `<FIELD>number</FIELD>` lines, and the file ends
// with `<count>XXXX</count>` and no trailing newline. We keep the original lines and
// only replace the lines of values that change, so an unedited file serializes back
// byte for byte.

/** Address of one value: `root/CONTAINER.FIELD`, e.g. `mem/TRACK1.J` or `ifx/AA_DELAY.B`. */
export type Path = string;

const ROOT_OPEN = /^<(mem|ifx|tfx|sys)(?: id="(\d+)")?>$/;
const ROOT_CLOSE = /^<\/(mem|ifx|tfx|sys)>$/;
const CONTAINER_OPEN = /^<([A-Z0-9_]+)>$/;
const CONTAINER_CLOSE = /^<\/([A-Z0-9_]+)>$/;
const VALUE = /^\t<([A-Z0-9#]+)>(-?\d+)<\/\1>$/;
const COUNT = /^<count>([0-9A-F]{4})<\/count>$/;

export class Rc0 {
  private lines: string[];
  private index = new Map<Path, number>();
  private countLine: number;
  /** `id` attribute of each root block, e.g. `{ mem: 0, ifx: 0, tfx: 0 }`. */
  readonly ids: Record<string, number> = {};

  constructor(text: string) {
    this.lines = text.split("\n");
    let root = "";
    let container = "";
    let countLine = -1;
    this.lines.forEach((line, i) => {
      let m: RegExpMatchArray | null;
      if ((m = line.match(VALUE))) {
        if (!root || !container) throw new Error(`Value outside a container on line ${i + 1}`);
        const path = `${root}/${container}.${m[1]}`;
        if (this.index.has(path)) throw new Error(`Duplicate value ${path} on line ${i + 1}`);
        this.index.set(path, i);
      } else if ((m = line.match(ROOT_OPEN))) {
        root = m[1];
        if (m[2] !== undefined) this.ids[root] = Number(m[2]);
      } else if (ROOT_CLOSE.test(line)) {
        root = "";
      } else if ((m = line.match(CONTAINER_OPEN))) {
        container = m[1];
      } else if (CONTAINER_CLOSE.test(line)) {
        container = "";
      } else if (COUNT.test(line)) {
        countLine = i;
      }
    });
    if (countLine !== this.lines.length - 1) throw new Error("File does not end with a <count> line");
    this.countLine = countLine;
  }

  has(path: Path): boolean {
    return this.index.has(path);
  }

  get(path: Path): number {
    const i = this.index.get(path);
    if (i === undefined) throw new Error(`Unknown value ${path}`);
    return Number(this.lines[i].match(VALUE)![2]);
  }

  set(path: Path, value: number): void {
    const i = this.index.get(path);
    if (i === undefined) throw new Error(`Unknown value ${path}`);
    if (!Number.isInteger(value)) throw new Error(`${path} must be a whole number, got ${value}`);
    const field = path.slice(path.lastIndexOf(".") + 1);
    this.lines[i] = `\t<${field}>${value}</${field}>`;
  }

  /** All value paths that start with a prefix, in file order. */
  paths(prefix = ""): Path[] {
    return [...this.index.keys()].filter((p) => p.startsWith(prefix));
  }

  /** Write counter. The copy (A or B) with the higher count is the current one. */
  get count(): number {
    return parseInt(this.lines[this.countLine].match(COUNT)![1], 16);
  }

  set count(value: number) {
    const hex = (value & 0xffff).toString(16).toUpperCase().padStart(4, "0");
    this.lines[this.countLine] = `<count>${hex}</count>`;
  }

  clone(): Rc0 {
    return new Rc0(this.serialize());
  }

  serialize(): string {
    return this.lines.join("\n");
  }
}
