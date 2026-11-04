// Arranger view: build a song from blocks (loops written in MuseScore, exported as
// MusicXML into one folder per song). Rows are lanes (RC-600 tracks by default), columns
// are sections. Blocks are referenced by name, so re-exporting one from MuseScore updates
// every place it's used; the folder is checked every 2 seconds for changed files.
//
// Mounted by main.ts into the editor area. State lives at module level so it survives
// main.ts re-rendering the page, like live.ts.

import { blockName, isBlockFile, parseBlock, type Block } from "./score/block";
import {
  ARRANGEMENT_FILE,
  SOFTWARE,
  buildScore,
  cellBars,
  newArrangement,
  newSection,
  parseArrangement,
  sectionBars,
  type Arrangement,
  type Cell,
} from "./score/arrangement";
import { DemoSongFolder, DirectorySongFolder, regainAccess, rememberFolder, rememberedFolder, type SongFolder } from "./score/folder";
import { readMxl } from "./score/zip";

let root: HTMLElement | null = null;
let folder: SongFolder | null = null;
let remembered: FileSystemDirectoryHandle | null | undefined; // undefined: not looked up yet
let arr: Arrangement | null = null;
const blocks = new Map<string, Block>();
const seen = new Map<string, string>(); // file → "modified:size", to notice re-exports
let picked: { block: string; part: number } | null = null;
let selected: { section: number; lane: number } | null = null;
let preview: { kind: "block"; block: string } | { kind: "score" } | null = null;
let status: { text: string; tone: "info" | "error" } | null = null;
let saveTimer: number | undefined;
let busy = false;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ---------------------------------------------------------------- folder

async function pickFolder() {
  if (!("showDirectoryPicker" in window)) return say("This browser can't open folders directly. Use Chrome or Edge.", "error");
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await window.showDirectoryPicker({ id: "rc600-song", mode: "readwrite" });
  } catch {
    return; // cancelled
  }
  await rememberFolder(dir);
  remembered = dir;
  await open(new DirectorySongFolder(dir));
}

async function reopen() {
  if (!remembered) return;
  try {
    if (!(await regainAccess(remembered))) return say(`No access to "${remembered.name}". Choose Open song folder to pick it again.`, "error");
  } catch {
    return say(`"${remembered.name}" can't be opened any more. Choose Open song folder to pick it again.`, "error");
  }
  await open(new DirectorySongFolder(remembered));
}

async function open(f: SongFolder) {
  folder = f;
  arr = null;
  blocks.clear();
  seen.clear();
  picked = selected = preview = null;
  status = { text: `Reading ${f.label}…`, tone: "info" };
  render();
  try {
    await refresh();
    const files = await f.list();
    if (files.some((x) => x.name === ARRANGEMENT_FILE)) {
      arr = parseArrangement(JSON.parse(new TextDecoder().decode(await f.read(ARRANGEMENT_FILE))));
      status = null;
    } else {
      arr = newArrangement(f.label);
      await f.write(ARRANGEMENT_FILE, JSON.stringify(arr, null, 2));
      status = { text: `Started a new arrangement, saved as ${ARRANGEMENT_FILE} in this folder.`, tone: "info" };
    }
  } catch (e) {
    folder = null;
    status = { text: `Couldn't open the song folder: ${(e as Error).message}`, tone: "error" };
  }
  render();
}

/** Read new and changed block files, drop removed ones. Returns the names of blocks that changed. */
async function refresh(): Promise<string[]> {
  if (!folder) return [];
  const files = (await folder.list()).filter((f) => isBlockFile(f.name));
  const changed: string[] = [];
  for (const f of files) {
    const sig = `${f.modified}:${f.size}`;
    if (seen.get(f.name) === sig) continue;
    seen.set(f.name, sig);
    const bytes = await folder.read(f.name);
    let text: string;
    try {
      text = /\.mxl$/i.test(f.name) ? await readMxl(bytes) : new TextDecoder().decode(bytes);
    } catch (e) {
      blocks.set(blockName(f.name), { file: f.name, name: blockName(f.name), parts: [], bars: 0, time: null, keyName: null, problems: [`Can't read: ${(e as Error).message}`] });
      changed.push(blockName(f.name));
      continue;
    }
    if (text.includes(`<software>${SOFTWARE}</software>`)) continue; // a score exported from here, not a block
    blocks.set(blockName(f.name), parseBlock(f.name, text));
    changed.push(blockName(f.name));
  }
  for (const [name, b] of blocks) {
    if (!files.some((f) => f.name === b.file)) {
      blocks.delete(name);
      seen.delete(b.file);
      changed.push(name);
    }
  }
  return changed;
}

// Notice blocks re-exported from MuseScore
setInterval(async () => {
  if (!folder || !arr || busy || !root?.isConnected || document.visibilityState !== "visible") return;
  busy = true;
  try {
    const changed = await refresh();
    if (changed.length) {
      status = { text: `Updated from the folder: ${changed.join(", ")}.`, tone: "info" };
      render();
    }
  } catch {
    // folder unplugged or access lost; try again next round
  } finally {
    busy = false;
  }
}, 2000);

function save() {
  render();
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    if (!folder || !arr) return;
    try {
      await folder.write(ARRANGEMENT_FILE, JSON.stringify(arr, null, 2));
    } catch (e) {
      say(`Couldn't save the arrangement: ${(e as Error).message}`, "error");
    }
  }, 400);
}

async function exportScore() {
  if (!folder || !arr) return;
  const { xml, problems } = buildScore(arr, blocks);
  if (problems.includes("No blocks placed yet.")) return say("Place some blocks first.", "error");
  const name = `${arr.title.replace(/[\\/:*?"<>|]/g, "").trim() || "Arrangement"} - score.musicxml`;
  try {
    await folder.write(name, xml);
    say(`Saved "${name}" in ${folder.label}. Open it in MuseScore to print it or tidy the layout.${problems.length ? " Check the notes below first." : ""}`);
  } catch (e) {
    say(`Couldn't save the score: ${(e as Error).message}`, "error");
  }
}

function say(text: string, tone: "info" | "error" = "info") {
  status = { text, tone };
  render();
}

// ---------------------------------------------------------------- rendering

export function mountArranger(el: HTMLElement) {
  root = el;
  if (remembered === undefined) {
    remembered = null;
    void rememberedFolder().then((d) => {
      remembered = d;
      render();
    });
  }
  render();
}

function render() {
  if (!root || !root.isConnected) return;
  const focused = document.activeElement?.id;
  root.innerHTML = folder && arr ? workspace(arr) : start();
  if (focused) document.getElementById(focused)?.focus();
  void drawPreview();
}

function message() {
  return status ? `<p class="message ${status.tone === "error" ? "error" : ""}" role="status">${esc(status.text)}</p>` : "";
}

function start() {
  const demo = import.meta.env.DEV ? `<button class="quiet" data-arr="demo">Try the demo song</button>` : "";
  return `
    <section class="welcome">
      <h2>Arranger</h2>
      <p>Arrange a song from loops you write in MuseScore. Change a loop in MuseScore and the arrangement follows.</p>
      <ol class="steps">
        <li>Make a folder for the song.</li>
        <li>In MuseScore, write each loop as its own score, a whole number of bars. Save it with
            <strong>File › Export › MusicXML</strong> into that folder. The file name is the block's name.</li>
        <li>Open the folder here and place the blocks on the tracks.</li>
      </ol>
      <div class="actions">
        <button class="primary" data-arr="open">Open song folder</button>
        ${remembered ? `<button data-arr="reopen">Reopen “${esc(remembered.name)}”</button>` : ""}
        ${demo}
      </div>
      ${message()}
      <p class="fineprint">Works in Chrome and Edge. The arrangement is saved in the folder as ${ARRANGEMENT_FILE}; your block files are only read.</p>
    </section>`;
}

function workspace(a: Arrangement) {
  const score = buildScore(a, blocks);
  return `
    <header class="pedalhead arrhead">
      <h2>Arranger</h2>
      <label class="songtitle"><span class="sr">Song title</span><input id="arr-title" value="${esc(a.title)}" data-arr-field="title" /></label>
      <span class="source">${esc(folder!.label)}</span>
      <button class="quiet" data-arr="close">Other song…</button>
    </header>
    ${message()}
    <div class="arr">
      <aside class="library" aria-label="Blocks">${library()}</aside>
      <div class="arrmain">
        ${grid(a)}
        ${selected ? cellPanel(a) : ""}
        <section class="scorebar">
          <label>Tempo <input id="arr-tempo" type="number" min="20" max="300" step="1" value="${a.tempo ?? ""}" placeholder="none" data-arr-field="tempo" /> BPM</label>
          <span class="muted">${plural(a.sections.reduce((n, x) => n + sectionBars(x, blocks), 0), "bar")} in total</span>
          <button data-arr="preview-score" ${preview?.kind === "score" ? "aria-pressed=\"true\"" : ""}>Show score</button>
          <button class="primary" data-arr="export">Export score</button>
        </section>
        ${score.problems.length && !score.problems.includes("No blocks placed yet.") ? `<ul class="problems">${score.problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
        ${preview ? `<section class="preview"><header><h3>${preview.kind === "score" ? "Score" : esc(preview.block)}</h3><button class="quiet" data-arr="close-preview">Close</button></header><div class="paper-slot"></div></section>` : ""}
      </div>
    </div>`;
}

function library() {
  const list = [...blocks.values()].sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }));
  if (!list.length) {
    return `<h3>Blocks</h3><p class="note">No MusicXML files in this folder yet. Export a loop from MuseScore into it; it appears here within a few seconds.</p>`;
  }
  return `
    <h3>Blocks <span class="muted">(${list.length})</span></h3>
    <p class="note">Tap a block, then tap where it plays. Or drag it.</p>
    ${list.map(blockItem).join("")}`;
}

function blockItem(b: Block) {
  const meta = [plural(b.bars, "bar"), b.time?.text, b.keyName].filter(Boolean).join(" · ");
  const staves = b.parts.length ? b.parts : [];
  const items = staves
    .map((p, i) => {
      const on = picked?.block === b.name && picked.part === i;
      return `
        <button class="blk ${on ? "picked" : ""}" draggable="true" data-pick="${esc(b.name)}" data-part="${i}" aria-pressed="${on}">
          <span class="blk-name">${esc(b.name)}</span>
          ${staves.length > 1 ? `<span class="blk-part">${esc(p.name)}</span>` : ""}
          <span class="blk-meta">${esc(meta)}</span>
        </button>`;
    })
    .join("");
  return `
    <div class="blkgroup">
      ${items || `<p class="blk-name">${esc(b.name)}</p>`}
      ${b.problems.length ? `<p class="blk-problem">${b.problems.map(esc).join(" ")}</p>` : ""}
      ${b.parts.length ? `<button class="quiet small" data-show="${esc(b.name)}">Show notes</button>` : ""}
    </div>`;
}

function grid(a: Arrangement) {
  const bars = a.sections.map((s) => sectionBars(s, blocks));
  const cols = `9rem ${bars.map((n) => `minmax(8.5rem, ${n}fr)`).join(" ")} 6.5rem`;
  const head = a.sections
    .map(
      (s, si) => `
      <div class="sechead">
        <input id="arr-sec-${s.id}" value="${esc(s.name)}" data-sec-name="${si}" aria-label="Section name" />
        <label class="secbars"><input id="arr-bars-${s.id}" type="number" min="1" max="999" value="${bars[si]}" data-sec-bars="${si}" aria-label="Bars in ${esc(s.name)}" /> bars</label>
        <div class="sectools">
          <button class="quiet" data-sec="left" data-si="${si}" aria-label="Move ${esc(s.name)} earlier" ${si === 0 ? "disabled" : ""}>‹</button>
          <button class="quiet" data-sec="right" data-si="${si}" aria-label="Move ${esc(s.name)} later" ${si === a.sections.length - 1 ? "disabled" : ""}>›</button>
          <button class="quiet" data-sec="dup" data-si="${si}" aria-label="Duplicate ${esc(s.name)}">Copy</button>
          <button class="quiet danger" data-sec="remove" data-si="${si}" aria-label="Remove ${esc(s.name)}">×</button>
        </div>
      </div>`,
    )
    .join("");
  const rows = a.lanes
    .map(
      (lane, li) => `
      <div class="lanehead">
        <input id="arr-lane-${li}" value="${esc(lane)}" data-lane-name="${li}" aria-label="Track name" />
        ${a.lanes.length > 1 ? `<button class="quiet danger" data-lane-remove="${li}" aria-label="Remove ${esc(lane)}">×</button>` : ""}
      </div>
      ${a.sections.map((s, si) => cellButton(s.cells[li], si, li, bars[si])).join("")}
      <div></div>`,
    )
    .join("");
  return `
    <div class="arrgrid-wrap">
      <div class="arrgrid" style="grid-template-columns: ${cols}">
        <div class="corner"></div>
        ${head}
        <div class="addsec"><button data-arr="add-section">Add section</button></div>
        ${rows}
      </div>
    </div>
    <button class="quiet" data-arr="add-lane">Add track</button>`;
}

function cellButton(c: Cell | null, si: number, li: number, bars: number) {
  const isSel = selected?.section === si && selected.lane === li;
  const b = c && blocks.get(c.block);
  const part = b && b.parts.length > 1 ? b.parts[c!.part]?.name : "";
  const fill = c ? Math.min(100, (cellBars(c, blocks) / bars) * 100) : 0;
  const label = c ? `${c.block}${part ? ` (${part})` : ""}${c.times > 1 ? ` ×${c.times}` : ""}` : "empty";
  return `
    <button class="cell ${c ? "filled" : ""} ${c && !b ? "missing" : ""} ${isSel ? "selected" : ""}" data-cell="${si}:${li}"
      ${c ? `draggable="true"` : ""} aria-label="${esc(arr!.sections[si].name)}, ${esc(arr!.lanes[li])}: ${esc(label)}" aria-pressed="${isSel}">
      ${
        c
          ? `<span class="cell-name">${esc(c.block)}${c.times > 1 ? ` <span class="cell-times">×${c.times}</span>` : ""}</span>
             ${part ? `<span class="cell-part">${esc(part)}</span>` : ""}
             ${b ? `<span class="cell-bars"><span style="width:${fill}%"></span></span>` : `<span class="cell-part">missing</span>`}`
          : `<span class="cell-empty">${picked ? "Place here" : "–"}</span>`
      }
    </button>`;
}

function cellPanel(a: Arrangement) {
  const { section: si, lane: li } = selected!;
  const s = a.sections[si];
  const c = s.cells[li];
  const b = c && blocks.get(c.block);
  const options = [...blocks.keys()]
    .sort((x, y) => x.localeCompare(y, undefined, { numeric: true }))
    .map((n) => `<option ${c?.block === n ? "selected" : ""}>${esc(n)}</option>`)
    .join("");
  const body = c
    ? `
      <label><span>Block</span><select id="arr-cell-block" data-cell-field="block">${b ? "" : `<option selected>${esc(c.block)}</option>`}${options}</select></label>
      ${b && b.parts.length > 1 ? `<label><span>Staff</span><select id="arr-cell-part" data-cell-field="part">${b.parts.map((p, i) => `<option value="${i}" ${i === c.part ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>` : ""}
      <div class="times">
        <span>Plays</span>
        <button data-cell-times="-1" aria-label="Fewer times" ${c.times <= 1 ? "disabled" : ""}>−</button>
        <input id="arr-cell-times" type="number" min="1" max="99" value="${c.times}" data-cell-field="times" aria-label="Times" />
        <span>×${b ? ` = ${plural(cellBars(c, blocks), "bar")}` : ""}</span>
        <button data-cell-times="1" aria-label="More times">+</button>
      </div>
      <div class="actions">
        ${b ? `<button class="quiet" data-arr="fill">Fill the section</button>` : ""}
        <button class="quiet danger" data-arr="clear-cell">Clear</button>
      </div>`
    : `<p class="note">Empty: this track rests. Tap a block in the list and then this cell, or choose one:</p>
       <label><span>Block</span><select id="arr-cell-block" data-cell-field="block"><option value="" selected>Choose…</option>${options}</select></label>`;
  return `
    <section class="cellpanel">
      <header><h3>${esc(s.name || "Section")} › ${esc(a.lanes[li])}</h3><button class="quiet" data-arr="deselect">Close</button></header>
      ${body}
    </section>`;
}

// ---------------------------------------------------------------- preview

let paper: HTMLDivElement | null = null;
let osmd: { load(xml: string): Promise<unknown>; render(): void } | null = null;
let drawn = "";

async function drawPreview() {
  const slot = root?.querySelector(".paper-slot");
  if (!slot || !preview || !arr) return;
  if (!paper) {
    paper = document.createElement("div");
    paper.className = "paper";
  }
  slot.replaceWith(paper);
  let xml: string;
  if (preview.kind === "score") {
    xml = buildScore(arr, blocks).xml;
  } else {
    const b = blocks.get(preview.block);
    if (!b || !folder) return;
    const bytes = await folder.read(b.file);
    xml = /\.mxl$/i.test(b.file) ? await readMxl(bytes) : new TextDecoder().decode(bytes);
  }
  if (xml === drawn) return;
  drawn = xml;
  try {
    if (!osmd) {
      paper.textContent = "Loading the score viewer…";
      const { OpenSheetMusicDisplay } = await import("opensheetmusicdisplay");
      paper.textContent = "";
      osmd = new OpenSheetMusicDisplay(paper, { autoResize: true, drawTitle: false, drawingParameters: "compacttight", backend: "svg" });
    }
    await osmd.load(xml);
    osmd.render();
  } catch (e) {
    drawn = "";
    paper.textContent = `Couldn't draw this: ${(e as Error).message}`;
  }
}

// ---------------------------------------------------------------- editing

function place(si: number, li: number, cell: Cell) {
  arr!.sections[si].cells[li] = { ...cell };
  selected = { section: si, lane: li };
  save();
}

function cellAt(key: string | undefined) {
  if (!key) return null;
  const [si, li] = key.split(":").map(Number);
  return { si, li };
}

const inRoot = (el: EventTarget | null): el is HTMLElement => el instanceof HTMLElement && Boolean(root?.contains(el));

document.addEventListener("click", (e) => {
  const el = e.target as HTMLElement;
  if (!inRoot(el)) return;
  const a = arr;

  const pick = el.closest<HTMLElement>("[data-pick]");
  if (pick) {
    const next = { block: pick.dataset.pick!, part: Number(pick.dataset.part) };
    picked = picked?.block === next.block && picked.part === next.part ? null : next;
    return render();
  }
  const show = el.closest<HTMLElement>("[data-show]");
  if (show) {
    preview = { kind: "block", block: show.dataset.show! };
    return render();
  }
  const cell = cellAt(el.closest<HTMLElement>("[data-cell]")?.dataset.cell);
  if (cell && a) {
    if (picked) return place(cell.si, cell.li, { ...picked, times: 1 });
    const same = selected?.section === cell.si && selected.lane === cell.li;
    selected = same ? null : { section: cell.si, lane: cell.li };
    return render();
  }
  const sec = el.closest<HTMLElement>("[data-sec]");
  if (sec && a) {
    const si = Number(sec.dataset.si);
    const s = a.sections[si];
    selected = null;
    switch (sec.dataset.sec) {
      case "left":
      case "right": {
        const sj = si + (sec.dataset.sec === "left" ? -1 : 1);
        [a.sections[si], a.sections[sj]] = [a.sections[sj], a.sections[si]];
        break;
      }
      case "dup":
        a.sections.splice(si + 1, 0, { ...structuredClone(s), id: newSection("", 0).id, name: `${s.name} 2` });
        break;
      case "remove":
        if (s.cells.some(Boolean) && !confirm(`Remove section "${s.name}"?`)) return;
        a.sections.splice(si, 1);
        break;
    }
    return save();
  }
  const laneRemove = el.closest<HTMLElement>("[data-lane-remove]");
  if (laneRemove && a) {
    const li = Number(laneRemove.dataset.laneRemove);
    if (a.sections.some((s) => s.cells[li]) && !confirm(`Remove "${a.lanes[li]}" and its blocks?`)) return;
    a.lanes.splice(li, 1);
    a.sections.forEach((s) => s.cells.splice(li, 1));
    selected = null;
    return save();
  }
  const times = el.closest<HTMLElement>("[data-cell-times]");
  if (times && a && selected) {
    const c = a.sections[selected.section].cells[selected.lane];
    if (c) c.times = Math.max(1, Math.min(99, c.times + Number(times.dataset.cellTimes)));
    return save();
  }

  switch (el.closest<HTMLElement>("[data-arr]")?.dataset.arr) {
    case "open":
      return void pickFolder();
    case "reopen":
      return void reopen();
    case "demo":
      return void open(new DemoSongFolder());
    case "close":
      folder = arr = null;
      status = null;
      return render();
    case "add-section":
      a?.sections.push(newSection(`Section ${a.sections.length + 1}`, a.lanes.length));
      return save();
    case "add-lane":
      if (!a) return;
      a.lanes.push(`Track ${a.lanes.length + 1}`);
      a.sections.forEach((s) => s.cells.push(null));
      return save();
    case "deselect":
      selected = null;
      return render();
    case "clear-cell":
      if (a && selected) a.sections[selected.section].cells[selected.lane] = null;
      return save();
    case "fill": {
      if (!a || !selected) return;
      const s = a.sections[selected.section];
      const c = s.cells[selected.lane];
      const b = c && blocks.get(c.block);
      if (!c || !b?.bars) return;
      // As many times as fit in the longest other lane (or once more if this lane is the longest)
      const others = Math.max(s.minBars, ...s.cells.map((x, i) => (i === selected!.lane ? 0 : cellBars(x, blocks))));
      c.times = Math.max(1, Math.floor(others / b.bars));
      return save();
    }
    case "preview-score":
      preview = preview?.kind === "score" ? null : { kind: "score" };
      return render();
    case "close-preview":
      preview = null;
      return render();
    case "export":
      return void exportScore();
  }
});

document.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  if (!inRoot(el) || !arr) return;
  const a = arr;
  const n = Number(el.value);
  if (el.dataset.arrField === "title") {
    a.title = el.value.trim() || a.title;
  } else if (el.dataset.arrField === "tempo") {
    a.tempo = el.value === "" ? null : n >= 20 && n <= 300 ? Math.round(n) : a.tempo;
  } else if (el.dataset.secName) {
    a.sections[Number(el.dataset.secName)].name = el.value.trim();
  } else if (el.dataset.secBars) {
    const s = a.sections[Number(el.dataset.secBars)];
    const content = Math.max(0, ...s.cells.map((c) => cellBars(c, blocks)));
    if (!(Number.isInteger(n) && n >= 1)) return render();
    if (n < content) {
      s.minBars = 0;
      say(`"${s.name}" needs at least ${plural(content, "bar")} for its blocks. Play a block fewer times to shorten it.`, "error");
      return save();
    }
    s.minBars = n;
  } else if (el.dataset.laneName) {
    a.lanes[Number(el.dataset.laneName)] = el.value.trim() || a.lanes[Number(el.dataset.laneName)];
  } else if (el.dataset.cellField && selected) {
    const s = a.sections[selected.section];
    const c = s.cells[selected.lane];
    if (el.dataset.cellField === "block") {
      if (!el.value) return;
      s.cells[selected.lane] = { block: el.value, part: 0, times: c?.times ?? 1 };
    } else if (c && el.dataset.cellField === "part") {
      c.part = n;
    } else if (c && el.dataset.cellField === "times") {
      if (Number.isInteger(n) && n >= 1 && n <= 99) c.times = n;
    }
  } else return;
  status = null;
  save();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && root?.isConnected && (picked || selected)) {
    picked = selected = null;
    render();
  }
});

// Drag a block from the list, or a placed block to copy it to another cell
document.addEventListener("dragstart", (e) => {
  const el = e.target as HTMLElement;
  if (!inRoot(el) || !e.dataTransfer) return;
  const pick = el.closest<HTMLElement>("[data-pick]");
  const from = cellAt(el.closest<HTMLElement>("[data-cell]")?.dataset.cell);
  const cell = pick ? { block: pick.dataset.pick!, part: Number(pick.dataset.part), times: 1 } : from && arr?.sections[from.si].cells[from.li];
  if (!cell) return;
  e.dataTransfer.setData("application/x-rc600-cell", JSON.stringify(cell));
  e.dataTransfer.effectAllowed = "copy";
});

document.addEventListener("dragover", (e) => {
  const cell = inRoot(e.target) && (e.target as HTMLElement).closest<HTMLElement>("[data-cell]");
  if (!cell || !e.dataTransfer?.types.includes("application/x-rc600-cell")) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
  root!.querySelectorAll(".dropping").forEach((x) => x !== cell && x.classList.remove("dropping"));
  cell.classList.add("dropping");
});

document.addEventListener("dragleave", (e) => {
  if (inRoot(e.target)) (e.target as HTMLElement).closest(".dropping")?.classList.remove("dropping");
});

document.addEventListener("drop", (e) => {
  const target = cellAt(inRoot(e.target) ? (e.target as HTMLElement).closest<HTMLElement>("[data-cell]")?.dataset.cell : undefined);
  const data = e.dataTransfer?.getData("application/x-rc600-cell");
  if (!target || !data) return;
  e.preventDefault();
  place(target.si, target.li, JSON.parse(data) as Cell);
});
