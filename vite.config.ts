import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

// Dev-only: serve sandbox/DATA at /__sandbox/<file> (GET and PUT), so the editor
// can be tried on a disposable copy of a backup without touching the pedal.
function sandbox(): Plugin {
  const dir = path.resolve(__dirname, "sandbox/DATA");
  return {
    name: "rc600-sandbox",
    configureServer(server) {
      server.middlewares.use("/__sandbox/", (req, res) => {
        const name = decodeURIComponent((req.url ?? "").replace(/^\//, ""));
        if (!/^[A-Z0-9]+\.RC0$/.test(name)) {
          res.statusCode = 400;
          return res.end("Bad file name");
        }
        const file = path.join(dir, name);
        if (req.method === "GET") {
          if (!fs.existsSync(file)) {
            res.statusCode = 404;
            return res.end("Not found");
          }
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          return res.end(fs.readFileSync(file));
        }
        if (req.method === "PUT") {
          const chunks: Buffer[] = [];
          req.on("data", (c: Buffer) => chunks.push(c));
          req.on("end", () => {
            fs.writeFileSync(file, Buffer.concat(chunks));
            res.end("ok");
          });
          return;
        }
        res.statusCode = 405;
        res.end();
      });
    },
  };
}

// Dev-only: serve sandbox/song at /__song/ (list, GET, PUT) as a demo song folder for the
// arranger. Created from examples/demo-song the first time it's used; delete it to reset.
function demoSong(): Plugin {
  const dir = path.resolve(__dirname, "sandbox/song");
  const examples = path.resolve(__dirname, "examples/demo-song");
  return {
    name: "rc600-demo-song",
    configureServer(server) {
      server.middlewares.use("/__song/", (req, res) => {
        if (!fs.existsSync(dir)) fs.cpSync(examples, dir, { recursive: true });
        const name = decodeURIComponent((req.url ?? "").replace(/^\//, "").replace(/\?.*$/, ""));
        if (!name && req.method === "GET") {
          const list = fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isFile())
            .map((f) => { const st = fs.statSync(path.join(dir, f)); return { name: f, modified: st.mtimeMs, size: st.size }; });
          res.setHeader("Content-Type", "application/json");
          return res.end(JSON.stringify(list));
        }
        if (!/^[^/\\]+$/.test(name) || name.startsWith(".")) {
          res.statusCode = 400;
          return res.end("Bad file name");
        }
        const file = path.join(dir, name);
        if (req.method === "GET") {
          if (!fs.existsSync(file)) {
            res.statusCode = 404;
            return res.end("Not found");
          }
          return res.end(fs.readFileSync(file));
        }
        if (req.method === "PUT") {
          const chunks: Buffer[] = [];
          req.on("data", (c: Buffer) => chunks.push(c));
          req.on("end", () => {
            fs.writeFileSync(file, Buffer.concat(chunks));
            res.end("ok");
          });
          return;
        }
        res.statusCode = 405;
        res.end();
      });
    },
  };
}

export default defineConfig({
  // Relative paths, so the built app works under any folder (e.g. GitHub Pages' /rc600-editor/)
  base: "./",
  plugins: [sandbox(), demoSong()],
  server: { port: 5600 },
});
