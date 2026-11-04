# RC-600 data format notes

Findings from the backup in `DATA/` (copied from `ROLAND/DATA` in USB storage mode).
Treat `DATA/` as a read-only reference backup; never write tools against it.

## Files

| File | Size | Format | Contents |
|---|---|---|---|
| `MEMORY001A.RC0` … `MEMORY099B.RC0` | ~288 KB each | XML | One memory per file, two copies (A/B) |
| `SYSTEM1.RC0`, `SYSTEM2.RC0` | ~7 KB | XML | System settings, two copies |
| `RHYTHM.RC0` | ~2 MB | Binary | Rhythm patterns (out of scope for now) |

## A/B copies and the write counter

Each file ends with `<count>XXXX</count>` *after* `</database>`, with no trailing newline.
The value is a hexadecimal write counter, not a checksum: the copy with the higher
count is the current one, and the device alternates writes between A and B.
Example: `MEMORY001A` has `0085`, `MEMORY001B` has `0084`, and they differ in one value.

To write a memory safely: overwrite the *older* copy with count = newer + 1
(or write both). Exact byte layout (UTF-8, tabs, LF line endings, no final newline)
should be preserved.

## Memory file structure

```
<?xml version="1.0" encoding="utf-8"?>
<database name="RC-600" revision="0">
<mem id="N">            N = memory number - 1 (0..98)
  NAME                  12 chars as ASCII codes in <A>..<L>
  TRACK1..TRACK6        25 values each (A..Y)
  MASTER, REC, PLAY, RHYTHM
  ICTL1/2_TRACKn_FX/TRACK, ICTL1-3_PEDAL1-9, ECTL_CTL1-4, ECTL_EXP1-2
  ASSIGN1..ASSIGN16
  INPUT, OUTPUT, ROUTING, MIXER, EQ_* (12 blocks), MASTER_FX, FIXED_VALUE
</mem>
<ifx id="N">            input FX: banks AA..AD (+ ...), each with every effect type's params
<tfx id="N">            track FX: same idea (DD_* etc.)
</database>
<count>XXXX</count>
```

Field names are letters (A, B, C...), so meaning comes from the order of the parameters
in BOSS's RC-600 Parameter Guide and from controlled diffs (change one setting on the device,
back up, compare).

## Field map

The per-field map with confidence levels is in [schema/memory.json](schema/memory.json).
Covered so far: NAME, TRACK1-6, MASTER, REC, PLAY, RHYTHM. Open questions are
listed as device tests in [TESTS.md](TESTS.md).

Key points:
- Each track's settings are fields `A`..`Q`, in Parameter Guide order. `R`..`Y` hold
  recording state (tempo, samples per measure, length, has-audio). The editor must leave them alone.
- Lists and switches are stored as 0-based indexes. Track and input selections are bitmasks
  (63 = tracks 1-6, 127 = all 7 inputs).
- Tempo is stored × 10 (`MASTER/A` 1200 = 120.0 BPM).
- `tools/stats.mjs DATA <SECTION>...` prints value distributions across all memories.
