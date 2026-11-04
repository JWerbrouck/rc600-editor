// A song folder holds the block files (MusicXML exported from MuseScore), the
// arrangement (arrangement.json) and the exported score.
//   DirectorySongFolder  a folder picked by the user (File System Access API, Chrome/Edge);
//                        remembered in IndexedDB so it can be reopened with one click
//   DemoSongFolder       sandbox/song in this project, served by the Vite dev server

export interface FileInfo {
  name: string;
  modified: number;
  size: number;
}

export interface SongFolder {
  label: string;
  list(): Promise<FileInfo[]>;
  read(name: string): Promise<Uint8Array>;
  write(name: string, text: string): Promise<void>;
}

export class DirectorySongFolder implements SongFolder {
  constructor(readonly dir: FileSystemDirectoryHandle) {}

  get label() {
    return this.dir.name;
  }

  async list(): Promise<FileInfo[]> {
    const out: FileInfo[] = [];
    // @ts-expect-error: entries() is missing from TypeScript's DOM types
    for await (const [name, handle] of this.dir.entries() as AsyncIterable<[string, FileSystemHandle]>) {
      if (handle.kind !== "file") continue;
      const f = await (handle as FileSystemFileHandle).getFile();
      out.push({ name, modified: f.lastModified, size: f.size });
    }
    return out;
  }

  async read(name: string) {
    const f = await (await this.dir.getFileHandle(name)).getFile();
    return new Uint8Array(await f.arrayBuffer());
  }

  async write(name: string, text: string) {
    const w = await (await this.dir.getFileHandle(name, { create: true })).createWritable();
    await w.write(text);
    await w.close();
  }
}

export class DemoSongFolder implements SongFolder {
  label = "Demo song";

  async list(): Promise<FileInfo[]> {
    const r = await fetch("/__song/");
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  async read(name: string) {
    const r = await fetch(`/__song/${encodeURIComponent(name)}`);
    if (!r.ok) throw new Error(`${name}: ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }

  async write(name: string, text: string) {
    const r = await fetch(`/__song/${encodeURIComponent(name)}`, { method: "PUT", body: text });
    if (!r.ok) throw new Error(`${name}: ${r.status}`);
  }
}

// ---------------------------------------------------------------- remembering the folder

const DB = "rc600-editor";
const STORE = "handles";

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function rememberFolder(dir: FileSystemDirectoryHandle) {
  try {
    const d = await db();
    d.transaction(STORE, "readwrite").objectStore(STORE).put(dir, "song");
  } catch {
    // storage blocked: the folder just isn't remembered
  }
}

export async function rememberedFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const d = await db();
    return await new Promise((resolve) => {
      const req = d.transaction(STORE).objectStore(STORE).get("song");
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** Ask again for access to a remembered folder (needs a click). */
export async function regainAccess(dir: FileSystemDirectoryHandle): Promise<boolean> {
  const h = dir as FileSystemDirectoryHandle & {
    queryPermission(o: { mode: string }): Promise<PermissionState>;
    requestPermission(o: { mode: string }): Promise<PermissionState>;
  };
  if ((await h.queryPermission({ mode: "readwrite" })) === "granted") return true;
  return (await h.requestPermission({ mode: "readwrite" })) === "granted";
}
