// System settings and footswitch assignments, against the real backup in DATA/ (read-only).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Changes, SYSTEM, loadMemories, loadSystem, type Store } from "../src/core/library";
import { Rc0 } from "../src/core/rc0";
import { footFunction, functionGroups, pedalPath } from "../src/core/footswitch";
import { NEVER_EDIT, SYSTEM_SECTIONS } from "../src/core/system";
import { isEditable } from "../src/core/schema";

const DATA = path.resolve(__dirname, "../DATA");
const hasData = fs.existsSync(DATA);

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

describe("footswitch functions", () => {
  it("keeps the factory anchors", () => {
    expect(footFunction(2).name).toBe("Track 1 rec/play 2");
    expect(footFunction(80).name).toBe("Track 4 rec/play 2");
    expect(footFunction(171).name).toBe("Current track undo/redo");
    expect(footFunction(193).name).toBe("Pedal mode");
    expect(footFunction(196).name).toBe("Input FX A");
    expect(functionGroups().some((g) => g.options.some((o) => o.value === 218))).toBe(true);
  });
});

describe.skipIf(!hasData)("system settings", () => {
  it("maps fields that exist in the system file, and never offers phantom power", async () => {
    const sys = (await loadSystem(memoryStore())).current;
    for (const s of SYSTEM_SECTIONS) for (const f of s.fields) expect(sys.has(`sys/${s.id}.${f.key}`), `${s.id}.${f.key}`).toBe(true);
    const phantom = SYSTEM_SECTIONS.find((s) => s.id === "INPUT")!.fields.filter((f) => ["A", "B"].includes(f.key));
    expect(phantom.every((f) => !isEditable(f) || NEVER_EDIT.has(`sys/INPUT.${f.key}`))).toBe(true);
  });

  it("writes system edits to the older SYSTEM file with the counter raised, changing only those lines", async () => {
    const store = memoryStore();
    const system = await loadSystem(store);
    const changes = new Changes(await loadMemories(store), system);
    const before = system.current;
    const older = system.olderCopy === "A" ? "SYSTEM1.RC0" : "SYSTEM2.RC0";

    changes.set(SYSTEM, "sys/COLOR.C", 5); // recording color: purple
    changes.set(SYSTEM, pedalPath("sys", 1, 4), 63); // mode 1 pedal 4: track 3 stop 4
    changes.set(5, pedalPath("mem", 2, 1), 193); // a memory's own assignment
    expect(changes.changedMemories()).toEqual([SYSTEM, 5]);

    const written = await changes.writeAll(store);
    expect(written).toEqual([SYSTEM, 5]);
    expect([...store.files.keys()].filter((f) => f.startsWith("SYSTEM"))).toEqual([older]);

    const after = new Rc0(store.files.get(older)!);
    expect(after.count).toBe(before.count + 1);
    expect(after.get("sys/COLOR.C")).toBe(5);
    expect(after.get(pedalPath("sys", 1, 4))).toBe(63);
    const diff = after.serialize().split("\n").filter((l, i) => l !== before.serialize().split("\n")[i]);
    expect(diff).toHaveLength(3); // two values and the counter
    expect(system.current.get("sys/COLOR.C")).toBe(5); // the pedal now loads the new copy
  });
});
