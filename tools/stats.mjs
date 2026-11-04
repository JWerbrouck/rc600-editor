// Value distribution per field across the newest copy of all 99 memories.
import fs from "node:fs";
const dir = process.argv[2], sections = process.argv.slice(3);
const stats = {};
for (let i = 1; i <= 99; i++) {
  const n = String(i).padStart(3, "0");
  const t = ["A", "B"].map(s => fs.readFileSync(`${dir}/MEMORY${n}${s}.RC0`, "utf8"))
    .sort((a, b) => parseInt(b.match(/<count>(\w+)/)[1], 16) - parseInt(a.match(/<count>(\w+)/)[1], 16))[0];
  const mem = t.slice(0, t.indexOf("</mem>"));
  for (const sec of sections) {
    const m = mem.match(new RegExp(`<${sec}>([^]*?)</${sec}>`));
    if (!m) continue;
    for (const [, k, v] of m[1].matchAll(/<(\w+)>(-?\d+)<\/\1>/g)) {
      const key = `${sec}.${k}`;
      (stats[key] ??= {})[v] = (stats[key][v] ?? 0) + 1;
    }
  }
}
for (const [k, d] of Object.entries(stats))
  console.log(k.padEnd(14), Object.entries(d).sort((a, b) => b[1] - a[1]).map(([v, c]) => `${v}×${c}`).join(" "));
