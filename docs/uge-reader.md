# UGE Reader - Complete Implementation

## Overview

A fully-featured UGE (hUGETracker) file reader for BeatBax that can parse UGE files from versions 1 through 6. The implementation is based on GB Studio's proven `ugeHelper.ts` and has been tested against both self-generated files and real-world community UGE files.

## Quick Start

```typescript
import { readUGEFile, getUGESummary } from 'beatbax';

// Read a UGE file
const song = readUGEFile('song.uge');

// Display summary
console.log(getUGESummary(song));

// Access instruments
song.dutyInstruments.forEach(inst => {
  console.log(`${inst.name}: duty ${inst.dutyCycle}`);
});
```

## Features

### ✅ Complete UGE Format Support

- **All UGE versions**: v1 through v6 with proper handling of version-specific features
- **All instrument types**: Duty/Pulse (15), Wave (15), Noise (15)
- **Pattern data**: Full 64-row patterns with notes, instruments, and effects
- **Order lists**: Pattern sequences for all 4 Game Boy channels
- **Wavetables**: 16 × 32 nibbles (4-bit waveform data)
- **Song metadata**: Name, artist, comment
- **Timing data**: Ticks per row, timer-based tempo (v6)
- **Routines**: Custom code strings (v2+)

### ✅ Robust Parsing

- Handles format quirks (off-by-one errors, volume clamping, etc.)
- Proper endianness handling (little-endian)
- Binary buffer reading with bounds checking
- Version-specific field handling
- Error handling with descriptive messages

### ✅ Comprehensive Testing

- 15 test cases covering all major features
- Tested against 5+ UGE files (v1, v5, v6)
- Both self-generated and community files validated
- 100% test pass rate

## Files

```
packages/engine/src/import/
├── uge/
│   └── uge.reader.ts  # Core implementation (630+ lines)
├── index.ts           # Module exports
└── README.md          # Usage documentation

packages/engine/tests/
└── ugeReader.test.ts  # Test suite (350+ lines, 15 tests)

examples/
├── read-uge-example.ts        # Usage example (imports from `@beatbax/engine`)
└── validate-uge-reader.ts     # Validation script (imports from `@beatbax/engine`)

packages/cli/src/
└── cli-uge-inspect.ts # CLI inspection tool (now under `packages/cli/src`)
```

## API Reference

### Main Functions

#### `readUGEFile(filePath: string): UGESong`
Read and parse a UGE file from disk.

```typescript
const song = readUGEFile('path/to/song.uge');
```

#### `parseUGE(buffer: ArrayBuffer): UGESong`
Parse a UGE file from an ArrayBuffer.

```typescript
const buffer = readFileSync('song.uge');
const song = parseUGE(buffer.buffer);
```

#### `getUGESummary(song: UGESong): string`
Generate a human-readable summary of the song.

```typescript
console.log(getUGESummary(song));
```

#### `ugeNoteToString(note: number): string`
Convert a UGE note number to a string representation.

```typescript
console.log(ugeNoteToString(60)); // "C3"
console.log(ugeNoteToString(90)); // "---" (rest)
```

#### `midiNoteToUGE(midiNote: number): number`
Convert a MIDI note number to UGE format.

```typescript
const ugeNote = midiNoteToUGE(60); // Middle C
```

### Type Definitions

#### `UGESong`
Complete song structure containing all UGE data.

```typescript
interface UGESong {
  version: number;
  name: string;
  artist: string;
  comment: string;
  dutyInstruments: DutyInstrument[];
  waveInstruments: WaveInstrument[];
  noiseInstruments: NoiseInstrument[];
  wavetables: Uint8Array[];
  ticksPerRow: number;
  timerEnabled: boolean;
  timerDivider: number;
  patterns: Pattern[];
  orders: {
    pulse1: number[];
    pulse2: number[];
    wave: number[];
    noise: number[];
  };
  routines: string[];
}
```

#### Instrument Types

```typescript
interface DutyInstrument {
  type: InstrumentType.duty;
  name: string;
  length: number;
  lengthEnabled: boolean;
  initialVolume: number;
  volumeSweepDirection: number;
  volumeSweepChange: number;
  freqSweepTime: number;
  freqSweepShift: number;
  dutyCycle: number; // 0-3 (12.5%, 25%, 50%, 75%)
  subpatternEnabled: boolean;
  subpattern: SubPatternCell[];
}

interface WaveInstrument {
  type: InstrumentType.wave;
  name: string;
  length: number;
  lengthEnabled: boolean;
  volume: number;
  waveIndex: number; // 0-15
  subpatternEnabled: boolean;
  subpattern: SubPatternCell[];
}

interface NoiseInstrument {
  type: InstrumentType.noise;
  name: string;
  length: number;
  lengthEnabled: boolean;
  initialVolume: number;
  volumeSweepDirection: number;
  volumeSweepChange: number;
  noiseCounterStep: number; // 0=15-bit, 1=7-bit
  subpatternEnabled: boolean;
  subpattern: SubPatternCell[];
  noiseMacro?: number[]; // v4-v5 only
}
```

#### Pattern Types

```typescript
interface Pattern {
  id: number;
  rows: PatternCell[]; // Always 64 rows
}

interface PatternCell {
  note: number;        // 0-72 or 90 (rest)
  instrument: number;  // 0 = no instrument
  effectcode: number;
  effectparam: number;
}

interface SubPatternCell {
  note: number | null;
  jump: number;
  effectcode: number | null;
  effectparam: number | null;
}
```

## CLI Tool

### Basic Usage

```bash
npx tsx packages/cli/src/cli-uge-inspect.ts <file.uge>
```

### Options

- `--patterns` or `-p`: Show pattern details
- `--orders` or `-o`: Show order lists
- `--waves` or `-w`: Show wavetable data

### Examples

```bash
# Basic summary
npx tsx packages/cli/src/cli-uge-inspect.ts songs/chavez.uge

# Show everything
npx tsx packages/cli/src/cli-uge-inspect.ts songs/chavez.uge -p -o -w
```

## Test Results

All 15 tests pass successfully:

```
✅ Basic parsing
  ✓ should parse a minimal UGE file
  ✓ should parse UGE files from songs directory

✅ Instrument parsing
  ✓ should correctly parse duty instruments
  ✓ should correctly parse wave instruments
  ✓ should correctly parse noise instruments

✅ Pattern parsing
  ✓ should parse patterns with correct structure
  ✓ should parse pattern notes correctly

✅ Order parsing
  ✓ should parse order lists for all channels

✅ Wavetable parsing
  ✓ should parse 16 wavetables

✅ Utility functions
  ✓ should convert UGE notes to strings
  ✓ should convert MIDI notes to UGE
  ✓ should generate a summary

✅ Self-generated UGE files
  ✓ should read self-generated demo_export_test.uge
  ✓ should read self-generated sample_export.uge

✅ Round-trip compatibility
  ✓ should match structure of reference UGE files
```

## Validated Files

### Self-Generated (BeatBax)
- ✅ `demo_export_test.uge` (v6) - 4 patterns
- ✅ `sample_export.uge` (v6) - 4 patterns
- ✅ `valid_v6_test.uge` (v6)

### Community Files
- ✅ `songs/chavez.uge` (v5) - 197 patterns, "monkeys on mars"
- ✅ `songs/tempest.uge` (v6) - 66 patterns
- ✅ `songs/cognition.uge` (v1) - 37 patterns

## Version Support Matrix

| Version | Support | Features |
|---------|---------|----------|
| v6 | ✅ Full | Subpatterns, timer tempo, all modern features |
| v5 | ✅ Full | Pattern IDs, proper order lists |
| v4 | ✅ Full | Noise macros |
| v3 | ✅ Full | Wavetable fix |
| v2 | ✅ Full | Routines support |
| v1 | ✅ Full | Basic format |

## Format Quirks Handled

The reader properly handles these UGE format quirks:

1. **Order list off-by-one**: Count stored as `length + 1`
2. **Wavetable off-by-one** (v2-): Extra byte after each wave
3. **Volume clamping**: Files with volume > 15 are clamped to 15
4. **Volume sweep sign**: Proper conversion between signed/unsigned
5. **Duplicate pattern IDs**: Old GB Studio v5 files may have duplicate IDs

## Implementation Notes

### Based on GB Studio

The implementation is based on GB Studio's battle-tested `ugeHelper.ts`, ensuring compatibility with existing UGE workflows and tools.

### Memory Efficient

- Uses TypedArrays (Uint8Array) for wavetable data
- Minimal object allocation during parsing
- Suitable for both Node.js and browser environments

### Error Handling

Descriptive errors for common issues:
- Invalid file format
- Unsupported versions
- Corrupt data
- Missing required fields

## Usage Examples

### Read and Display Song Info

```typescript
import { readUGEFile } from 'beatbax/import';

const song = readUGEFile('mysong.uge');
console.log(`${song.name} by ${song.artist}`);
console.log(`Version: ${song.version}`);
console.log(`Patterns: ${song.patterns.length}`);
```

### Iterate Through Instruments

```typescript
// Duty/Pulse instruments
song.dutyInstruments.forEach((inst, i) => {
  console.log(`D${i}: ${inst.name}`);
  console.log(`  Duty: ${inst.dutyCycle}`);
  console.log(`  Volume: ${inst.initialVolume}`);
});

// Wave instruments
song.waveInstruments.forEach((inst, i) => {
  console.log(`W${i}: ${inst.name}`);
  console.log(`  Wave: ${inst.waveIndex}`);
});

// Noise instruments
song.noiseInstruments.forEach((inst, i) => {
  console.log(`N${i}: ${inst.name}`);
  console.log(`  Counter: ${inst.noiseCounterStep ? '7-bit' : '15-bit'}`);
});
```

### Access Pattern Data

```typescript
// Get first pattern
const pattern = song.patterns[0];
console.log(`Pattern ${pattern.id} (${pattern.rows.length} rows)`);

// Iterate through rows
pattern.rows.forEach((cell, rowNum) => {
  if (cell.note !== 90) { // Skip rests
    const noteName = ugeNoteToString(cell.note);
    console.log(`Row ${rowNum}: ${noteName}`);
  }
});
```

### Check Order Lists

```typescript
console.log('Pulse 1 order:', song.orders.pulse1);
console.log('Pulse 2 order:', song.orders.pulse2);
console.log('Wave order:', song.orders.wave);
console.log('Noise order:', song.orders.noise);
```

### Access Wavetables

```typescript
song.wavetables.forEach((wave, i) => {
  console.log(`Wave ${i}:`, Array.from(wave));
});
```

## Integration with BeatBax

The UGE reader is fully integrated into BeatBax:

```typescript
// Import from main package
import { readUGEFile, parseUGE, getUGESummary } from 'beatbax';

// Or from import submodule
import { readUGEFile } from 'beatbax/import';
```

## Future Enhancements

Possible improvements beyond current implementation:

- Write support (UGE file generation from parsed data)
- Conversion utilities (UGE ↔ BeatBax AST)
- Pattern analysis tools
- Instrument library management
- Direct integration with hUGEDriver output

## See Also

- [UGE Export Guide](./uge-export-guide.md) - Exporting BeatBax songs to UGE format
- [UGE v6 Spec](./uge-v6-spec.md) - Complete UGE v6 binary format specification
- [UGE Writer](./uge-writer.md) - UGE file generation documentation
- [packages/engine/src/import/README.md](../packages/engine/src/import/README.md) - Import module documentation
