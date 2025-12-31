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

await exportUGE(song, 'mysong.uge');
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
- BeatBax maps `gb:pan` and snapped numeric `pan` values to NR51 terminal bits for UGE export and emits `8xx` Set‑Panning effects in pattern data when the mix changes on note onsets.
- The exporter no longer appends an `[NR51=0x..]` debug tag to the UGE comment; use `export json` for round-trip metadata if required.
- Use `--strict-gb` with `export uge` to reject numeric pans instead of snapping them.
