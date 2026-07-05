# UGE Export Usage Guide

## Overview
BeatBax now supports exporting songs to hUGETracker v6 (.uge) format, enabling seamless integration with Game Boy music development workflows.

## Quick Start

### 1. Write a BeatBax Song

Create a `.bax` file with your song:

```
chip gameboy
bpm 128

inst lead type=pulse1 duty=50 env=gb:12,down,1
inst bass type=pulse2 duty=25 env=gb:10,down,1

pat melody = C4 E4 G4 C5
pat bassline = C2 . G2 .

channel 1 => inst lead pat melody
channel 2 => inst bass pat bassline
```

### 2. Export to UGE

From **BeatBax Desktop**, use the toolbar or menu:

- **Export as hUGETracker UGE** saves a `.uge` file for valid Game Boy songs.
- Export warnings (for example flat-note conversion) appear in the Problems and Output panels.
- The Output panel opens after a successful save.

> Web-lite (`apps/web-ui`) does not include an export menu. Use the desktop app or CLI below.

Using the CLI:

```bash
npm run cli -- export uge mysong.bax mysong.uge
```

Output:
```
✓ Exported UGE v6 file: mysong.uge (68086 bytes)
```

#### CLI Options

**Verbose Output** - Get detailed progress information:
```bash
npm run cli -- export uge mysong.bax mysong.uge --verbose
```

Output:
```
Building UGE v6 binary payload
Processing instruments...
  Instruments exported:
    - Duty: 2/15 slots (lead, bass)
    - Wave: 1/15 slots (arp)
    - Noise: 1/15 slots (kick)
Building patterns for 4 channels...
Applying effects and post-processing...
  Pattern structure:
    - Channel 1: 2 patterns (128 rows total)
    - Channel 2: 2 patterns (128 rows total)
    - Channel 3: 1 pattern (64 rows total)
    - Channel 4: 1 pattern (64 rows total)
  Effects applied:
    - Vibrato: 3 notes
    - Note cuts: 2 occurrences
  Tempo: 128 BPM (7 ticks/row in UGE)
UGE payload complete: 68,086 bytes (66.49 KB)
File ready for hUGETracker v6
```

**Debug Output** - Get detailed internal diagnostics:
```bash
npm run cli -- export uge mysong.bax mysong.uge --debug
```

Debug output includes:
- Instrument discovery and mapping
- Wave instrument volume calculations
- Per-channel event counts
- Pattern cell construction
- Effect encoding and placement
- Binary layout verification

### 3. Use in hUGETracker

Open the exported `.uge` file in hUGETracker:
- File size will be approximately 64-70KB
- Contains 15 duty, 15 wave, and 15 noise instruments
- Patterns mapped from BeatBax channels
- Ready for Game Boy development workflow

### 4. Compile for Game Boy

Use `uge2source.exe` to convert to C code:

```bash
uge2source.exe mysong.uge mysong_data mysong.c
```

Include `mysong.c` in your Game Boy project and link with hUGEDriver.

## Format Details

### Channel Mapping
BeatBax channels map to Game Boy APU channels:
- Channel 1 → Pulse 1 (duty-cycle square wave)
- Channel 2 → Pulse 2 (duty-cycle square wave)
- Channel 3 → Wave (32-sample wavetable)
- Channel 4 → Noise (LFSR-based noise)

### Instrument Mapping
BeatBax instruments are converted to UGE instruments based on type:
- `type=pulse1` or `type=pulse2` → Duty instruments
- `type=wave` → Wave instruments
- `type=noise` → Noise instruments

### Note Format
Notes use standard pitch notation:
- `C3`, `D4`, `E#5`, `Gb6`, etc.
- Middle C (C4) = MIDI note 60
- Rest events: `.` in patterns

### Game Boy Noise Display Notes

For named Game Boy noise hits, use `uge_note=` when you want the exported UGE row to show a specific hUGETracker note:

```
inst kick  type=noise gb:width=7  env=14,down uge_note=C-6
inst snare type=noise gb:width=7  env=10,down uge_note=C-7
inst hat   type=noise gb:width=15 env=4,down  uge_note=C-8

pat drums = kick hat snare hat
```

`uge_note=` uses hUGETracker display notation directly (`C-6`, `C-7`, `C#7`, `C-8`). It controls **both** UGE export (pattern-row note) **and** BeatBax Game Boy noise playback (NR43 LFSR clock via hUGEDriver-compatible `get_note_poly` mapping). Timbre and decay still come from `gb:width`, `env`, and `length`. If `uge_note=` is omitted, legacy `note=` values are converted through BeatBax notation for export only, and playback falls back to default noise clock values unless explicit `divisor`/`shift` are set.

### Tempo and BPM alignment

BeatBax playback and CLI WAV export use the **`bpm` value in your `.bax` file** directly (row duration = `(60 / bpm) / 4` seconds).

UGE export converts BPM to hUGETracker **ticks per row** using integer rounding:

```
ticksPerRow = round(896 / bpm)
effective BPM in hUGE ≈ 896 / ticksPerRow
```

Because ticks per row must be a whole number, **many BPM values do not transfer exactly**. For example, `bpm 140` exports as **6 ticks/row**, and hUGETracker displays **~149.3 BPM** — the same song plays slightly faster in hUGE than in BeatBax preview/WAV.

#### Recommended BPM values (exact match)

For **identical timing** between BeatBax playback, CLI WAV export, and hUGETracker after UGE export, use a BPM where **896 ÷ bpm is an integer** (equivalently: `bpm = 896 ÷ ticksPerRow`):

| `bpm` in `.bax` | UGE ticks/row | hUGE effective BPM |
|---:|---:|---:|
| 224 | 4 | 224 |
| 128 | 7 | 128 |
| 112 | 8 | 112 |
| 64 | 14 | 64 |
| 56 | 16 | 56 |

**128 BPM** (7 ticks/row) is the default in many Game Boy demos and parity fixtures — it is a good choice when comparing BeatBax renders to hUGETracker WAV exports.

#### Approximate tempos

If you write a BPM that does not divide 896 evenly, hUGE uses the **nearest** tick count. Common examples:

| `bpm` in `.bax` | Exported ticks/row | hUGE shows ~ |
|---:|---:|---:|
| 140 | 6 | 149.3 |
| 120 | 7 | 128.0 |
| 150 | 6 | 149.3 |

This is usually acceptable for authoring; for tight A/B timing tests against hUGE WAVs, prefer an exact-match BPM from the table above.

See also [gameboy-noise-uge-playback-parity.md](../features/gameboy-noise-uge-playback-parity.md) for level-calibration notes.

### Pattern Structure
- Each pattern can contain up to 64 rows
- Rows contain: note, instrument, volume, effect code, effect params
- Rest cells use note value 90 with VOLUME_NO_CHANGE (0x00005A00)

## Advanced Usage

### Multiple Export Formats

Export to all formats at once:

```bash
npm run cli -- export json mysong.bax mysong.json
npm run cli -- export midi mysong.bax mysong.mid
npm run cli -- export uge mysong.bax mysong.uge
```

### Programmatic Export

Use the TypeScript API. For in-memory bytes (tools, tests, custom hosts), call `buildUGE`. For CLI-style file output, use `exportUGE`:

```typescript
import { buildUGE, exportUGE } from '@beatbax/engine/export';
import { parse } from '@beatbax/engine/parser';
import { resolveSong } from '@beatbax/engine/song';
import { readFileSync } from 'fs';

const src = readFileSync('mysong.bax', 'utf8');
const ast = parse(src);
const song = resolveSong(ast);

// In-memory payload (UI download/save, tests, custom tooling)
const bytes = buildUGE(song);

// Write to disk (CLI / Node)
await exportUGE(song, 'mysong.uge');

// Export with verbose output
await exportUGE(song, 'mysong.uge', { verbose: true });

// Export with debug diagnostics
await exportUGE(song, 'mysong.uge', { debug: true });

// Export with strict GB mode (reject numeric panning)
await exportUGE(song, 'mysong.uge', { strictGb: true });
```

See [Export architecture](./export-architecture.md) for JSON, MIDI, and WAV builders.

## Effects Mapping

### Supported Effects

BeatBax supports the following effects with UGE export:

- **Panning** (`pan`, `gb:pan`) → NR51 terminal bits via `8xx` Set-Panning effect
- **Vibrato** (`vib`) → `4xy` effect (x=rate, y=depth)
- **Portamento** (`port`) → `3xx` Tone Portamento effect
- **Pitch Bend** (`bend`) → `3xx` Tone Portamento effect (approximation with warnings)
- **Arpeggio** (`arp`) → `0xy` effect (see detailed mapping below)
- **Volume Slide** (`volSlide`) → `Axy` Volume Slide effect
- **Note Cut** (`cut`) → `E0x` Note Cut effect

### Unsupported Effects

The following effects are **not supported** in UGE export:

- **Retrigger** (`retrig`) - hUGETracker has no native retrigger effect. When exporting songs containing retrigger effects, a warning will be displayed and the retrigger effects will be omitted from the output. Use WebAudio playback for retrigger support.
- **Tremolo** (`trem`) - Exported as metadata comment only, not as playable effect

### Arpeggio (arp) mapping

BeatBax `arp` effect exports to hUGETracker's `0xy` arpeggio effect, cycling through pitch offsets at the Game Boy frame rate (60 Hz).

- **Syntax:** `<arp:3,7>` lists semitone offsets **above** the written note (do not include `0`; root is implicit)
- **Cycle behavior:** Playback and hUGE always start on the root: Root → +x → +y → Root → …
  - Example: `arp:3,7` (C minor) cycles C → Eb → G → C at 60 Hz
  - Each step lasts ~16.667ms, creating a chord illusion
- **Mapping rule:** First 2 offsets map to x and y nibbles of `0xy` effect code
  - `arp:3,7` → `0x37` (offset +3 in x nibble, +7 in y nibble)
  - `arp:4,7` → `0x47` (major chord)
- **Limitations:**
  - UGE format supports only 2 offsets (3 notes including root)
  - Arpeggios with 3+ offsets (e.g., `arp:4,7,11`) emit a warning and only export first 2
- **Sustain behavior:** Arpeggio effect applies to note onset row AND all sustain rows for full note duration
- **Implementation:** See `packages/engine/src/export/ugeWriter.ts` (ArpeggioHandler, activeArp tracking)

Example presets:
```bax
effect arpMinor = arp:3,7
effect arpMajor = arp:4,7
effect arpMajor7 = arp:4,7,11  # Warning: only 4,7 exported to UGE

pat chords = C4<arpMinor>:4 F4<arpMajor>:4 G4<arpMinor>:4
```

### Pitch Bend (bend) mapping

BeatBax `bend` effect exports to hUGETracker's `3xx` tone portamento effect. Since hUGETracker doesn't support high-resolution pitch bends or delay parameters, the export process approximates bends with the following limitations:

- **Syntax:** `<bend:semitones,curve,delay,time>` in BeatBax
  - `semitones`: Number of semitones to bend (positive = up, negative = down)
  - `curve`: Bend curve shape (`linear`, `exp`, `log`, `sine`) - **only `linear` approximates well in UGE**
  - `delay`: Fraction of note duration before bend starts (default 0.5) - **not supported in UGE**
  - `time`: Bend duration in seconds - **not supported in UGE, uses full note duration**

- **Mapping to `3xx` effect:**
  - Effect code: `3` (tone portamento)
  - Speed value (`xx`): Calculated based on semitone distance:
    - ≤1 semitone: `32` (slowest, most musical for small bends)
    - ≤2 semitones: `48` (whole-tone intervals)
    - ≤5 semitones: `64` (fourth/tritone intervals)
    - ≤7 semitones: `96` (fifth intervals)
    - >7 semitones: `128` (octave+ intervals, fastest)
  - Formula: hUGETracker portamento duration = `(256 - speed) / 256 × noteDuration × 0.6`
  - Higher speed values = faster portamento (inverse relationship)

- **Export warnings issued for:**
  - Non-linear curves (`exp`, `log`, `sine`) - UGE only supports linear portamento
  - Delay values other than `0.0` or `0.5` - partial note timing not supported in UGE format
  - These warnings don't prevent export but indicate fidelity loss

- **Priority:** 11 (between standard portamento and vibrato in conflict resolution)
- **Implementation:** See `packages/engine/src/export/ugeWriter.ts` (PitchBendHandler)

Example:
```bax
effect wholetone = bend:+2,linear,0.5  # Guitar-style whole-tone bend
effect dive = bend:-12,log,0           # Octave dive (WARNING: log curve not supported)

pat melody = C4<wholetone>:4 F4 G4<dive>:2
```

UGE export output:
```
⚠ Warning: Pitch bend effect uses non-linear curve 'log', UGE portamento is always linear
⚠ Warning: Pitch bend effect has delay parameter (0.0), UGE portamento bends across full note
```

**Recommendation:** For best results in UGE export, use linear curves (`bend:+2,linear`) and stick to delay values of `0` or `0.5`. For complex bends, use WebAudio or MIDI export instead.

### Noise Channel Note Mapping

The Game Boy noise channel doesn't use traditional musical pitches. Noise sound is controlled by LFSR width, divisor, shift, envelope, and length. hUGETracker still displays a note in the noise pattern row, so BeatBax supports `uge_note=` for named noise hits:

- `uge_note=C-6` writes UGE note index 36.
- `uge_note=C-7` writes UGE note index 48.
- `uge_note=C-8` writes UGE note index 60.
- `uge_note=C#7` writes the sharp hUGETracker display note directly.

If `uge_note=` is omitted, legacy `note=` values are converted from BeatBax note notation:

- `note=C5` in BeatBax → displays as `C-6` in hUGETracker.
- `note=C6` in BeatBax → displays as `C-7` in hUGETracker.
- `note=C7` in BeatBax → displays as `C-8` in hUGETracker.

Prefer `uge_note=` for new Game Boy noise percussion so the `.bax` file matches the tracker display after export. Use `uge_transpose` for melodic instruments whose UGE pitch should derive from the written BeatBax note plus a semitone offset.

Example:
```bax
chip gameboy
bpm 120

# Choose the exact hUGETracker display notes for named hits.
inst kick  type=noise env=gb:12,down,1 width=15 uge_note=C-6
inst snare type=noise env=gb:10,down,2 width=7  uge_note=C-7
inst hat   type=noise env=gb:8,down,1 width=7   uge_note=C-8

pat drums = kick . snare . hat hat kick snare

channel 4 => inst kick pat drums
```

**Important:** `uge_note=` drives the noise LFSR clock during BeatBax playback (WebAudio and CLI/WAV) **and** the pattern note written to UGE. Prefer `uge_note=` over legacy `note=` on noise instruments. Use `uge_transpose` for melodic pulse/wave pitch offsets. MIDI export maps noise hits to percussion separately.

### Vibrato (vib) mapping

When exporting BeatBax songs for Game Boy, the BeatBax `vib` effect is conservatively mapped into hUGETracker's compact `4xy` vibrato effect so the exported `.uge` behaves sensibly in tracker/driver toolchains.

- **Mapping rule:** BeatBax vibrato rate → `x` (rate nibble), depth → `y` (depth nibble) using a tuned scale factor. Export uses `VIB_DEPTH_SCALE = 4.0` to convert BeatBax depth units into the `y` nibble.
- **Placement:** The exporter places the `4xy` command on the same pattern row where the originating note occurs. The original Game Boy NR51 routing is preserved when possible.
- **Renderer parity:** The offline renderer in the engine (`packages/engine/src/audio/pcmRenderer.ts`) has a Game-Boy-specific emulation mode that reproduces hUGEDriver-style vibrato (mask-activated register offsets) for better audible parity with exported `.uge` playback.
- **Tuned constants:** The engine's calibration sweep identified a practical best-fit set used in source builds: `vibDepthScale=4.0`, `regBaseFactor=0.04`, `regUnit=1`.
- **Calibration tools:** Re-run or inspect the calibration and measurement tools in `scripts/compare_vib.cjs` and `scripts/auto_calibrate_vib.mjs` if you need to refine parity for specific material.

Example: export and analyze a song with vibrato

```bash
# export UGE then render WAV for analysis (example)
npm run cli -- export uge songs/features/effect_demo.bax tmp/effect_demo.uge
node scripts/auto_calibrate_vib.mjs songs/features/effect_demo.bax tmp/auto_cal --sampleRate 44100
```

See `packages/engine/src/export/ugeWriter.ts` and `packages/engine/src/audio/pcmRenderer.ts` for implementation details.

## Validation

Validate exported UGE files with the official hUGETracker tools:

### Using uge2source.exe
```bash
uge2source.exe mysong.uge test_song output.c
```

Success: Exit code 0, `output.c` created
Failure: Error message displayed

### Using hUGETracker
1. Launch hUGETracker v1.0.11 or later
2. File → Open → Select exported `.uge` file
3. File should load without errors
4. Patterns, instruments, and order list should be visible

## Troubleshooting

### File Won't Open in hUGETracker
- Check file size: should be 60-70KB for typical songs
- Verify version: first 4 bytes should be `06 00 00 00` (little-endian 6)
- Run through uge2source.exe for detailed error messages

### Missing Instruments
- UGE files contain 45 instruments (15 duty, 15 wave, 15 noise)
- BeatBax currently uses default instrument values
- Custom instrument mapping may be needed for complex songs

### Pattern Length Issues
- UGE patterns have fixed 64-row length
- Shorter BeatBax patterns are padded with rests
- Longer patterns are truncated

## File Format Reference

### UGE v6 Binary Structure
```
Header:
- Version (u32): 6
- Name, Artist, Comment (shortstrings: 256 bytes each)

Instruments (45 total, 1381 bytes each):
- 15 Duty Instruments (Type 0)
- 15 Wave Instruments (Type 1)
- 15 Noise Instruments (Type 2)

Wavetables:
- 16 wavetables × 32 nibbles = 512 bytes

Patterns:
- Timing settings (9 bytes)
- Pattern count (u32)
- Pattern data (1092 bytes per pattern)

Orders:
- 4 channels × order list (variable length)

Routines:
- 16 AnsiStrings (variable length)
```

### Pattern Cell Format (17 bytes)
```
Note (u32)         - MIDI note number (90 = rest)
Instrument (u32)   - Instrument index (0-14)
Volume (u32)       - 0x00005A00 = no change
Effect Code (u32)  - GB effect type
Effect Params (u8) - Effect parameters
```

## Examples

### Simple Melody
```
chip gameboy
bpm 128

inst lead type=pulse1 duty=50 env=gb:12,down,1

pat verse = C4 D4 E4 G4 E4 D4 C4 .

channel 1 => inst lead pat verse
```

### Four-Channel Song
```
chip gameboy
bpm 140

inst lead type=pulse1 duty=50 env=gb:12,down,1
inst bass type=pulse2 duty=25 env=gb:10,down,1
inst arp type=wave wave=[0,2,3,5,6,8,9,11,12,11,9,8,6,5,3,2,0,2,3,5,6,8,9,11,12,11,9,8,6,5,3,2]
inst kick type=noise env=gb:12,down,1

pat melody = C5 E5 G5 C6
pat bassline = C3 . G2 .
pat arpeggios = C4 E4 G4 C5
pat drums = C5 . C5 C5

channel 1 => inst lead pat melody
channel 2 => inst bass pat bassline
channel 3 => inst arp pat arpeggios
channel 4 => inst kick pat drums
```

## Resources

- [hUGETracker Official Site](https://github.com/SuperDisk/hUGETracker)
- [UGE v6 Format Specification](../formats/uge-v6-spec.md)
- [BeatBax Tutorial](../TUTORIAL.md)
- [UGE Writer Implementation](./uge-writer.md)
- [Export architecture](./export-architecture.md)
- [Implementation Details](../DEVNOTES-UGE-IMPLEMENTATION.md)

## Support

For issues with UGE export:
1. Verify beatbax is up to date: `git pull`
2. Check test suite: `npm test`
3. Validate with uge2source.exe
4. Open an issue with example `.bax` file and error details

Notes on panning & NR51
- BeatBax maps `gb:pan` and snapped numeric `pan` values to NR51 terminal bits for UGE export and emits `8xx` Set-Panning effects in pattern data when the mix changes on note onsets.
- The exporter no longer appends an `[NR51=0x..]` debug tag to the UGE comment; use `export json` for round-trip metadata if required.
- Use `--strict-gb` with `export uge` to reject numeric pans instead of snapping them.
