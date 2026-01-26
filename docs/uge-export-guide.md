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
Exporting to UGE v6 format: mysong.uge
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
Writing binary output...
Export complete: 68,086 bytes (66.49 KB) written
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

Use the TypeScript API:

```typescript
import { exportUGE } from 'beatbax/export';
import { parse } from 'beatbax/parser';
import { resolveSong } from 'beatbax/song';
import { readFileSync } from 'fs';

const src = readFileSync('mysong.bax', 'utf8');
const ast = parse(src);
const song = resolveSong(ast);

// Basic export
await exportUGE(song, 'mysong.uge');

// Export with verbose output
await exportUGE(song, 'mysong.uge', { verbose: true });

// Export with debug diagnostics
await exportUGE(song, 'mysong.uge', { debug: true });

// Export with strict GB mode (reject numeric panning)
await exportUGE(song, 'mysong.uge', { strictGb: true });

console.log('✓ Exported UGE file');
```

```typescript
import { exportUGE } from 'packages/engine/src/export/ugeWriter';
import { parse } from 'packages/engine/src/parser';
import { resolveSong } from 'packages/engine/src/song/resolver';
import { readFileSync } from 'fs';

const source = readFileSync('mysong.bax', 'utf-8');
const ast = parse(source);
const song = resolveSong(ast);

await exportUGE(song, 'output.uge');
```

## Validation

## Effects Mapping

### Arpeggio (arp) mapping

BeatBax `arp` effect exports to hUGETracker's `0xy` arpeggio effect, cycling through pitch offsets at the Game Boy frame rate (60 Hz).

- **Syntax:** `<arp:3,7>` defines semitone offsets from the root note
- **Cycle behavior:** Always includes root (offset 0): Root → +x → +y → Root → ...
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

### Noise Channel Note Mapping

The Game Boy noise channel doesn't use traditional musical pitches. Instead, notes control the noise generator's shift and divisor parameters. **BeatBax exports noise channel notes directly to hUGETracker** with NO automatic transpose applied.

- **Direct 1:1 mapping:** Notes are exported exactly as written in BeatBax:
  - `C2` in BeatBax → exports as index **0** (C-3 in hUGETracker = lowest noise)
  - `C5` in BeatBax → exports as index **24** (C-5 in hUGETracker = mid-range percussion)
  - `C7` in BeatBax → exports as index **48** (C-7 in hUGETracker = bright percussion)
  - `C9` in BeatBax → exports as index **72** (C-9 in hUGETracker = maximum, highest)
  - Notes above `C9` are clamped to index **72**
  - Notes below `C2` are transposed up by octaves to fit in valid range
- **Write in target range:** For typical percussion sounds, use **C5-C7** (indices 24-48), which map to common snare/hi-hat sounds in hUGETracker
- **Custom transpose if needed:** Add `uge_transpose=N` to your noise instrument to shift all notes:
  ```
  inst kick type=noise env=gb:12,down,1 uge_transpose=12  # Shift up 1 octave
  ```
- **Round-trip behavior:** When importing UGE files, noise notes remain at their hUGETracker index values (same as exported)

Example:
```bax
chip gameboy
bpm 120

# Write percussion notes in the exact range you want in hUGETracker
inst kick  type=noise env=gb:12,down,1 width=15  # Use C2-C3 (deep sounds)
inst snare type=noise env=gb:10,down,2 width=7   # Use C5-C6 (mid-range)
inst hat   type=noise env=gb:8,down,1 width=7    # Use C7-C8 (bright sounds)

# Direct mapping: C2→0, C5→24, C6→36, C7→48, C8→60
pat drums = C2 . C5 . C6 C7 C2 C8

channel 4 => inst kick pat drums
```

**Important:** The 1:1 mapping applies during **UGE export**. BeatBax's internal playback uses these as relative brightness controls for the noise generator. MIDI export maps noise notes to GM percussion (e.g., C5→Snare, C7→Hi-hat).

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
npm run cli -- export uge songs/effect_demo.bax tmp/effect_demo.uge
node scripts/auto_calibrate_vib.mjs songs/effect_demo.bax tmp/auto_cal --sampleRate 44100
```

See `packages/engine/src/export/ugeWriter.ts` and `packages/engine/src/audio/pcmRenderer.ts` for implementation details.

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
inst arp type=wave wave=[0,3,6,9,12,9,6,3,0,3,6,9,12,9,6,3]
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
- [UGE v6 Format Specification](../docs/uge-v6-spec.md)
- [BeatBax Tutorial](../TUTORIAL.md)
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
