// Compare the current copy of every memory in two backups: node tools/diff-backups.mjs DATA tests/round2/DATA
import fs from "node:fs";
const [from, to] = process.argv.slice(2);
const current = (dir, n) =>
  ["A", "B"].map((s) => fs.readFileSync(`${dir}/MEMORY${String(n).padStart(3, "0")}${s}.RC0`, "utf8"))
    .sort((a, b) => parseInt(b.match(/<count>(\w+)/)[1], 16) - parseInt(a.match(/<count>(\w+)/)[1], 16))[0];
const values = (text) => {
  const out = new Map();
  let root = "", container = "";
  for (const line of text.split("\n")) {
    let m;
    if ((m = line.match(/^<(mem|ifx|tfx)[ >]/))) root = m[1];
    else if ((m = line.match(/^<([A-Z0-9_]+)>$/))) container = m[1];
    else if ((m = line.match(/^\t<([A-Z0-9#]+)>(-?\d+)</))) out.set(`${root}/${container}.${m[1]}`, +m[2]);
  }
  return out;
};
for (let n = 1; n <= 99; n++) {
  const a = values(current(from, n)), b = values(current(to, n));
  const diff = [...b].filter(([k, v]) => a.get(k) !== v).map(([k, v]) => `${k}: ${a.get(k)} -> ${v}`);
  if (diff.length) console.log(`MEM ${n}\n  ${diff.slice(0, 15).join("\n  ")}`);
}
