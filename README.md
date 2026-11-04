# RC-600 Editor

An open editor for the memory settings of a BOSS RC-600 Loop Station. It reads and writes the
pedal's own files over USB storage mode, so it needs no driver and no MIDI.

## Use it

```bash
npm install
npm run dev
```

Open http://localhost:5600 in Chrome or Edge. Every tab opens without the pedal; to edit memory,
footswitch and system settings, put the RC-600 in USB storage mode and press **Open RC-600**. Edit, then **Write to RC-600**. The first write in a session copies every memory
file to a backup folder you choose.

To try it without the pedal, run `npm run sandbox` (copies `DATA/` to `sandbox/DATA`) and use
**Use the sandbox copy**. Run it again to reset the sandbox.

## What it does

- Memory names, tempo and beat (memories without recordings only)
- Track settings for all six tracks, in one table
- Recording, playback and rhythm settings
- Copy settings groups from one memory to many (e.g. "track settings to 10–20")
- Write only changed memories, the way the pedal does: to the older of the A/B copies, with the
  write counter raised

Settings whose meaning isn't confirmed yet are shown but not editable. Effects, ASSIGN, control
and routing settings are kept exactly as they are.

## Live MIDI

**Live MIDI** (also on the start screen) is a board of buttons, toggles and sliders that send MIDI
to the RC-600 over USB. The pedal must be in its normal mode, not USB storage mode.

- Program change switches memory (program 1 = memory 01); start/stop follow MIDI › SYNC START.
- A CC does something once a memory has an ASSIGN with source "MIDI CC#" (1–31 or 64–95) and
  the target you want. The channel must match MIDI › RX CH › CTL.
- **Edit board** to add, change, reorder or remove controls. The board is saved in the browser;
  export it as JSON to use on another computer.

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
