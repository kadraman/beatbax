---
title: "FamiTracker Text Export"
status: complete
authors: ["kadraman"]
created: 2026-04-19
issue: "https://github.com/kadraman/beatbax/issues/94"
---

## Summary

Implement real FamiTracker text (`.txt`) export in `@beatbax/plugin-exporter-famitracker`.

> Note (2026-04-21): Binary `.ftm` export has been removed from the product surface. The supported FamiTracker export path is `famitracker-text` only.

## Problem Statement

The `famitrackerBinaryExporterPlugin` and `famitrackerTextExporterPlugin` in `packages/plugins/export-famitracker/src/index.ts` call `placeholderHeader()` and return a comment-only byte stream. Neither produces output that FamiTracker v0.4.6 or FamiStudio can open. This blocks:

1. Round-trip testing: NES songs authored in BeatBax cannot be opened in FamiTracker for verification.
2. NES chip validation: There is no way to hear the BeatBax NES channel model through reference hardware or FamiTracker's playback engine.
3. Community workflows: Users who author in BeatBax and master in FamiTracker have no usable export path.

---

## Instrument Field Mapping Analysis

This section documents every instrument field declared in the NES chip plugin README and in the NES example songs, and specifies exactly how each field maps to FamiTracker's internal model. The analysis is based on the four current NES songs (`iron_keep.bax`, `kingdom_hall.bax`, `shadow_temple.bax`, `wily_fortress.bax`) and the FamiTracker v0.4.6 format spec.

### Macro (Sequence) System Overview

FamiTracker instruments reference up to five named macro sequences per instrument, each identified by a sequence index. The five types for 2A03 instruments are:

| FTM macro type | FTM text keyword | Index | Description |
|---|---|---|---|
| Volume | `MACRO VOLUME` | 0 | Per-frame volume levels (0–15) |
| Arpeggio | `MACRO ARPEGGIO` | 1 | Per-frame semitone offsets from root |
| Pitch | `MACRO PITCH` | 2 | Per-frame fine pitch offsets (in units of 1/16 semitone) |
| Hi-Pitch | `MACRO HIPITCH` | 3 | Per-frame coarse pitch (semitone units); used for duty sweep in some tools |
| Duty | `MACRO HIPITCH` / duty field | 4 | Per-frame duty cycle index (0=12.5%, 1=25%, 2=50%, 3=75%) |

BeatBax macros run at 60 Hz (NTSC frame rate), matching FamiTracker NTSC mode exactly. One BeatBax macro frame = one FamiTracker sequence step.

---

### Pulse 1 / Pulse 2 Fields

| BeatBax field | Example usage | FTM mapping | Notes |
|---|---|---|---|
| `duty=12\|12.5\|25\|50\|75` | `duty=25` | INST2A03 duty index field (0–3); `duty_env` overrides this per-frame | Map: 12/12.5%→0, 25%→1, 50%→2, 75%→3 |
| `env=level,flat` | `env=12,flat` | MACRO VOLUME: single entry `[level]` with loop at 0 (holds indefinitely) | Equivalent to a constant-volume macro |
| `env=level,down` | `env=15,down` | MACRO VOLUME: generated decay sequence `[level, level-1, ..., 0]`; no loop point | Hardware-style linear decay |
| `env_period=N` | `env_period=2` | Controls step length in the generated decay sequence: each volume level repeats `N+1` times | `env_period=0` → one level per frame; `env_period=2` → 3 frames per level |
| `env_loop=true` | (not used in songs) | Loop point set to 0 in the MACRO VOLUME sequence (repeats from start) | Rarely used on melodic instruments |
| `vol=N` | `vol=10` | MACRO VOLUME: single entry `[N]` with loop at 0 (identical to `env=N,flat`) | Use whichever is present; `vol_env` takes precedence if both present |
| `vol_env=[v0,v1,...\|N]` | `vol_env=[1,2,3,4,5,6,7,8,9,10\|9]` | MACRO VOLUME sequence with per-frame values; `\|N` sets loop point index | Direct 1:1 mapping to FTM volume macro |
| `arp_env=[0,s1,...\|N]` | `arp_env=[0,4,7\|0]` | MACRO ARPEGGIO sequence; values are semitone offsets; `\|N` = loop point | Direct 1:1 mapping. Also valid on triangle (see Triangle Fields). |
| `pitch_env=[s0,s1,...\|N]` | `pitch_env=[5,4,3,2,1,0,0,0]` | MACRO PITCH sequence; **BeatBax values are in semitones — multiply by 16 for FTM pitch macro units** (1 FTM unit = 1/16 semitone) | `pitch_env=[5,4,3,2,1,0,0,0]` → FTM sequence `[80,64,48,32,16,0,0,0]`, no loop; creates a 5-semitone fall-in rip on each attack |
| `duty_env=[d0,d1,...\|N]` | `duty_env=[2,2,2,2,2,2,2,2,0,0,0,0,0,0,0,0\|0]` | MACRO HIPITCH (type 4) sequence; duty index values 0–3; `\|N` = loop point | Loop point creates automatic cycling wah effect. `duty_env=[...|0]` loops from frame 0 indefinitely. |
| `note=X` | (not used on pulse in songs) | Not written to FTM instruments; BeatBax authoring shorthand only | No FTM equivalent; notes come from pattern data |
| `sweep_en=true` | (not used in current songs) | FTM effect `Hxy` in pattern column: x = period (1–7), y = shift (1–7); negative direction uses bit-set | See sweep encoding below |
| `sweep_period=N` | (not used in current songs) | Part of `Hxy` effect encoding | See sweep encoding below |
| `sweep_dir=up\|down` | (not used in current songs) | FTM `Hxy`: sweep_dir=down sets the negate bit, producing `H(period)(shift\|8)` | FTM uses combined nibble encoding |
| `sweep_shift=N` | (not used in current songs) | Lower nibble of `Hxy` effect value | Combined with direction |

**Hardware sweep encoding:** FamiTracker encodes sweep as effect `Hxy` where `x` = period (1–7) and `y` = shift (0–7, or `y|8` for downward sweep). This must be written into every pattern row where the sweep-enabled instrument fires a note. Since BeatBax `sweep_*` fields are per-instrument, the exporter must inject `Hxy` into each corresponding note row in the pattern data.

---

### Triangle Fields

| BeatBax field | Example usage | FTM mapping | Notes |
|---|---|---|---|
| `linear=N` | `linear=96` | **No direct FTM instrument field.** FamiTracker gates the triangle via the `S` (note cut) effect or via the linear counter default (127 = sustain). Approximate by injecting a `SNN` cut effect at the note row offset corresponding to `N / 240` seconds. | `linear=96` → gate after 96/240 Hz ≈ 400 ms → calculate row offset from BPM |
| `vol=0` | (mute) | FTM: note cut / instrument with empty volume sequence | `vol=0` silences; any other value is full amplitude (triangle has no HW volume) |
| `arp_env=[0,s1,...\|N]` | `arp_env=[0,4,7\|0]` | MACRO ARPEGGIO sequence with loop; produces rapid chord shimmer | Direct 1:1 mapping. Works on triangle in FamiTracker. Loop point `\|0` creates continuous cycling through root/+4/+7 (C-major triad at 60Hz). |
| `vol_env=[...]` | — | MACRO VOLUME sequence is **written** but has no audible effect on triangle (hardware has no volume register) | FamiTracker ignores the volume macro for the triangle channel. No warning needed; the macro is silently ineffective. |
| `pitch_env=[s0,s1,...\|N]` | — | MACRO PITCH sequence; same semitone × 16 conversion as pulse | Works on triangle in FamiTracker. |

**Linear counter note:** FamiTracker treats the triangle linear counter as always-sustain (value 127) for NTSC tracks. The gated-pluck articulation that `linear=N` creates in BeatBax must be approximated per-note in the pattern using the `Sxx` note-cut effect. The exporter should compute `ticks_after_note_start = round(linear_value / 240 * ticks_per_second)` and insert `Sxx` at that tick offset relative to the note row.

---

### Noise Fields

| BeatBax field | Example usage | FTM mapping | Notes |
|---|---|---|---|
| `noise_mode=normal\|loop` | `noise_mode=normal` | Encoded in the pattern note value: FTM noise notes are `0x00`–`0x0F` for normal, `0x10`–`0x1F` for loop mode. The period index is the low nibble. | `noise_mode=loop` → set bit 4 of the note byte |
| `noise_period=N` | `noise_period=12` | Low nibble of the FTM noise note byte (0–15). In text format: FTM noise notes are expressed as `C-0` through `D-1` where the note index encodes period. Period N maps to note `N % 12` in octave `N / 12`. | See noise note encoding table below |
| `env=level,flat\|down` | `env=15,down` | Same as pulse: MACRO VOLUME sequence | Identical encoding |
| `env_period=N` | `env_period=2` | Same as pulse: step length multiplier in generated decay sequence | Identical encoding |
| `vol=N` | (not used in noise in songs) | MACRO VOLUME: `[N]` with loop at 0 | Identical to pulse |
| `vol_env=[...]` | `vol_env=[10,4]` | MACRO VOLUME sequence; direct 1:1 | Identical to pulse |
| `note=X` | `note=C5` | Not in FTM instrument; used as BeatBax pattern token trigger. In FTM, noise note value is determined entirely by `noise_period` + `noise_mode`. | The exporter must override the pattern note with the period-derived noise note, ignoring `note=` for FTM output |

**Noise note encoding in FamiTracker text format:**
FamiTracker text export represents noise notes using a lookup table where period index 0–15 maps to octave/note pairs. Period 0 (highest frequency) = `C-0`, period 15 (lowest) = `D-1`. The loop bit adds 16 to the raw note index. The exporter must always derive the noise pattern note from `noise_period` and `noise_mode`, not from the BeatBax `note=` field.

| `noise_period` | FTM text note (normal mode) | FTM text note (loop mode) |
|---|---|---|
| 0 | `C-0` | `C-1` |
| 1 | `C#0` | `C#1` |
| 2 | `D-0` | `D-1` |
| 3 | `D#0` | `D#1` |
| 4 | `E-0` | `E-1` |
| 5 | `F-0` | `F-1` |
| 6 | `F#0` | `F#1` |
| 7 | `G-0` | `G-1` |
| 8 | `G#0` | `G#1` |
| 9 | `A-0` | `A-1` |
| 10 | `A#0` | `A#1` |
| 11 | `B-0` | `B-1` |
| 12 | `C-1` | `C-2` |
| 13 | `C#1` | `C#2` |
| 14 | `D-1` | `D-2` |
| 15 | `D#1` | `D#2` |

---

### DMC Fields

| BeatBax field | Example usage | FTM mapping | Notes |
|---|---|---|---|
| `dmc_sample="@nes/name"` | `dmc_sample="@nes/kick"` | FTM DPCM SAMPLES block: embed the raw DMC bytes from the bundled sample. Assign a DPCM index (0–63). In INST2A03, reference the sample index with pitch, loop, and delta fields. | Bundled samples are loaded from `@beatbax/plugin-chip-nes` at export time |
| `dmc_sample="local:path"` | `dmc_sample="local:songs/nes/ik_bassdrum.dmc"` | Same as bundled: read the `.dmc` file bytes and embed in DPCM block | The exporter must resolve the path relative to the song file |
| `dmc_sample="https://..."` | (commented-out in songs) | ⚠️ **Cannot fetch at export time in browser context.** CLI export can use Node.js `fetch`. Mark as a known limitation; skip or warn. | Async resolution required |
| `dmc_rate=N` | `dmc_rate=15` | FTM DPCM entry pitch field: maps rate index (0–15) to FTM pitch encoding (same 0–15 index; FTM stores it directly) | Direct 1:1 |
| `dmc_loop=true\|false` | `dmc_loop=false` | FTM DPCM entry loop flag (bit in the DPCM instrument data) | Direct mapping |
| `dmc_level=N` | (not used in songs) | FTM DPCM delta counter setting (0–127, stored per note-on in the instrument delta field) | Write to FTM instrument delta field if present |

**DPCM sample embedding:** Each unique `dmc_sample` reference produces one entry in the FTM `DPCM SAMPLES` block. In text format, the block is:
```
DPCM  <index>  <size>  : <hex bytes...>
```
In binary format, each sample has a 2-byte length prefix followed by raw DMC bytes.

---

### Instrument-Level Macro Channel Compatibility

The four instrument-level macro fields (`vol_env`, `arp_env`, `pitch_env`, `duty_env`) demonstrated in `songs/features/nes/nes_macro_*.bax` map to FamiTracker's five `MACRO` sequence types. Their behaviour differs per channel:

| BeatBax field | FTM macro type (index) | Pulse 1 | Pulse 2 | Triangle | Noise | DMC |
|---|---|---|---|---|---|---|
| `vol_env` / `env` / `vol` | VOLUME (0) | ✅ direct | ✅ direct | ⚠️ written but silent (no HW volume register) | ✅ direct | n/a (DPCM has no macro) |
| `arp_env` | ARPEGGIO (1) | ✅ direct | ✅ direct | ✅ direct — confirmed by demo (rapid triad shimmer) | ⚠️ shifts LFSR period register; non-musical; warn and write anyway | n/a |
| `pitch_env` | PITCH (2) | ✅ semitones × 16 | ✅ semitones × 16 | ✅ semitones × 16 | ⚠️ pitch register is fixed by `noise_period`; pitch macro is ignored in FTM; warn and skip | n/a |
| `duty_env` | HIPITCH / DUTY (4) | ✅ values 0–3 (duty index) | ✅ values 0–3 (duty index) | ⚠️ triangle has no duty register; skip with warning | ⚠️ type 4 on noise instruments repurposed as noise-mode flag (0 = normal, 1 = random); behaviour is non-standard — write with warning | n/a |

**Key implementation notes from the demo:**

- **`pitch_env` unit conversion is mandatory.** BeatBax stores offsets in semitones; FamiTracker PITCH macro uses units of 1/16 semitone. Always multiply every value by 16 before writing the FTM sequence. `pitch_env=[5,4,3,2,1,0,0,0]` → FTM `[80,64,48,32,16,0,0,0]`.
- **`arp_env` loop point creates auto-cycling.** `arp_env=[0,4,7|0]` with loop at 0 produces a continuous C-major triad shimmer at 60 Hz on any held note. The loop point must be preserved exactly in the FTM MACRO ARPEGGIO output.
- **`duty_env` loop point creates wah cycles.** `duty_env=[2,2,...,0,0,...|0]` with loop at 0 creates a periodic 50%↔12.5% wah at a rate determined by the sequence length (16 frames per half-cycle = ~3.75 wah cycles/sec at 60 Hz). The loop point is essential and must be written.
- **`vol_env` on noise (kick/percussion):** `vol_env=[15,12,8,4,2,1]` with no loop point → one-shot shaped decay. The absence of a loop point means the macro runs to completion and then holds the last value. FamiTracker handles this identically — loop = -1 in the MACRO output.

---

### Per-Note Effect Fields

These are applied as pattern-level effects in BeatBax (via `<effect>` syntax or effect presets) and must be encoded into the FTM pattern effect columns. The full set of BeatBax per-note effects (from `songs/effects/`) and their NES/FTM export behaviour is:

| BeatBax effect | Syntax | NES chip | FTM export | Notes |
|---|---|---|---|---|
| `vib` | `vib:depth,rate[,waveform[,duration[,delay]]]` | ✅ all melodic channels | ✅ approximated — `4xy` | Delay approximated by inserting blank rows before onset. Waveform shape is a global FTM setting, not per-note. Only two nibbles of precision. |
| `arp` | `arp:semi1,semi2[,semi3,...]` | ✅ all melodic channels | ✅ `0xy` | x = first offset (high nibble), y = second offset (low nibble); values clamped 0–15. **3+ offset arpeggios:** FTM `0xy` only supports two offsets (3-note cycle: root, +x, +y). Third and further offsets are dropped with a warning. |
| `bend` | `bend:semitones[,curve[,start[,time]]]` | ✅ pulse / triangle | ✅ approximated — `1xx`/`2xx` | FTM slides are linear only. Curves `exp`, `log`, `sine` are approximated. Start delay is approximated by delaying the slide row. `bend` is ignored on noise and DMC. |
| `cut` | `cut:ticks` | ✅ all channels | ✅ direct — `Sxx` | `cut:3` → `S03`. Applies to all channels including noise and DMC. |
| `port` | `port:speed` | ✅ pulse / wave / triangle | ✅ `3xx` | Portamento speed mapped directly. First note in a run has no previous pitch; the effect row is emitted but produces no glide on that note. Not meaningful on noise or DMC. |
| `sweep` | `sweep:time,dir,shift` | ✅ Pulse 1 only (hardware) | ✅ `Hxy` per note row | x = period (1–7), y = shift (0–7), downward sweep sets bit 3 of y. Must be injected on every note row for the instrument; pulse 2 / other channels: effect dropped with a warning. |
| `volSlide` | `volSlide:delta[,steps]` | ✅ pulse / noise (partial — see channel constraints) | ✅ `Axy` | Positive delta → `Ax0` (slide up), negative → `A0y` (slide down). Delta nibble clamped 0–15. **`steps` parameter:** FTM slides every frame; a `steps` value creates discrete jumps, which cannot be replicated in FTM — approximated as continuous slide, warning emitted. |
| `trem` | `trem:depth,rate[,waveform[,duration[,delay]]]` | ⚠️ pulse / noise only (no HW volume on triangle) | ❌ not supported | FamiTracker has no cyclic volume LFO effect. Closest approximation would be a custom `vol_env` macro sequence, but that is instrument-level not per-note. **Effect is dropped with a warning.** |
| `echo` | `echo:delay,feedback,mix` | ❌ software only | ❌ not supported | FamiTracker has no delay/echo effect. **Effect is dropped with a warning.** |
| `retrig` | `retrig:interval[,volumeDelta]` | ✅ software (any channel) | ❌ not supported | FamiTracker has no general retrigger effect (`Gxx` is note delay, not retrigger). **Effect is dropped with a warning.** |

**Duty cycle modulation** (instrument switching within patterns): handled via separate FTM instruments. Each BeatBax `inst` definition with a different `duty` value becomes a distinct `INST2A03` entry with the appropriate duty field. Inline `inst <name>` tokens in patterns cause an instrument change on that row — expressed in FTM as the instrument column changing to the new index. No effect column is needed.

**Effect column count:** FamiTracker supports 1–4 effect columns per channel. The exporter should scan all events in a pattern and use as many effect columns as needed (up to 4). If more than 4 supported effects appear on one row, they must be prioritised (see Effect Priority below). Unsupported effects (`trem`, `echo`, `retrig`) are always dropped before the priority check.

---

### Channel-Specific Effect Constraints (NES)

The NES 2A03 has hardware differences from the Game Boy that restrict which effects make sense on each channel:

| Channel | Supported effects | Dropped with warning |
|---|---|---|
| Pulse 1 | `vib`, `arp`, `bend`, `cut`, `port`, `sweep`, `volSlide` | `trem`, `echo`, `retrig` |
| Pulse 2 | `vib`, `arp`, `bend`, `cut`, `port`, `volSlide` | `sweep` (Pulse 2 has no HW sweep), `trem`, `echo`, `retrig` |
| Triangle | `vib`, `arp`, `bend`, `cut`, `port` | `volSlide` (no HW volume register), `trem` (no HW volume), `sweep`, `echo`, `retrig` |
| Noise | `cut`, `volSlide` | `vib` (no pitch register), `arp` (no pitch), `bend` (no pitch), `port` (no pitch), `sweep`, `trem`, `echo`, `retrig` |
| DMC | `cut` | all others — DMC is a sample playback channel with no realtime modulation |

---

## File Format Overview

### FamiTracker Binary (`.ftm`) — `id: 'famitracker'`

The `.ftm` format is a chunked binary format used by FamiTracker v0.4.6.

```
[Header]        "FamiTracker Module\0" magic (20 bytes) + version uint32 (little-endian)
[PARAMS block]  expansion chip flags, channels, speed, tempo, pattern length
[INFO block]    title, author, copyright strings (32 bytes each, null-padded)
[HEADER block]  channel ID table (one uint8 per channel)
[INSTRUMENTS]   per instrument: type byte + sequence indices + optional DPCM table
[SEQUENCES]     volume / arp / pitch / hipitch / duty sequences with loop/release points
[FRAMES]        frame count + per-frame pattern index table (one index per channel per frame)
[PATTERNS]      per channel per pattern: row count + per-row data (note, octave, inst, vol, effects)
[DPCM SAMPLES]  optional: per-sample size + raw DMC bytes
[END]           "END\0" (4 bytes)
```

Each block is structured as:
```
char[3]  block_id (e.g. "PAR", "INF", "HDR", "INS", "SEQ", "FRM", "PAT", "DSP", "END")
uint32   block_version
uint32   block_size
<block_data>
```

### FamiTracker Text (`.txt`) — `id: 'famitracker-text'`

Human-readable format produced by FamiTracker's `File → Export text...`. Importable by FamiStudio.

Full format specification: https://famitracker.org/wiki/index.php?title=Text_export

```
# FamiTracker text export 0.4.2
TITLE    "Song Title"
AUTHOR   ""
COPYRIGHT ""
COMMENT  ""
MACHINE  0                          ; 0 = NTSC
FRAMERATE 0                         ; 0 = default
EXPANSION 0                         ; 0 = no expansion (2A03 only)
VIBRATO  1                          ; 1 = new vibrato style
SPLIT    32

MACRO VOLUME   <idx> <loop> <release> <setting> : <v0> <v1> ...
MACRO ARPEGGIO <idx> <loop> <release> <setting> : <s0> <s1> ...
MACRO PITCH    <idx> <loop> <release> <setting> : <p0> <p1> ...
MACRO HIPITCH  <idx> <loop> <release> <setting> : <h0> <h1> ...
MACRO DUTYSEQ  <idx> <loop> <release> <setting> : <d0> <d1> ...

INST2A03 <idx> <vol_seq> <arp_seq> <pitch_seq> <hipitch_seq> <duty_seq> "Name"
  ; -1 in a field means "no sequence assigned for this macro type"

DPCM <idx> <size> : <hex bytes...>
INSDPCM <inst_idx> <note_idx> <sample_idx> <pitch> <loop> <delta>

TRACK  <rows> <speed> <tempo> "Title"
COLUMNS : <n_effects_ch0> <n_effects_ch1> ...
ORDER  : <frame_idx> : <pat_ch0> <pat_ch1> <pat_ch2> <pat_ch3> <pat_ch4>

PATTERN <idx>
ROW <row_hex> : <note> <inst_hex> <vol_hex> <eff1> : ...
  ; note format: "C-4", "C#4", "---" (rest), "..." (empty), "===\" (note off)
  ; inst: 00–3F (hex), .. = no change
  ; vol: 0–F (hex), . = no change
  ; effect: "..." = none, "0xy" = arp, "1xx" = slide up, "4xy" = vib, "Sxx" = cut, etc.
```

---

## ISM → FTM Conversion Rules

### Tempo / Speed

FamiTracker separates tempo (BPM) into `speed` (ticks-per-row) and `tempo` (rows-per-beat calculation). The relationship is:

```
BPM = (tempo × 6) / speed
```

Standard FamiTracker default: `speed=6, tempo=150` → 150 BPM.

For a BeatBax song with `bpm=B` and `ticksPerStep=T`:
- One BeatBax tick = one FTM row.
- `speed = 1` (one clock tick per row).
- `tempo = round(B × speed / 6)` → `tempo = round(B / 6)`.
- If `tempo` falls outside the range 32–255, warn and clamp.

### Pattern Length and Frames

- Each BeatBax pattern becomes one FTM frame (one entry in the ORDER table).
- All patterns within a channel sequence share the same pattern index pool.
- FTM requires all frames to have the same row count (set in `TRACK` header). Use the longest pattern length across all channels. Shorter patterns are padded with empty rows.
- Maximum FTM pattern rows per frame: 256. BeatBax patterns exceeding 256 rows must be split.

### Note Encoding

| Channel | BeatBax note | FTM encoding |
|---|---|---|
| Pulse 1 / Pulse 2 / Triangle | `C3`–`B8` | Note name + octave (e.g. `C-4`); use standard MIDI note → FTM lookup |
| Noise | Any note / `note=` field | Overridden: derived from `noise_period` and `noise_mode` per the noise note table above |
| DMC | Any note (trigger only) | FTM note byte = 0 (trigger); pitch and loop come from DPCM instrument entry |

BeatBax uses `C3` = MIDI note 48. FamiTracker uses `C-1` = MIDI note 12 (two octaves higher). Conversion: `ftm_octave = beatbax_octave - 2`.

### Macro Deduplication

Multiple BeatBax instruments may share the same macro values. The exporter should hash each unique sequence and assign a single FTM macro index, reducing file size and matching FamiTracker's own behaviour.

### Effect Priority (when >4 per row)

If a row has more *supported* effects than effect columns (max 4), prioritise in this order:
1. `0xy` arpeggio
2. `Sxx` note cut
3. `Axy` volume slide
4. `1xx`/`2xx` slide / `3xx` portamento
5. `4xy` vibrato
6. `Hxy` sweep (Pulse 1 only)

Unsupported effects (`trem`, `echo`, `retrig`) are dropped before this priority check and always emit a warning.

---

## Implementation Plan

### File layout

```
packages/plugins/export-famitracker/src/
  ftm-types.ts         # Shared type definitions (new)
  ftm-macros.ts        # Macro building and deduplication (new)
  ftm-patterns.ts      # ISM event → FTM row conversion, effect encoding (new)
  ftm-text-writer.ts   # Text .txt writer using above modules (new)
  ftm-writer.ts        # Binary .ftm block writer using above modules (new)
  index.ts             # Replace placeholderHeader() calls with real writers
```

### `ftm-types.ts`
Types: `FtmMacro`, `FtmInstrument2A03`, `FtmInstrumentDPCM`, `FtmDpcmSample`, `FtmRow`, `FtmPattern`, `FtmFrame`, `FtmTrack`.

### `ftm-macros.ts`
- `buildVolumeMacro(inst)` — generates macro from `vol_env`, `vol`, `env`, or `env_period`
- `buildArpMacro(inst)` — from `arp_env`
- `buildPitchMacro(inst)` — from `pitch_env` (multiply by 16 for FTM pitch units)
- `buildDutyMacro(inst)` — from `duty_env` or constant `duty`
- `deduplicateMacros(macros[])` — hash sequences; reuse indices for identical sequences

### `ftm-patterns.ts`
- `encodeNote(note, channel, inst)` — returns FTM note string; noise channel uses `noise_period`/`noise_mode`
- `encodeEffects(event)` — maps BeatBax effect tokens to FTM effect strings:
  - Supported: `vib`→`4xy`, `arp`→`0xy` (first 2 offsets; warn on 3+), `bend`→`1xx`/`2xx`, `cut`→`Sxx`, `port`→`3xx`, `sweep`→`Hxy` (pulse1 only), `volSlide`→`Axy`
  - Dropped with warning: `trem`, `echo`, `retrig`
  - Channel-filtered: pitch effects dropped on noise/DMC; `volSlide` dropped on triangle
- `buildPattern(events[], frameLength)` — builds a 2D array of `FtmRow` with padding to `frameLength`
- `lineariseBend(semitones, curve, delay_rows, duration_rows)` — approximates non-linear bend as linear `1xx`/`2xx` with optional row delay

### `ftm-text-writer.ts`
- `writeFtmText(song): string`
- Writes all sections in order using above modules
- Noise instruments use fixed DPCM note override per instrument
- Triangle `linear=N` emitted as `Sxx` cut effect per note row

### `ftm-writer.ts`
- `writeFtmBinary(song): Uint8Array`
- `DataView`-based binary writer
- All little-endian uint32 values
- Delegates instrument/macro/pattern data building to shared modules

### `index.ts` changes
- Remove `placeholderHeader()` and `toUint8Array()` helpers
- Replace `export()` body in both plugins with the respective writer calls

---

## Known Limitations and Export Constraints

| Feature | BeatBax capability | FTM export behaviour |
|---|---|---|
| Vibrato delay | `vib:depth,rate,waveform,duration,delay` delay param | Not supported in FTM `4xy`. Delay approximated by inserting blank `4xy` rows before onset. |
| Vibrato waveform | Sine / triangle / square / saw selectable per-note | FTM vibrato waveform is global (VIBRATO setting), not per-note. Exported as global sine. |
| Arpeggio 3+ offsets | `arp:3,7,11` (4-note chord) | FTM `0xy` cycles through root + 2 offsets only. Third and further offsets dropped with warning. |
| Exponential / non-linear bend | `bend:x,exp,...` / `bend:x,log,...` / `bend:x,sine,...` | FTM slides are linear only. Exported as nearest linear `1xx`/`2xx` approximation. |
| Bend start delay | `bend:x,linear,0.5,...` | FTM has no built-in start delay for slides. Approximated by delaying the effect row. |
| Tremolo | `trem:depth,rate,...` | No FTM equivalent effect column. Dropped with warning on all channels. |
| Echo / delay | `echo:delay,feedback,mix` | No FTM equivalent. Dropped with warning. |
| Retrigger | `retrig:interval[,volumeDelta]` | No FTM equivalent (`Gxx` is note delay, not retrigger). Dropped with warning. |
| Volume slide steps | `volSlide:delta,steps` | FTM `Axy` slides every frame; `steps` discretisation cannot be replicated. Exported as continuous slide with warning. |
| `volSlide` on triangle | Triangle channel | Triangle has no hardware volume register; volume slide is silently ignored. |
| Pitch effects on noise | `vib`, `arp`, `bend`, `port` on noise channel | Noise frequency is set by `noise_period` register; pitch modulation effects are dropped with warning. |
| All effects on DMC | Any effect except `cut` on DMC channel | DMC is a sample playback channel; all effects other than note cut are dropped. |
| Inline sweep on non-Pulse-1 | `sweep:...` on pulse2 / wave / triangle / noise / DMC | Sweep is hardware Pulse 1 only; dropped with warning on all other channels. |
| `https://` DMC samples | Remote sample URLs | Cannot fetch in browser export context. CLI export uses Node.js `fetch`. Browser export warns and skips. |
| Triangle `linear=N` | Per-instrument linear counter | Approximated per-note as `Sxx` cut effect. Not round-trippable. |
| `note=` on noise/DMC | Pattern token shorthand | Ignored for FTM noise note encoding (always derived from `noise_period`). |
| Patterns > 256 rows | Any BeatBax pattern length | Patterns exceeding 256 rows are split into multiple FTM frames. |
| Effect > 4 per row | Arbitrary effect stacking | Excess supported effects dropped per priority order; a warning is emitted. |
| `dmc_level` | Initial DAC level per instrument | Written to FTM DPCM instrument delta field (0–127, or -1 for hardware default). |

---

## Testing Strategy

### Unit Tests

- `ftm-macros.test.ts`:
  - `vol_env=[1,2,3,4,5,6,7,8,9,10|9]` → correct MACRO VOLUME with loop=9
  - `vol_env=[15,12,8,4,2,1]` (no loop) → MACRO VOLUME loop=-1 (one-shot decay)
  - `env=15,down` + `env_period=2` → decay sequence with 3 frames per level
  - `env=12,flat` → single-entry macro with loop=0
  - `arp_env=[0,4,7|0]` → MACRO ARPEGGIO loop=0 with values `[0,4,7]` (direct, no ×16)
  - `pitch_env=[5,4,3,2,1,0,0,0]` → MACRO PITCH values `[80,64,48,32,16,0,0,0]` (×16), loop=-1
  - `duty_env=[2,2,2,2,2,2,2,2,0,0,0,0,0,0,0,0|0]` → MACRO DUTY values with loop=0
  - `arp_env` on triangle channel → MACRO ARPEGGIO written (valid)
  - `vol_env` on triangle channel → MACRO VOLUME written with comment/warning that it is silent on triangle
  - `pitch_env` on noise channel → macro skipped, warning emitted
  - `duty_env` on triangle channel → macro skipped, warning emitted
  - Macro deduplication: two instruments with identical `vol_env` share one macro index
- `ftm-patterns.test.ts`:
  - Noise note encoding: `noise_period=12, noise_mode=normal` → `C-1`
  - Noise note encoding: `noise_period=2, noise_mode=loop` → `D-1` (loop bit)
  - `arp:3,7` effect → `037` in effect column
  - `arp:3,7,11` (3 offsets) → `037` with warning about dropped third offset
  - `cut:3` effect → `S03` in effect column
  - `volSlide:+5` effect → `A50` in effect column
  - `volSlide:-3` effect → `A03` in effect column
  - `volSlide:+5,4` (stepped) → `A50` with warning about steps parameter
  - `bend:7,exp,0.25,0.094` → nearest linear `1xx` speed
  - `bend:7,linear,0.5,...` → `1xx` delayed by half the note duration
  - `vib:4,5,sine,0,4` → `4xy` at row 4 with zeros before
  - `trem:6,4,sine,0,1` → warning, effect dropped, no `Axy` emitted
  - `echo:0.25,40,25` → warning, effect dropped
  - `retrig:2,-3` → warning, effect dropped
  - `sweep:4,down,7` on pulse1 → `H4F` (direction nibble with negate bit)
  - `sweep:4,down,7` on pulse2 → warning, effect dropped
  - `vib:3,6` on noise channel → warning, effect dropped
  - `volSlide:-2` on triangle channel → warning, effect dropped
  - Triangle `linear=96` at 90 BPM → `Sxx` cut at correct row offset
  - BeatBax note `C5` → FTM note `C-3` (octave - 2)
- `ftm-text-writer.test.ts`:
  - Minimal ISM → valid TITLE, INST2A03, ROW tokens present
  - NES chip required; non-NES throws / validate() returns error
  - `iron_keep.bax` export: all 5 channels present, DPCM block present
- `ftm-writer.test.ts`:
  - Binary output starts with `FamiTracker Module\0` magic
  - PARAMS, INFO, PATTERNS blocks present at correct offsets
  - All multi-byte values are little-endian

### Integration Tests

- Export `iron_keep.bax` to text; verify all instrument names, DPCM entries, and channel 5 (DMC) rows present
- Export `shadow_temple.bax` to text; verify `vol_env` loop points appear in MACRO VOLUME
- Export `wily_fortress.bax` to text; verify `arp:3,7` → `037` in effect columns, `bend:7,exp,...` → `1xx`, `cut:3` → `S03`
- Reference test: export `kingdom_hall.bax` to text and compare against a manually verified golden file
- `nes_macro_*.bax` (macro coverage test):
  - Ch1 (`i_pitch`): MACRO PITCH present with values `[80,64,48,32,16,0,0,0]` (pitch_env × 16), no loop
  - Ch2 (`i_duty`): MACRO DUTY present with 16 values, loop=0 (cycling wah)
  - Ch3 (`i_arp`): MACRO ARPEGGIO present with `[0,4,7]`, loop=0 (continuous triad shimmer); written on triangle instrument
  - Ch4 (`i_kick`): MACRO VOLUME `[15,12,8,4,2,1]`, loop=-1 (one-shot decay); written on noise instrument
- Small focused fixtures in `songs/features/famitracker/`:
  - `nes_macro_vol_env_loop.bax` (looping `vol_env`)
  - `nes_macro_pitch_env.bax` (`pitch_env` semitone-to-FTM conversion coverage)
  - `nes_macro_arp_triangle.bax` (`arp_env` on triangle)
  - `nes_macro_duty_env.bax` (`duty_env` loop behaviour)
  - `nes_macro_noise_vol_env_oneshot.bax` (noise one-shot `vol_env` without loop)
- Effects songs (from `songs/effects/`):
  - `arpeggio.bax` (chip gameboy, but run through NES chip for coverage): `arpMajor7` (3 offsets) → warning + truncated to `047`
  - `notecut.bax` → all `cut:N` tokens produce `Sxx` with correct values
  - `portamento.bax` → `port:8` → `308` in effect column
  - `pitchbend.bax` → all 4 curve types produce `1xx`/`2xx` approximations; non-zero delay variants produce delayed rows
  - `vibrato.bax` → `vib:4,6,sine,0,1` delay=1 → blank row before `4xy`
  - `volume_slide.bax` → `volSlide:+12` → `AC0`; `volSlide:-3` → `A03`; stepped variant warns
  - `sweep.bax` → instrument-level `sweep=4,down,7` emits `H4F` on each note row for pulse1; inline `sweep:4,down,7` on non-pulse1 warns
  - `tremolo.bax` → all `trem:...` effects warned and dropped, no Axy in output
  - `echo.bax` → all `echo:...` effects warned and dropped
  - `retrigger.bax` → all `retrig:...` effects warned and dropped
  - `duty_cycle_modulation.bax` → instrument changes within patterns reflected in FTM instrument column changes

---

## Migration Path

The `export()` functions are internal to the plugin. The `ExporterPlugin` interface contract is unchanged. No consumer migration needed.

---

## Implementation Checklist

- [ ] Add `ftm-types.ts`
- [ ] Implement `ftm-macros.ts` with all five macro builders + deduplication
- [ ] Implement `ftm-patterns.ts` with note encoder, effect encoder, pattern builder
- [ ] Implement `writeFtmText()` in `ftm-text-writer.ts`
- [ ] Implement `writeFtmBinary()` in `ftm-writer.ts`
- [ ] Update `index.ts`: remove `placeholderHeader()`, wire real writers
- [ ] Unit tests: macros (including pitch_env ×16, arp_env on triangle, vol_env no-loop)
- [ ] Unit tests: patterns, note encoding, all supported effects + dropped effects with warning
- [ ] Integration tests: all four NES example songs `songs/features/nes/*.bax`
- [ ] Golden-file test for `kingdom_hall.bax`
- [ ] Update `packages/plugins/export-famitracker/README.md`
- [ ] Document known limitations in the README
- [ ] Publish new minor version of `@beatbax/plugin-exporter-famitracker`

---

## Future Enhancements

- FamiStudio `.fms` export (separate exporter plugin `@beatbax/plugin-exporter-famistudio`) — FamiStudio supports slide notes and delayed vibrato natively, so many of the approximations above would become exact mappings
- NSF export for direct NES hardware / emulator playback
- Support for VRC6 / MMC5 expansion chip channels once BeatBax NES chip supports them
- Round-trip import: parse FamiTracker text format back to BeatBax `.bax`

---

## Open Questions

- Should the binary writer target FamiTracker v0.4.6 (last stable) or the community fork (0.5.0-beta)?
- For `bend:semitones,exp,...` — should the exporter snap to the nearest linear speed, or insert a sequence of `1xx` effects with varying speeds per row to approximate the curve?
- FTM limits: max 64 instruments, 128 patterns per channel, 256 rows per pattern. How should the exporter handle songs that exceed these limits — truncate with a warning, or refuse to export?
- `noise_period` on noise instrument defines the FTM note for that instrument. What if an instrument's `noise_period` is changed mid-pattern via `inst(name,N)` temporary override?

---

## References

- [FTM binary format wiki](https://famitracker.org/wiki/index.php?title=FTM_format)
- [FamiTracker text export wiki](https://famitracker.org/wiki/index.php?title=Text_export)
- `packages/plugins/export-famitracker/src/index.ts` — current stub implementation
- `packages/plugins/chip-nes/README.md` — complete NES instrument field reference
- `packages/plugins/chip-nes/src/` — NES channel backends
- `songs/nes/` — four NES example songs covering all field combinations used in practice
- `songs/features/nes/*.bax` — definitive source for instrument-level macro behaviour (`pitch_env`, `duty_env`, `arp_env` on triangle, `vol_env` on noise)
- `songs/effects/` — eleven effect demo songs covering all per-note effect types and their export constraints
- `docs/features/exporter_plugin_system.md` — parent feature (complete)


## Problem Statement

The `famitrackerBinaryExporterPlugin` and `famitrackerTextExporterPlugin` in `packages/plugins/export-famitracker/src/index.ts` call `placeholderHeader()` and return a comment-only byte stream. Neither produces output that FamiTracker v0.4.6 or FamiStudio can open. This blocks:

1. Round-trip testing: NES songs authored in BeatBax cannot be opened in FamiTracker for verification.
2. NES chip validation: There is no way to hear the BeatBax NES channel model through reference hardware or FamiTracker's playback engine.
3. Community workflows: Users who author in BeatBax and master in FamiTracker have no usable export path.

## Proposed Solution

### FamiTracker Binary (`.ftm`) — `id: 'famitracker'`

The `.ftm` format is a chunked binary format used by FamiTracker v0.4.6. Reference: https://famitracker.org/wiki/index.php?title=FTM_format

**File structure:**
```
[Header]        "FamiTracker Module" magic (18 bytes) + version uint32
[PARAMS block]  expansion chip flags, channels, speed/tempo, ...
[INFO block]    title, author, copyright strings (32 bytes each)
[HEADER block]  channel order table
[INSTRUMENTS]   instrument type + envelope/duty data per instrument
[SEQUENCES]     volume / arp / pitch / hi-pitch / duty sequences
[FRAMES]        pattern order per frame, per channel
[PATTERNS]      64-row pattern data (note, octave, instrument, volume, effect)
[DPCM SAMPLES]  optional raw DMC sample data
[END]           magic end marker
```

**ISM mapping:**
| BeatBax ISM field | FTM field |
|---|---|
| `song.metadata.name` | INFO title |
| `song.bpm` | PARAMS tempo |
| `channel.events[].note` | Pattern row note + octave |
| `channel.events[].instrument` | Pattern row instrument index |
| `inst.duty` | Instrument duty sequence |
| `inst.env` / `inst.env_period` | Volume sequence |
| `inst.arp` | Arp sequence |
| `inst.dmc_sample` | DPCM sample block |

**Channel mapping (NES only):**
| BeatBax channel index | FTM channel |
|---|---|
| 0 | 2A03 Pulse 1 |
| 1 | 2A03 Pulse 2 |
| 2 | 2A03 Triangle |
| 3 | 2A03 Noise |
| 4 | 2A03 DPCM |

### FamiTracker Text (`.txt`) — `id: 'famitracker-text'`

The text format is produced by FamiTracker's `File → Export text...` menu. It is human-readable and importable by FamiStudio. Reference: https://famitracker.org/wiki/index.php?title=Text_export

**File structure:**
```
# FamiTracker text export 0.4.2
# ... header comments ...

TITLE           "Song Title"
AUTHOR          ""
COPYRIGHT       ""

COMMENT ""

MACHINE         0
FRAMERATE       0
EXPANSION       0
VIBRATO         1
SPLIT           32

# Macro definitions
MACRO VOLUME   0 : ...
MACRO ARPEGGIO 0 : ...
...

# Instrument definitions
INST2A03  0  0 -1 -1 -1 -1  "Instrument name"
...

# Track definitions
TRACK 64 6 150 "Track 0"
COLUMNS : 1 1 1 1 1
ORDER : 00 : 00 00 00 00 00
...

# Pattern data
PATTERN 00
ROW 00 : C-4 00 .. . ... : ...
...
```

**ISM mapping:** Same as binary above; values are written as text tokens per the FamiTracker text spec.

### Implementation Plan

#### File layout changes

```
packages/plugins/export-famitracker/src/
  ftm-writer.ts       # Binary .ftm block writer (new)
  ftm-text-writer.ts  # Text .txt writer (new)
  ftm-types.ts        # Shared type definitions (new)
  index.ts            # Replace placeholderHeader() calls with real writers
```

#### `ftm-types.ts`
Shared types: `FtmInstrument`, `FtmSequence`, `FtmPattern`, `FtmRow`, `FtmFrame`, `FtmChannel`.

#### `ftm-writer.ts`
- `writeFtmBinary(song: ExportableSong): Uint8Array`
- Uses a `DataView`-based binary writer
- Writes each block with 4-byte block ID, 4-byte version, 4-byte size pattern
- Maps ISM channels → FTM channels (assert chip === 'nes')
- Converts BeatBax note names → FTM note + octave values
- Converts `inst.env` → volume sequence entries
- Converts `inst.duty` → duty sequence entries
- Converts `inst.arp` → arp sequence entries
- Pads patterns to 64 rows (fill unused rows with `---` / rest)

#### `ftm-text-writer.ts`
- `writeFtmText(song: ExportableSong): string`
- Produces the canonical FamiTracker text export format
- Reuses sequence and pattern conversion logic from `ftm-types.ts`

#### `index.ts` changes
- Remove `placeholderHeader()` function
- Replace `export()` body in `famitrackerBinaryExporterPlugin` with `toUint8Array(writeFtmText(song))` → binary block writer (or keep text until binary is validated)
- Replace `export()` body in `famitrackerTextExporterPlugin` with `writeFtmText(song)`

### AST Changes

None required. The existing ISM `ExportableSong` type is sufficient.

### Parser Changes

None required.

### CLI Changes

None required. The CLI already routes `export famitracker` and `export famitracker-text` through the registry.

### Web UI Changes

None required. The toolbar already shows FTM and FTXT buttons via `uiContributions`.

### Export Changes

Only `packages/plugins/export-famitracker/src/` is modified.

### Documentation Updates

- Update `docs/features/famitracker-export.md` status to `complete` when shipped.
- Update `packages/plugins/export-famitracker/README.md` to document the output format and known limitations.

## Testing Strategy

### Unit Tests

- `ftm-text-writer.test.ts`: given a minimal NES ISM, assert output contains expected TITLE, INST2A03, ROW tokens.
- `ftm-writer.test.ts`: given a minimal NES ISM, assert binary starts with `FamiTracker Module` magic, contains PARAMS and PATTERNS blocks with correct byte offsets.
- Validate that `validate()` rejects non-NES songs.
- Test pattern padding: songs with fewer than 64 rows per pattern produce a full 64-row block.

### Integration Tests

- Export a known NES song from `songs/nes/` and compare the output against a reference `.ftm` file generated by FamiTracker manually.
- Round-trip test: export to text format, parse the output with a regex-based checker, assert all notes match the ISM.

## Migration Path

The `export()` functions are internal to the plugin. The `ExporterPlugin` interface contract is unchanged. No consumer migration is needed.

## Implementation Checklist

- [ ] Add `ftm-types.ts` with shared ISM → FTM mapping types
- [ ] Implement `writeFtmText()` in `ftm-text-writer.ts`
- [ ] Implement `writeFtmBinary()` in `ftm-writer.ts`
- [ ] Replace `placeholderHeader()` calls in `index.ts`
- [ ] Add unit tests for text writer
- [ ] Add unit tests for binary writer
- [ ] Add integration test with reference `.ftm` file
- [ ] Update `README.md` for `@beatbax/plugin-exporter-famitracker`
- [ ] Publish new minor version of `@beatbax/plugin-exporter-famitracker`

## Future Enhancements

- FamiStudio `.fms` export (separate exporter plugin `@beatbax/plugin-exporter-famistudio`)
- NSF export for direct NES hardware / emulator playback
- Support for VRC6 / MMC5 expansion chip channels once BeatBax NES chip supports them

## Open Questions

- Should the binary writer target FamiTracker v0.4.6 (last stable) or the newer community fork format?
- How should `inst.arp` inline patterns (e.g. `arp=[0,4,7]`) be encoded — as a sequence index or inlined per-row?
- What is the correct handling for songs with more than 128 patterns (FTM limit)?

## References

- [FTM binary format wiki](https://famitracker.org/wiki/index.php?title=FTM_format)
- [FamiTracker text export wiki](https://famitracker.org/wiki/index.php?title=Text_export)
- `packages/plugins/export-famitracker/src/index.ts` — current stub implementation
- `packages/plugins/chip-nes/src/` — NES channel backends providing period tables and envelope logic
- `docs/features/exporter_plugin_system.md` — parent feature (complete)
