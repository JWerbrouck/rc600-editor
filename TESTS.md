# Device tests: one backup round

Each test changes **one setting in its own unused memory** (60–73 are still factory
"MemoryNN"), so a single backup answers all of them at once.

## How to do it

1. Go to the memory number in the table and change only the setting listed.
   Track settings are for **TRACK 1**.
2. **WRITE** the memory to the same number.
3. Skip any test you're unsure about.
4. When done: USB storage mode, copy `ROLAND/DATA` to `tests/round1/DATA`
   in this project folder.
5. In the **Original** column, note what the pedal showed before you changed it.
   That tells us the default value for each setting.

| # | Mem | Where | Change to | Original | Resolves |
|---|-----|-------|-----------|-------------|----------|
| 1 | 60 | TRACK 1 › LOOP SYNC › SW | toggle (OFF↔ON) | ON | TRACK K/L |
| 2 | 61 | TRACK 1 › LOOP SYNC › MODE | LOOP LENGTH | LOOP LENGTH | TRACK K/L |
| 3 | 62 | TRACK 1 › TEMPO SYNC › MODE | toggle (PITCH↔XFADE) | XFADE | TRACK N |
| 4 | 63 | TRACK 1 › INPUT | only MIC 1 ON, rest OFF | ALL ON | INPUT bit order |
| 5 | 64 | TRACK 1 › INPUT | only RHYTHM ON, rest OFF | ALL ON | INPUT bit order |
| 6 | 65 | REC › REC ACTION | toggle | REC->PLAY | REC A |
| 7 | 66 | TRACK 1 › MEASURE | the shortest note value | SEMIQUAVER| note list order |
| 8 | 67 | PLAY › FADE TIME › IN | 1MEAS | 2MEAS| fade time list |
| 9 | 68 | PLAY › SYNC ADJUST | toggle | MEASURE | PLAY H |
| 10 | 69 | RHYTHM › START TRIG | BEFORE LOOP | LOOP START | RHYTHM fields |
| 11 | 70 | RHYTHM › STOP TRIG | REC END | LOOP STOP | RHYTHM fields |
| 12 | 71 | RHYTHM › INTRO REC | toggle | OFF | RHYTHM fields |
| 13 | 72 | RHYTHM › VAR.CHANGE | LOOP END | MEASURE | RHYTHM fields |
| 14 | 73 | RHYTHM › FILL | toggle | ON | RHYTHM fields |

Optional, if you use them:

| # | Mem | Where | Change to | Resolves |
|---|-----|-------|-----------|----------|
| 15 | 74 | ASSIGN 1 | any simple assign, e.g. CTL1 → TRACK1 REC/PLAY | ASSIGN layout |
| 16 | 75 | INPUT FX › bank A › FX A | set FX TYPE to DELAY | input FX layout |

## Round 1 results

| # | Result |
|---|--------|
| 1–3 | **No change in the files.** Memory 60 was saved, but with the same values; 61 and 62 weren't saved. Redo in round 2. |
| 4–5 | Inputs are a bitmask: bit 0 Mic 1 … bit 6 Rhythm. With stereo link on, only the L bit of a pair changes. |
| 6 | Rec action: 0 = Rec→Dub, 1 = Rec→Play. |
| 7 | Measure 2 = shortest note. The pedal also changes three hidden values (R, S, T) with it. |
| 8 | Fade time: 4 = 1 meas., 5 = 2 meas. |
| 9 | Sync adjust changed 1 → 0, but which value is Measure isn't known (original not noted). |
| 10–14 | Rhythm start, stop, intro on rec and fill confirmed; variation change likely (it also changed a second value). |
| 15–16 | ASSIGN switch and source, input FX switch and type found. Not editable yet. |

## Round 2

Same routine. Copy the backup to `tests/round2/DATA`. **After each WRITE, switch to another
memory and back, and check that the pedal still shows the new value.** Round 1 showed some
changes weren't kept.

| # | Mem | Where | Change to | Before → after (as shown on the pedal) |
|---|-----|-------|-----------|----------------------------------------|
| 1 | 60 | TRACK 1 › LOOP SYNC › SW | OFF | ON->OFF|
| 2 | 61 | TRACK 1 › LOOP SYNC › MODE | IMMEDIATE | LOOP LENGTH -> IMMEDIATE|
| 3 | 62 | TRACK 1 › TEMPO SYNC › MODE | PITCH | XFADE->PITCH |
| 4 | 68 | PLAY › SYNC ADJUST | just read it: what does it show now? | BEAT |
| 5 | 76 | PLAY › FADE TIME › IN | the shortest value | 2MEAS -> SEMIQUAVER |
| 6 | 77 | PLAY › FADE TIME › IN | 64MEAS (the longest) | 2MEAS -> 64MEAS |
| 7 | 78 | RHYTHM › INTRO PLAY | toggle | OFF->ON |
| 8 | 79 | RHYTHM › ENDING | toggle | OFF->ON |
| 9 | 80 | TRACK 1 › MEASURE | AUTO | FREE->AUTO|
| 10 | 81 | TRACK 1 › MEASURE | the longest note value | FREE->600 but only a fraction from the longest measure value|

## Round 2 results

| # | Result |
|---|--------|
| 1 | Loop sync on/off is TRACK `L` (1 = on). |
| 2 | Loop sync mode is TRACK `Y`: 0 Immediate, 1 Measure, 2 Loop length. I had it filed as recording state. |
| 3 | Tempo sync mode: 0 Pitch, 1 XFade. |
| 4 | Sync adjust: 0 Beat, 1 Measure. |
| 5–6 | Fade time: 0–3 note values (0 = 1/16), then 4–67 = 1–64 measures. Test 6 was done on fade-out (confirmed), so B = fade-in, C = fade-out. |
| 7–8 | Intro on play is RHYTHM `I`, ending is `J`. |
| 9 | Auto measure: J 0, R 0. |
| 10 | 600 measures: J 607, S 600. The "measures + 7" rule holds far beyond what anyone needs. |

Still unknown: TRACK `K` (always 0) and RHYTHM `M` (changes along with variation change).

## Round 3: footswitches

Goal: confirm the footswitch function numbers and find out whether the pedal uses system or
memory assignments. Copy the backup to `tests/round3/DATA` when done.

**Part A: just read and note, change nothing.**

| # | Where | Note what it shows |
|---|-------|--------------------|
| A1 | MENU › CTL FUNC › PREFERENCE | every item: MODE1–3, ALL CLEAR, CTL1–4, EXP1–2 (SYSTEM or MEMORY, ON/OFF) |
| A2 | MENU › CTL FUNC › PEDAL MODE 3 › pedal 6 | the function name (the file stores it as #230, which isn't in the guide's list) |
| A3 | MENU › CTL FUNC › PEDAL MODE 2 › pedal 8 | the function name, and any extra value shown with it |
| A4 | MENU › CTL FUNC › CTL1 … CTL4 | function for each, and anything shown next to it |

**Part B: one memory with nine test functions.**

1. Set PREFERENCE › MODE1 to **MEMORY** (note what it was).
2. Go to memory **82**. In CTL FUNC › PEDAL MODE 1, set pedals 1–9 to:

| Pedal | Function |
|-------|----------|
| 1 | TRK1 REC/PLAY1 |
| 2 | TRK1 MOMENT PLAY |
| 3 | TRK1 PLAY/STOP1 |
| 4 | TRK1 STOP1 |
| 5 | TRK1 TRACK EDIT |
| 6 | TRK1 TRACK FX |
| 7 | ALL CLEAR1 (or the first ALL CLEAR) |
| 8 | TAP TEMPO |
| 9 | the last function in the list |

3. WRITE memory 82, then set PREFERENCE › MODE1 back to what it was.
