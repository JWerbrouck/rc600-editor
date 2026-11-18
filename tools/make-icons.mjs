// Draws the app icon (a loop ring with a play-head dot on the editor's steel blue) as PNG
// files for the web app manifest: public/icon-192.png, icon-512.png and a maskable 512.
// No dependencies: pixels are computed directly and encoded with zlib.
//   node tools/make-icons.mjs
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const BLUE = [0x2c, 0x6a, 0x8a];
const LIGHT = [0xf6, 0xf7, 0xf8];
const AMBER = [0xe0, 0xa5, 0x4a];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5, size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const clamp = (v) => Math.max(0, Math.min(1, v));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/** maskable: full-bleed background (the OS crops it); otherwise a rounded square. */
function icon(maskable) {
  return (x, y, s) => {
    const u = x / s - 0.5;
    const v = y / s - 0.5;
    // background shape coverage (anti-aliased)
    let bg = 1;
    if (!maskable) {
      const half = 0.46;
      const r = 0.2;
      const qx = Math.max(Math.abs(u) - (half - r), 0);
      const qy = Math.max(Math.abs(v) - (half - r), 0);
      const d = Math.hypot(qx, qy) - r;
      bg = clamp(0.5 - d * s);
    }
    const scale = maskable ? 0.78 : 1; // keep the ring inside the maskable safe zone
    const d = Math.hypot(u, v) / scale;
    const ring = clamp(0.5 - (Math.abs(d - 0.24) - 0.055) * s);
    // play-head dot on the ring, at about 1 o'clock
    const a = -Math.PI / 3;
    const dot = clamp(0.5 - (Math.hypot(u / scale - 0.24 * Math.cos(a), v / scale - 0.24 * Math.sin(a)) - 0.085) * s);
    let col = mix(BLUE, LIGHT, ring);
    col = mix(col, AMBER, dot);
    return [...col, Math.round(255 * bg)];
  };
}

const out = path.resolve(import.meta.dirname, "../public");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "icon-192.png"), png(192, icon(false)));
fs.writeFileSync(path.join(out, "icon-512.png"), png(512, icon(false)));
fs.writeFileSync(path.join(out, "icon-maskable-512.png"), png(512, icon(true)));
console.log("icons written to public/");
