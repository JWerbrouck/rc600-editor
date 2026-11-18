// Effects map (src/core/effects.ts) against the real backups (read-only). Skips without DATA/.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Rc0 } from "../src/core/rc0";
import { BANKS, BANK_FIELDS, FX_TYPES, describeFx, slotFields, typeFields, type FxRoot } from "../src/core/effects";
import type { Field } from "../src/core/schema";

const dirs = ["DATA", "tests/round1/DATA", "tests/round2/DATA", "tests/round3/DATA"].map((d) => path.resolve(__dirname, "..", d)).filter((d) => fs.existsSync(d));
const docs = dirs.flatMap((d) => fs.readdirSync(d).filter((f) => /^MEMORY\d{3}[AB]\.RC0$/.test(f)).map((f) => new Rc0(fs.readFileSync(path.join(d, f), "utf8"))));

const fits = (f: Field, v: number) => {
  if (f.kind === "enum") return v >= 0 && v < f.options.length;
  if (f.kind === "range") return v >= f.min && v <= f.max;
  return true;
};

describe.skipIf(!docs.length)("effects map", () => {
  const sample = docs[0];

  it("has one type per effect block, in the file's order, with the same field letters", () => {
    for (const root of ["ifx", "tfx"] as FxRoot[]) {
      const blocks = [...new Set(sample.paths(`${root}/AA_`).map((p) => p.slice(root.length + 4, p.indexOf(".")) ))].filter((b) => !b.endsWith("_SEQ"));
      const expected = FX_TYPES.filter((f) => root === "tfx" || !f.trackOnly);
      expect(blocks).toEqual(expected.map((f) => f.id));
      for (const f of expected) {
        const keys = sample.paths(`${root}/AA_${f.id}.`).map((p) => p.slice(p.indexOf(".") + 1));
        expect(keys, f.id).toEqual(f.keys);
        expect(f.params, f.id).toHaveLength(f.keys.length);
      }
    }
  });

  it("finds every stored value within the mapped options and ranges", () => {
    const bad: string[] = [];
    for (const doc of docs) {
      for (const root of ["ifx", "tfx"] as FxRoot[]) {
        for (let b = 0; b < 4; b++) {
          for (const f of BANK_FIELDS) if (!fits(f, doc.get(`${root}/${BANKS[b]}.${f.key}`))) bad.push(`${root}/${BANKS[b]}.${f.key}`);
          for (let x = 0; x < 4; x++) {
            const slot = `${BANKS[b]}${BANKS[x]}`;
            for (const f of slotFields(root)) if (!fits(f, doc.get(`${root}/${slot}.${f.key}`))) bad.push(`${root}/${slot}.${f.key}`);
            const type = doc.get(`${root}/${slot}.C`);
            if (!FX_TYPES[type]) bad.push(`${root}/${slot}.C=${type}`);
            for (const t of FX_TYPES.filter((t) => root === "tfx" || !t.trackOnly)) {
              for (const f of typeFields(t)) {
                const p = `${root}/${slot}_${t.id}.${f.key}`;
                if (!fits(f, doc.get(p))) bad.push(`${p}=${doc.get(p)}`);
              }
            }
          }
        }
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  });

  it("labels changed values for the write review", () => {
    expect(describeFx("ifx/AA.C")?.label).toBe("Input FX A-A: type");
    expect(describeFx("tfx/BC_DELAY.B")?.label).toBe("Track FX B-C Delay: feedback");
    expect(describeFx("ifx/C.B")?.label).toBe("Input FX C bank: mode");
    expect(describeFx("mem/TRACK1.A")).toBeNull();
  });
});
