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

## Round 3: footswitches and system settings

Goal: pin down the footswitch function numbers, what PREFERENCE stores, and the system
settings the editor can't name yet. One sitting, about 20 minutes. When done, copy the
backup to `tests/round3/DATA`.

Part A only reads. Parts B and C change things; Part A's notes are how you put them back
afterwards (or the editor can, once round 3 is decoded). Leave phantom power alone throughout.

### Part A: read and note, change nothing

The last column lists which settings to look up, not their values. Write down what the
pedal shows for each, in any form, for example:

```
A1: MODE1 SYSTEM, MODE2 SYSTEM, MODE3 MEMORY, ALL CLEAR ON, CTL1-4 SYSTEM, EXP1-2 SYSTEM
A5: RX CH CTL 1, RHYTHM 10, VOICE 1, TX CH RX CTL, SYNC CLOCK AUTO, ...
```

| # | Where | Settings to look up | VALUES (write down what the pedal shows) |
|---|-------|---------------------|------------------------------------------|
| A1 | MENU › CTL FUNC › PREFERENCE | each item: MODE1, MODE2, MODE3, ALL CLEAR, CTL1–4, EXP1, EXP2 | SYSTEM/MEMORY, SYSTEM/MEMORY, SYSTEM/MEMORY, ON/OFF, SYSTEM/MEMORY, SYSTEM/MEMORY, SYSTEM/MEMORY |
| A2 | MENU › INPUT › SETUP | PHANTOM MIC1/MIC2, INST1 GAIN, INST2 GAIN, STEREO LINK MIC/INST1/INST2, PREFERENCE MIC/INST1/INST2 | ON/OFF, INST/LINE, INST/LINE, ON/OFF |
| A3 | MENU › OUTPUT › SETUP | OUTPUT KNOB, STEREO LINK MAIN/SUB1/SUB2, PREFERENCE (all six) | ALL/MASTER/PHONES/OFF, ON/OFF, ON/OFF |
| A4 | MENU › OUTPUT › ROUTING | PHONES OUT › SW, RHYTHM OUT, INPUT THRU | MAIN-L/MAIN-R/SUB1-L/SUB1-R/SUB2-L/SUB2-R/INDIVIDUAL, LOOP/OUTPUT, ON/OFF |
| A5 | MENU › MIDI | every item: RX CH CTL/RHYTHM/VOICE, TX CH, SYNC CLOCK, CLOCK OUT, SYNC START, PC OUT, THRU MIDI IN, THRU USB IN |
| A6 | MENU › SETUP | CONTRAST, DISPLAY MODE, LOOP INDICAT, ORB INDICAT, AUTO OFF, MEMORY EXT, KNOB FUNC 1–4 |
| A7 | MENU › USB | AUDIO MODE, AUDIO ROUTING |
| A8 | MENU › CTL FUNC › PEDAL MODE 3 | the function on pedal 6 (stored as #230) |
| A9 | MENU › CTL FUNC › CTL/EXP | CTL1–CTL4: PUSH / HOLD / CLICK functions |

### Part B: 27 footswitch functions in memory 82

1. In PREFERENCE, set MODE1, MODE2 and MODE3 to **MEMORY**.
2. Go to memory **82**. In CTL FUNC › PEDAL MODE 1, 2 and 3, set the pedals as below.
3. WRITE memory 82.

| Pedal | Mode 1 | Mode 2 | Mode 3 |
|-------|--------|--------|--------|
| 1 | TRK1 REC/PLAY1 | TRK1 CLEAR | ALL START/STOP6 |
| 2 | TRK1 MOMENT PLAY | TRK1 MARK BACK1 | ALL CLEAR1 |
| 3 | TRK1 PLAY/STOP1 | TRK1 DOUBLE SPEED (MOMENT) | ALL CLEAR2 |
| 4 | TRK1 PLAY/STOP2 | TRK1 TRACK EDIT | TAP TEMPO |
| 5 | TRK1 PLAY/STOP3 | TRK1 TRACK FX | TEMPO UP |
| 6 | TRK1 STOP1 | CUR.TRK INC | TEMPO DOWN |
| 7 | TRK1 STOP2 | ALL START/STOP2 | PEDAL MODE INC |
| 8 | TRK1 STOP3 | ALL START/STOP3 | INPUT FX |
| 9 | TRK1 STOP5 | ALL START/STOP4 | LED |

If a function isn't in the pedal's list, leave that pedal as it is and note it.

### Part C: system settings with recognisable values

Change these (Part A has the old values), then make the backup.

| # | Where | Set to |
|---|-------|--------|
| C1 | SETUP › CONTRAST | 3 |
| C2 | SETUP › DISPLAY MODE | LOOP LEVEL |
| C3 | SETUP › LOOP INDICAT / ORB INDICAT | TEMPO / BEAT |
| C4 | SETUP › AUTO OFF | the other value |
| C5 | MIDI › RX CH VOICE / TX CH | 3 / 5 |
| C6 | MIDI › SYNC CLOCK / SYNC START | MIDI / RHYTHM |
| C7 | MIDI › THRU MIDI IN / THRU USB IN | USB OUT / MIDI OUT |
| C8 | INPUT › DYNAMICS › MIC1 COMP | 25 |
| C9 | OUTPUT › SETUP › OUTPUT KNOB | PHONES |
| C10 | OUTPUT › MIXER | MIC1 IN 111, INST2-R IN 77, PHONES OUT 66, MASTER OUT 133 |
| C11 | OUTPUT › MASTER FX | COMP 12, REVERB 7 |
| C12 | INPUT › EQ › MIC1 | LO MID FREQ 1.00 kHz, LO CUT 100 Hz, HI CUT 8.00 kHz |

### Results

Notes: `tests/round3/notes.json`; backup: `tests/round3/DATA`. `test/round3.test.ts` checks the
decoding against it.

- PREFERENCE: modes 1–3 set to MEMORY changed PREF.C/D/E from 1 to 0, so 0 = memory, 1 = system.
- Footswitch numbers: see the header of `src/core/footswitch.ts`. Per track (26): REC/PLAY1–4,
  MOMENT PLAY, PLAY/STOP2–3, STOP1–5, CLEAR, … TRACK FX. PLAY/STOP1 isn't in the block: TRK1
  PLAY/STOP1 = 218, added after LED (216) with ALL START/STOP4 = 226, /6 = 228, ALL CLEAR2 = 229
  and MEMORY INC2 = 230. 187/188 ALL START/STOP2–3, 189 ALL CLEAR1, 190 TAP TEMPO, 191/192 TEMPO
  UP/DOWN, 194 PEDAL MODE INC, 195 INPUT FX.
- Pedal B/C are the function's value range: 0/1 normally, 1/2 DOUBLE SPEED (MOMENT), 0/100 TEMPO
  UP/DOWN, 0/7 LED. The editor writes them with the function.
- Part C: SETUP I contrast (value − 1), D start-up screen, G loop indicator, V auto off; MIDI F/H/J/K;
  INPUT H mic 1 comp; OUTPUT A knob (Phones = 2, so part A's reading was probably taken after
  C9); MIXER A mic 1, I inst 2 (L), U phones, V master; MASTER_FX A comp, B reverb; EQ steps
  (1.00 kHz = 17, low cut 100 Hz = 8, high cut 8.00 kHz = 11). MIDI D (voice) went 0 → 3 for
  channel 1 → 3, which doesn't fit 0-based channels; left unmapped. ORB INDICAT not identified.

Part A, compared with the round 2 backup:

- MIDI: all ten values match in the guide's order (A ctl, C rhythm, D voice, E tx 0–15 then
  "rx ctl", F sync clock, G sync out, H sync start, I pc out, J/K thru). Now editable.
- INPUT A–G: phantom on/on (1/1), inst gain inst/inst (0/0), stereo link mic/inst1/inst2
  off/on/on (0/1/1). Phantom stays locked in the editor.
- CTL jacks use the pedal function list: CTL1 196 = input FX A (FX ON/OFF), CTL3 190 = tap
  tempo, CTL4 207 = rhythm start/stop. CTL2 211 shows PUSH DEC / HOLD DEC.
- #230 (mode 3 pedal 6) = MEMORY INC2, so the memory functions aren't in the guide's order;
  210–214 are unnamed until part B is decoded.
- PREFERENCE: everything shows SYSTEM and ALL CLEAR shows OFF, while all 20 stored values are
  1, so ALL CLEAR is probably stored elsewhere. Part B (modes 1–3 set to MEMORY) will show
  which value is which.
- Pedal list differences found in part B: TRK1 TRACK EDIT doesn't exist on this pedal;
  CUR.TRK INC is called CUR.TRK INC1 (so INC2/DEC1/DEC2 likely exist, as in the cjbagwell list).
- Part C changes: C3 set LOOP INDICAT BEAT / ORB INDICAT TEMPO (ORB has no BEAT); C4 AUTO OFF
  OFF; C10 MIC1 IN 111, INST2 IN 77, PHONES OUT 66, MASTER OUT 133 in MENU › MIXER.

## Round 4: ASSIGN (and optionally effect rates and times)

Goal: find out which of the 10 stored ASSIGN values is which setting, and how sources and targets
are numbered. Part B (optional) maps the effect settings the editor still hides. Everything happens
in one memory, so nothing else changes. When done, copy the backup to `tests/round4/DATA`, and fill
in `tests/round4/notes.json` (or note anything unusual in it).

### Part A: four ASSIGNs in memory 83

Go to memory **83** (or any memory you don't use; note which). In MENU › ASSIGN, set:

| | ASSIGN 1 | ASSIGN 2 | ASSIGN 3 | ASSIGN 4 |
|---|---|---|---|---|
| SW | ON | ON | OFF | ON |
| SOURCE | MIDI CC#20 | EXP1 | PEDAL4 MODE2 | CTL3 |
| SOURCE MODE | TOGGLE | MOMENT | TOGGLE | MOMENT |
| SOURCE ACT. LO | 10 | 0 | 5 | 20 |
| SOURCE ACT. HI | 90 | 127 | 120 | 100 |
| TARGET | TRK2 LEVEL | TEMPO | IN FX B | RHYTHM LEVEL |
| TARGET MIN | 30 | 60.0 | OFF | 50 |
| TARGET MAX | 170 | 180.0 | ON | 150 |

If a value can't be set exactly (for example the tempo steps), note what you used. If SOURCE
MODE or a setting isn't offered for a source, skip it and note that.

### Part B (optional): effect rates and times, same memory

In memory 83, INPUT FX › BANK A:

| FX | Type | Set |
|---|---|---|
| A | LPF | RATE: 1MEAS. STEP RATE: 2MEAS |
| B | DELAY | TIME: 500 ms |
| C | REVERB | TIME: the value shown as 5.0 (or closest). PRE DELAY: 20 ms. DENSITY: 7 |
| D | CHORUS | RATE: 75 |

And TRACK FX › BANK A:

| FX | Type | Set |
|---|---|---|
| A | TREMOLO | RATE: start at 1MEAS and turn the knob 3 steps further; note what it shows |
| B | PANNING DELAY | TIME: start at 2000 ms and turn the knob 1 step further; note what it shows |
| C | RADIO | LO-FI: 8 |
| D | PITCH BEND | PITCH: +1OCT |

WRITE memory 83.

### Results

Backup: `tests/round4/DATA`. `test/assign.test.ts` reads the four ASSIGNs back as set.

- ASSIGN: A on, B source, D source mode (0 momentary, 1 toggle), E/F active range, G target,
  I/J target min/max (tempo ×10). C and H didn't change; left alone. Sources and targets follow
  the guide's order with per-track / per-FX rows expanded (`src/core/assign.ts`); checked at
  CC#20 = 65, EXP1 = 44, PEDAL4 MODE2 = 25, CTL3 = 42, TRK2 LEVEL = 21, TEMPO = 82,
  IN FX B = 104, RHYTHM LEVEL = 728.
- Effect type numbers aren't the file's block order after 39: REVERB = 46, CHORUS = 45 (see the
  header of `src/core/effects.ts`).
- RATE: 0–100 at 14–114 (CHORUS 75 = 89, TREMOLO 4 = 18). STEP RATE: OFF, then 2MEAS = 2.
  TIME: ms + 11 (500 ms = 511, 201 ms = 212). REVERB time ×10 s, pre-delay ms, density as shown.
  RADIO lo-fi = value − 1. PITCH BEND: −3, −2, −1, +1 … +4 oct (+1 = 3).
- Open: LPF RATE set to 1MEAS stored 15, which the list above reads as "1"; the tempo-synced
  steps are shown as "synced" until that's clear.
