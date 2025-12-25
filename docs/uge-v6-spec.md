# hUGETracker UGE v6 — Format Specification (implementer guide)
**Filename suggestion:** `docs/uge-v6-spec.md`  

**Purpose:** definitive reference for parsing/validating `.uge` (hUGETracker v6) files for export from the language runtime.  
**Primary source:** hUGETracker manual — "hUGETracker .UGE v5/v6 format spec". :contentReference[oaicite:2]{index=2}

---

## Short overview / constraints
- All numeric types are **little-endian** unless explicitly stated. :contentReference[oaicite:3]{index=3}  
- The file begins with a `uint32` **version number**. The spec below includes conditional fields depending on version (v5/v6 differences are noted). :contentReference[oaicite:4]{index=4}  
- UGE v6 is the version currently supported/targeted by modern tools (hUGETracker releases and GB Studio compatibility notes). Test with the latest hUGETracker and GB Studio when possible. :contentReference[oaicite:5]{index=5}

---

## Basic data types (as used in the file)
| Name | Bytes | Notes |
|------|-------|-------|
| `uint8`  | 1 | unsigned 0..255 |
| `int8`   | 1 | signed -127..127 |
| `uint32` | 4 | unsigned 32-bit little-endian |
| `bool`   | 1 | 0 = false, non-zero = true |
| `shortstring` | 256 | 1 byte length (L), then up to 255 bytes of characters (no extra terminator) |
| `string` | variable | `uint32` length (N), then N bytes, terminated with 0x00. (Manual describes it as uint32 then stream with 0x00 terminator). :contentReference[oaicite:6]{index=6} |

> Implementation note: treat `shortstring` as `length byte` + `length` ASCII/UTF-8 bytes; treat `string` as `uint32 length` then read up to the next 0x00 (ensure you handle exact semantics in the manual). :contentReference[oaicite:7]{index=7}

---

## Top-level layout (in order)
1. **Header**
   - `uint32` Version number
   - `shortstring` Song name
   - `shortstring` Song artist
   - `shortstring` Song comment  
   (All 3 shortstrings follow the `shortstring` layout above.) :contentReference[oaicite:8]{index=8}

2. **Duty (Pulse) Instruments** — repeated **15 times** (Duty instruments block)  
   See “Duty Instruments” section for the exact fields. :contentReference[oaicite:9]{index=9}

3. **Wave Instruments** — repeated **15 times** (Wave instruments block) :contentReference[oaicite:10]{index=10}

4. **Noise Instruments** — repeated **15 times** (Noise instruments block) :contentReference[oaicite:11]{index=11}

5. **Wavetable data** — a fixed set of wave RAMs (repeat 16 × 32 nibbles) :contentReference[oaicite:12]{index=12}

6. **Song Patterns** — patterns payload: ticks-per-row, number of patterns, and then pattern entries (each pattern contains exactly 64 rows per channel) :contentReference[oaicite:13]{index=13}

7. **Song Orders** — order lists per channel (Duty1, Duty2, Wave, Noise) with noted off-by-one behaviour in older exporters; spec explicitly documents this. :contentReference[oaicite:14]{index=14}

8. **Routines** — 16 routine strings (each is a `string` storing code data). :contentReference[oaicite:15]{index=15}

---

## Detailed field layout

> The following is a literal translation of the manual's structured spec (use this as the canonical read order). Conditional only-on-v6 fields are marked.

### Header
- `uint32` versionNumber  
- `shortstring` songName  
- `shortstring` songArtist  
- `shortstring` songComment. :contentReference[oaicite:16]{index=16}

### Duty Instruments (repeat 15 times)
- `uint32` Type (0 for duty/pulse instruments)  
- `shortstring` Instrument name  
- `uint32` Length (pattern length / instrument length)  
- `bool` Length enabled  
- `uint8` Initial volume  
- `uint32` Volume sweep direction (0 = Increase, 1 = Decrease)  
- `uint8` Volume sweep change  
- `uint32` Frequency sweep time (0..7)
- `uint32` Frequency sweep direction (0 = Increase/Up, 1 = Decrease/Down)
- `uint32` Frequency sweep shift (0..7)
- `uint8` Duty cycle (0..3 mapping to 12.5/25/50/75%)  
- `uint32` Unused  
- `uint32` Unused  
- *If `versionNumber` < 6:*
  - `uint32` Unused  
- `uint32` Unused  
- *If `versionNumber` < 6:*
  - `uint32` Unused  
- *Else (v6 and up):*
  - `bool` Subpattern enabled  
    - Repeat 64 times:
      - `uint32` Row note (0..72; 90 means unused)
        - **BeatBax Mapping**: Index 0 corresponds to MIDI 36 (C2, ~65.4Hz).
      - `uint32` Unused
      - `uint32` Jump command value (0 if empty)
      - `uint32` Effect code
      - `uint8` Effect parameter
- *If `versionNumber` >= 4 and < 6:*
  - Repeat 6 times:
    - `int8` unused

> Notes:
> - The "subpattern" block (v6) stores per-row specifics for the instrument (allowing instruments to embed small sequences of control data). :contentReference[oaicite:17]{index=17}

### Wave Instruments (repeat 15 times)
- `uint32` Type (1)  
- `shortstring` Instrument name  
- `uint32` Length  
- `bool` Length enabled  
- `uint8` Unused  
- `uint32` Unused  
- `uint8` Unused  
- `uint32` Unused  
- `uint32` Unused  
- `uint32` Unused  
- `uint8` Unused  
- `uint32` Volume  
- `uint32` Wave index  
- *If `versionNumber` < 6:*
  - `uint32` Unused  
- `uint32` Unused  
- *If `versionNumber` < 6:*
  - `uint32` Unused  
- *Else (v6+):*
  - `bool` Subpattern enabled
    - Repeat 64 times:
      - `uint32` Row note (0..72; 90 unused)
      - `uint32` Unused
      - `uint32` Jump command value (0 if empty)
      - `uint32` Effect code
      - `uint8` Effect parameter
- *If `versionNumber` >= 4 and < 6:*
  - Repeat 6 times:
    - `int8` Unused

### Noise Instruments (repeat 15 times)
- `uint32` Type (2)  
- `shortstring` Instrument name  
- `uint32` Length  
- `bool` Length enabled  
- `uint8` Initial volume  
- `uint32` Volume sweep direction (0 = Increase, 1 = Decrease)  
- `uint8` Volume sweep change  
- `uint32` Unused  
- `uint32` Unused  
- `uint32` Unused  
- `uint8` Unused  
- `uint32` Unused  
- `uint32` Unused  
- *If `versionNumber` < 6:*
  - `uint32` Unused  
- `uint32` Noise mode (0 = 15 bit, 1 = 7 bit)  
- *If `versionNumber` < 6:*
  - `uint32` Unused  
- *Else (v6+):*
  - `bool` Subpattern enabled
    - Repeat 64 times:
      - `uint32` Row note
      - `uint32` Unused
      - `uint32` Jump command value
      - `uint32` Effect code
      - `uint8` Effect parameter
- *If `versionNumber` >= 4 and < 6:*
  - Repeat 6 times:
    - `int8` Noise macro data

### Wavetable data
- Repeat 16 times:
  - Repeat 32 times:
    - `uint8` Wavetable nibble data (0..15 expected per nibble)
  - *If `versionNumber` < 3:*
    - `uint8` Off-by-one filler

> Notes:
> - Wave RAMs are presented as 32 nibbles per wave; each nibble is stored in a `uint8` but should be constrained to 0..15 on write/validate. :contentReference[oaicite:18]{index=18}

### Song Patterns
- `uint32` Initial ticks per row
- *If `versionNumber` >= 6:*
  - `bool` Timer based tempo enabled
  - `uint32` Timer based tempo divider
- `uint32` Number of song patterns
- Repeat `Number of song patterns` times:
  - `uint32` Pattern index
  - Repeat 64 times:
    - `uint32` Row note (0..72, 90 = unused)
    - `uint32` Instrument value (0 if not used)
    - *If `versionNumber` >= 6:*
      - `uint32` Unused
    - `uint32` Effect code
    - `uint8` Effect parameter

### Song Orders
- Repeat 4 times (for channels: Duty1, Duty2, Wave, Noise):
  - `uint32` Order length + 1   (note: the spec documents an off-by-one bug; the stored value is order length + 1)
  - Repeat `Order length` times:
    - `uint32` Order index
  - `uint32` Off-by-one filler (0)

> Implementation note:
> - When writing and reading, handle the off-by-one value carefully (storeers historically wrote length+1; validate producers or produce compatible values). :contentReference[oaicite:19]{index=19}

### Routines
- Repeat 16 times:
  - `string` Routine code data (a `uint32` length followed by bytes, terminated by 0x00 per manual description). :contentReference[oaicite:20]{index=20}

---

## Validation rules / sanity checks (what your exporter/validator should assert)
1. **Version** must be >= 5 and <= 6 (for this v6 spec). If writing v6, set versionNumber = 6. Validate consumers' expectations. :contentReference[oaicite:21]{index=21}  
2. **String lengths**: ensure `shortstring` length byte ≤ 255 and actual bytes ≤ 255.  
3. **Instrument counts**: exactly 15 entries each for Duty, Wave, Noise.  
4. **Pattern rows**: exactly 64 rows per pattern; each row's note must be in expected numeric range (0..72, 90 for unused).  
5. **Wavetable nibble values**: each `uint8` must be 0..15 (nibble).  
6. **Order length**: remember the spec’s "Order length + 1" storage; verify the writer computes the stored value appropriately. :contentReference[oaicite:22]{index=22}  
7. **Effect codes & parameters** must fit tracker-defined ranges—validate any effect mapping table you implement corresponds to hUGETracker effect codes (see manual effect reference). :contentReference[oaicite:23]{index=23}  
8. **Subpattern blocks**: if writing v6 include the subpattern block for each instrument with the exact 64 rows and fields. If not required, set `Subpattern enabled = false` and fill minimal placeholders as spec requires. :contentReference[oaicite:24]{index=24}

---

## Parsing guidance / pseudocode
1. Read `version` (uint32). Decide code paths for v6-only fields.  
2. Read header shortstrings (song name/artist/comment).  
3. Loop 15 times: parse Duty instrument entries (respect `version` conditionals).  
4. Loop 15 times: parse Wave instrument entries.  
5. Loop 15 times: parse Noise instrument entries.  
6. Parse 16 wavetable blocks (32 bytes each).  
7. Parse song-level values (ticks per row, timer-based tempo flags if v6+, number of patterns).  
8. For each pattern, read 64 rows -> note/instrument/effect/parameter fields.  
9. For each of the 4 order blocks, read order length (remember +1), then the index list, then trailing filler.  
10. Read 16 routines (strings).

> Implementation tip: implement a **stream-reader** helper that reads typed values in little-endian and exposes `readUint8`, `readUint32`, `readBool`, `readShortString`, `readString`, etc.

---

## TypeScript interface sketch
Use these as a starting point to map the binary file into memory for validation or round-trip tests.

```ts
// types/uge.ts (sketch)
export type UGEVersion = 5 | 6;

export interface UGEHeader {
  version: number;
  songName: string;
  songArtist: string;
  songComment: string;
}

export interface InstrumentSubRow {
  rowNote: number; // 0..72, 90 = unused
  unused: number;
  jumpCommand: number;
  effectCode: number;
  effectParam: number; // uint8
}

export interface DutyInstrument {
  type: 0;
  name: string;
  length: number;
  lengthEnabled: boolean;
  initialVolume: number; // uint8
  volumeSweepDirection: number; // 0 inc, 1 dec
  volumeSweepChange: number; // uint8
  freqSweepTime: number;
  sweepEnabled: number;
  freqSweepShift: number;
  duty: number; // uint8
  // ... unused fields omitted for brevity
  subpatternEnabled?: boolean;
  subpattern?: InstrumentSubRow[]; // length 64
}

export interface WaveInstrument {
  type: 1;
  name: string;
  length: number;
  lengthEnabled: boolean;
  volume: number;
  waveIndex: number;
  subpatternEnabled?: boolean;
  subpattern?: InstrumentSubRow[];
}

export interface NoiseInstrument {
  type: 2;
  name: string;
  length: number;
  lengthEnabled: boolean;
  initialVolume: number;
  volumeSweepDirection: number;
  volumeSweepChange: number;
  noiseMode?: number; // 0 = 15bit, 1 = 7bit
  subpatternEnabled?: boolean;
  subpattern?: InstrumentSubRow[];
}

export interface WaveRam {
  nibbles: number[]; // 32 values 0..15
}

export interface PatternRow {
  rowNote: number;
  instrument: number;
  unused?: number;
  effectCode: number;
  effectParam: number;
}

export interface SongPattern {
  index: number;
  rows: PatternRow[]; // 64 rows
}

export interface OrderBlock {
  orderIndexes: number[]; // length = orderLength
}

export interface UGEFile {
  header: UGEHeader;
  dutyInstruments: DutyInstrument[]; // length 15
  waveInstruments: WaveInstrument[]; // length 15
  noiseInstruments: NoiseInstrument[]; // length 15
  wavetables: WaveRam[]; // length 16
  ticksPerRow: number;
  timerTempoEnabled?: boolean;
  timerTempoDivider?: number;
  patterns: SongPattern[];
  orders: OrderBlock[]; // 4 blocks
  routines: string[]; // length 16
}
