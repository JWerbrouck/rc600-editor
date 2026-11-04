// Minimal ZIP reader for compressed MusicXML (.mxl): finds the score named in
// META-INF/container.xml and inflates it with the browser's DecompressionStream.

interface Entry {
  name: string;
  method: number;
  compressedSize: number;
  offset: number;
}

function entries(bytes: Uint8Array): Entry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // End of central directory: signature 0x06054b50, searched from the end (a comment may follow it)
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a valid .mxl (zip) file");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const out: Entry[] = [];
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error("damaged .mxl file");
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLength = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    out.push({ name: decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength)), method, compressedSize, offset });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

async function extract(bytes: Uint8Array, e: Entry): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const start = e.offset + 30 + view.getUint16(e.offset + 26, true) + view.getUint16(e.offset + 28, true);
  const data = bytes.subarray(start, start + e.compressedSize);
  if (e.method === 0) return new TextDecoder().decode(data);
  if (e.method !== 8) throw new Error(`unsupported compression in .mxl (method ${e.method})`);
  const source = new ReadableStream<BufferSource>({
    start(c) {
      c.enqueue(data.slice());
      c.close();
    },
  });
  const stream = source.pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

/** The MusicXML text inside an .mxl file. */
export async function readMxl(bytes: Uint8Array): Promise<string> {
  const all = entries(bytes);
  const container = all.find((e) => e.name === "META-INF/container.xml");
  let target: Entry | undefined;
  if (container) {
    const xml = await extract(bytes, container);
    const path = xml.match(/<rootfile[^>]*full-path="([^"]+)"/)?.[1];
    target = all.find((e) => e.name === path);
  }
  target ??= all.find((e) => /\.(musicxml|xml)$/i.test(e.name) && !e.name.startsWith("META-INF/"));
  if (!target) throw new Error("no score found inside the .mxl file");
  return extract(bytes, target);
}
