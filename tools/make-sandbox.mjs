// Reset sandbox/DATA to a fresh copy of the backup in DATA/ (or a folder given as argument).
import fs from "node:fs";
import path from "node:path";

const source = path.resolve(process.argv[2] ?? "DATA");
const target = path.resolve("sandbox/DATA");
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
const files = fs.readdirSync(source).filter((f) => f.endsWith(".RC0"));
for (const f of files) fs.copyFileSync(path.join(source, f), path.join(target, f));
console.log(`Copied ${files.length} files from ${source} to ${target}`);
