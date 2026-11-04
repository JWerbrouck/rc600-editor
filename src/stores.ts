// Where the editor reads and writes RC0 files.
//   DirectoryStore  the pedal's ROLAND/DATA folder, through the browser's File System Access API (Chrome, Edge)
//   SandboxStore    sandbox/DATA in this project, served by the Vite dev server (npm run sandbox to reset it)

import type { Store } from "./core/library";

export class DirectoryStore implements Store {
  constructor(private dir: FileSystemDirectoryHandle) {}

  get label() {
    return this.dir.name;
  }

  async read(name: string): Promise<string> {
    const file = await (await this.dir.getFileHandle(name)).getFile();
    return file.text();
  }

  async write(name: string, text: string): Promise<void> {
    const writable = await (await this.dir.getFileHandle(name)).createWritable();
    await writable.write(text);
    await writable.close();
  }

  /** Copy every .RC0 file into a new timestamped folder inside `target`. Returns the folder name. */
  async backupTo(target: FileSystemDirectoryHandle): Promise<string> {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
    const folderName = `RC600-backup-${stamp}`;
    const folder = await target.getDirectoryHandle(folderName, { create: true });
    // @ts-expect-error: entries() is missing from TypeScript's DOM types
    for await (const [name, handle] of this.dir.entries() as AsyncIterable<[string, FileSystemHandle]>) {
      if (handle.kind !== "file" || !name.endsWith(".RC0")) continue;
      const data = await (handle as FileSystemFileHandle).getFile();
      const out = await (await folder.getFileHandle(name, { create: true })).createWritable();
      await out.write(data);
      await out.close();
    }
    return folderName;
  }
}

/** Find the DATA folder whether the user picked the drive root, ROLAND, or DATA itself. */
export async function findDataFolder(dir: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle | null> {
  const tryGet = async (d: FileSystemDirectoryHandle, name: string) => {
    try {
      return await d.getDirectoryHandle(name);
    } catch {
      return null;
    }
  };
  const looksLikeData = async (d: FileSystemDirectoryHandle) => {
    try {
      await d.getFileHandle("MEMORY001A.RC0");
      return true;
    } catch {
      return false;
    }
  };
  if (await looksLikeData(dir)) return dir;
  const data = await tryGet(dir, "DATA");
  if (data && (await looksLikeData(data))) return data;
  const roland = await tryGet(dir, "ROLAND");
  const nested = roland && (await tryGet(roland, "DATA"));
  if (nested && (await looksLikeData(nested))) return nested;
  return null;
}

export class SandboxStore implements Store {
  readonly label = "sandbox/DATA";

  async read(name: string): Promise<string> {
    const res = await fetch(`/__sandbox/${name}`);
    if (!res.ok) throw new Error(`Couldn't read ${name} from the sandbox (${res.status}). Run npm run sandbox first.`);
    return res.text();
  }

  async write(name: string, text: string): Promise<void> {
    const res = await fetch(`/__sandbox/${name}`, { method: "PUT", body: text });
    if (!res.ok) throw new Error(`Couldn't write ${name} to the sandbox (${res.status}).`);
  }
}
