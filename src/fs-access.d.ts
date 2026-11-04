// File System Access API parts that TypeScript's DOM types don't include yet (Chrome, Edge).
interface Window {
  showDirectoryPicker(options?: { id?: string; mode?: "read" | "readwrite" }): Promise<FileSystemDirectoryHandle>;
}
