# RC-600 Editor

An open editor for the memory settings of a BOSS RC-600 Loop Station. It reads and writes the
pedal's own files over USB storage mode, so it needs no driver and no MIDI.

## Use it

Needs Node.js 18 or newer (the current LTS from nodejs.org is fine); check with `node -v`.

```bash
npm install
npm run dev
```

Open http://localhost:5600 in Chrome or Edge. Every tab opens without the pedal; to edit memory,
footswitch and system settings, put the RC-600 in USB storage mode and press **Open RC-600**. Edit, then **Write to RC-600**. The first write in a session copies every pedal
file into a new dated folder inside your backup folder. You choose that folder once; the editor
remembers it (the write dialog has **Use another backup folder…** to change it).

To try it without the pedal, run `npm run sandbox` (copies `DATA/` to `sandbox/DATA`) and use
**Use the sandbox copy**. Run it again to reset the sandbox.

## What it does

- Memory names, tempo and beat (memories without recordings only)
- Track settings for all six tracks, in one table
- Recording, playback and rhythm settings
- Copy settings groups from one memory to many (e.g. "track settings to 10–20")
- Effects: input and track FX, banks A–D and FX A–D: on/off, effect type, switch mode, what it
  applies to, and each effect's settings where their values are mapped (see `src/core/effects.ts`)
- ASSIGN 1–16 per memory: a source (footswitch, expression pedal, MIDI CC) controls a target
  (track level, tempo, an effect, …) between a min and max
- Footswitch assignments (pedals 1–9, modes 1–3), for the system or per memory: tap a pedal on
  the board and pick its function
- System settings: MIDI channels, memory extent, indicator colors, noise suppressors, USB levels
  and EQs; the rest is shown as stored until round 3 of TESTS.md confirms it
- Restore from a backup (System › Restore from a backup…): stages a backup's system settings and
  footswitch assignments wherever they differ from the pedal; recordings, phantom power, the
  start-up memory and the knob-driven phones/master levels are left alone
- Write only changed files, the way the pedal does: to the older of the A/B copies (MEMORYnnnA/B,
  SYSTEM1/2), with the write counter raised

Settings whose meaning isn't known are hidden and kept exactly as they are, as are routing settings.

## Live MIDI

**Live MIDI** (also on the start screen) is a board of buttons, toggles and sliders that send MIDI
to the RC-600 over USB. The pedal must be in its normal mode, not USB storage mode.

- Program change switches memory (program 1 = memory 01); start/stop follow MIDI › SYNC START.
- A CC does something once a memory has an ASSIGN with source "MIDI CC#" (1–31 or 64–95) and
  the target you want. The channel must match MIDI › RX CH › CTL.
- Several named boards; pick one at the top left. Boards are saved in this browser and stay after
  a restart; export one as JSON to use it on another computer or tablet.
- **Edit board**: add buttons, toggles and sliders, drag a control to move it, drag its corner to
  resize it, tap it to set its label, color and message. The grid size (columns × rows) is set
  per board, so one full-height button next to stacked buttons and tall sliders is possible.

## Arranger

**Arranger** builds a song from blocks: loops you write in MuseScore, one score per loop, exported
with File › Export › MusicXML (`.musicxml` or `.mxl`) into one folder per song. The file name is
the block's name.

- Open the song folder, then tap a block and tap where it plays (or drag it). Rows are tracks,
  columns are sections; a block can play several times in a section. Blocks with several staves
  offer each staff separately.
- Blocks are referenced, not copied: export a block again from MuseScore and the arrangement and
  preview update within a few seconds.
- **Export score** writes one MusicXML score (one staff per used track, section names as rehearsal
  marks) into the folder, to open in MuseScore. Edit the blocks, not this score.
- The arrangement is saved in the folder as `arrangement.json`. Block files are only read.
- Blocks should be whole bars without pickup, and share the section's time signature; the arranger
  flags them when they don't.

In development, **Try the demo song** uses `sandbox/song`, copied from `examples/demo-song` the
first time. Delete `sandbox/song` to reset it.

## How it works

- [FORMAT.md](FORMAT.md): the file format
- [schema/memory.json](schema/memory.json): what each value means, with confidence and evidence
- [TESTS.md](TESTS.md): device tests used to confirm the mapping
- `src/core/rc0.ts`: lossless reader/writer; unedited files come back byte for byte
- `npm test`: checks the round trip on every file in `DATA/` and the write logic
