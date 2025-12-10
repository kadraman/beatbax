# UGE File Import Module

This module provides functionality for reading and parsing hUGETracker UGE files (versions 1-6).

## Features

- **Complete UGE v6 support** with backwards compatibility for v1-v5
- **Parse all UGE components**:
  - Duty/Pulse instruments (15 instruments)
  - Wave instruments (15 instruments)
  - Noise instruments (15 instruments)
  - Wavetables (16 × 32 nibbles)
  - Patterns (64 rows each)
  - Order lists for all 4 channels
  - Routines (custom code strings)
  - Song metadata (name, artist, comment)
- **Utility functions** for note conversion and summary generation
- **Full type definitions** for all UGE data structures

## Usage

### Reading a UGE file

```typescript
import { readUGEFile, getUGESummary } from './import';

const song = readUGEFile('path/to/song.uge');

console.log(getUGESummary(song));
console.log(`Patterns: ${song.patterns.length}`);
console.log(`Tempo: ${song.ticks_per_row} ticks/row`);
```

### Parsing from buffer

```typescript
import { parseUGE } from './import';
import { readFileSync } from 'fs';

const buffer = readFileSync('song.uge');
const song = parseUGE(buffer.buffer);
```

### Accessing instruments

```typescript
// Duty/Pulse instruments
song.duty_instruments.forEach((inst, i) => {
  console.log(`${i}: ${inst.name} (duty=${inst.duty_cycle})`);
});

// Wave instruments
song.wave_instruments.forEach((inst, i) => {
  console.log(`${i}: ${inst.name} (wave=${inst.wave_index})`);
});

// Noise instruments
song.noise_instruments.forEach((inst, i) => {
  console.log(`${i}: ${inst.name} (${inst.noise_counter_step ? '7-bit' : '15-bit'})`);
});
```

### Accessing patterns

```typescript
song.patterns.forEach((pattern) => {
  console.log(`Pattern ${pattern.id}:`);
  
  pattern.rows.forEach((cell, i) => {
    if (cell.note !== 90) { // 90 = empty/rest
      console.log(`  Row ${i}: note=${cell.note}, inst=${cell.instrument}`);
    }
  });
});
```

### Accessing order lists

```typescript
console.log('Pulse 1 order:', song.orders.pulse1);
console.log('Pulse 2 order:', song.orders.pulse2);
console.log('Wave order:', song.orders.wave);
console.log('Noise order:', song.orders.noise);
```

### Utility functions

```typescript
import { ugeNoteToString, midiNoteToUGE } from './import';

// Convert UGE note to string
console.log(ugeNoteToString(60)); // "C3"
console.log(ugeNoteToString(90)); // "---" (rest)

// Convert MIDI note to UGE
const ugeNote = midiNoteToUGE(60); // Middle C
```

## CLI Tool

A CLI inspector is provided for examining UGE files:

```bash
# Basic summary
npx tsx src/cli-uge-inspect.ts song.uge

# Show pattern details
npx tsx src/cli-uge-inspect.ts song.uge --patterns

# Show order lists
npx tsx src/cli-uge-inspect.ts song.uge --orders

# Show wavetable data
npx tsx src/cli-uge-inspect.ts song.uge --waves

# Show everything
npx tsx src/cli-uge-inspect.ts song.uge --patterns --orders --waves
```

## Type Definitions

### UGESong

The main song structure containing all UGE data:

```typescript
interface UGESong {
  version: number;
  name: string;
  artist: string;
  comment: string;
  
  duty_instruments: DutyInstrument[];
  wave_instruments: WaveInstrument[];
  noise_instruments: NoiseInstrument[];
  
  wavetables: Uint8Array[]; // 16 wavetables
  
  ticks_per_row: number;
  timer_enabled: boolean; // v6+ only
  timer_divider: number; // v6+ only
  
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

### Instrument Types

```typescript
interface DutyInstrument {
  type: InstrumentType.DUTY;
  name: string;
  length: number;
  length_enabled: boolean;
  initial_volume: number;
  volume_sweep_direction: number;
  volume_sweep_change: number;
  freq_sweep_time: number;
  freq_sweep_shift: number;
  duty_cycle: number; // 0-3 (12.5%, 25%, 50%, 75%)
  subpattern_enabled: boolean;
  subpattern: SubPatternCell[];
}

interface WaveInstrument {
  type: InstrumentType.WAVE;
  name: string;
  length: number;
  length_enabled: boolean;
  volume: number;
  wave_index: number; // 0-15
  subpattern_enabled: boolean;
  subpattern: SubPatternCell[];
}

interface NoiseInstrument {
  type: InstrumentType.NOISE;
  name: string;
  length: number;
  length_enabled: boolean;
  initial_volume: number;
  volume_sweep_direction: number;
  volume_sweep_change: number;
  noise_counter_step: number; // 0 = 15-bit, 1 = 7-bit
  subpattern_enabled: boolean;
  subpattern: SubPatternCell[];
  noise_macro?: number[]; // v4-v5 only
}
```

### Pattern Types

```typescript
interface PatternCell {
  note: number; // 0-72 for notes, 90 for empty/rest
  instrument: number;
  effectcode: number;
  effectparam: number;
}

interface Pattern {
  id: number;
  rows: PatternCell[]; // Always 64 rows
}
```

## Testing

Run the test suite:

```bash
npm test -- ugeReader.test.ts
```

The tests cover:
- Parsing UGE files (v1-v6)
- Instrument parsing (duty, wave, noise)
- Pattern parsing (structure and content)
- Order list parsing
- Wavetable parsing
- Utility functions
- Self-generated file compatibility
- Round-trip validation with reference files

## Implementation Notes

### Based on GB Studio's Implementation

The reader is based on the proven implementation from GB Studio's `ugeHelper.ts`, ensuring compatibility with real-world UGE files.

### Version Compatibility

- **v6**: Full support including timer-based tempo and subpatterns
- **v5**: Pattern ID support and order list handling
- **v4**: Noise macro support
- **v3**: Wavetable off-by-one fix
- **v1-v2**: Basic support with older format quirks

### Format Quirks Handled

1. **Off-by-one in order lists**: Order count is stored as `length + 1`
2. **Off-by-one in wavetables** (v2 and earlier): Extra byte after each wave
3. **Volume clamping**: Some files have volumes > 15, which are clamped
4. **Volume sweep conversion**: Converted from unsigned to signed format
5. **Duplicate pattern IDs** (v5): Old GB Studio files may have non-unique pattern IDs

## References

- UGE v6 specification: `docs/uge-v6-spec.md`
- GB Studio ugeHelper: `gbstudio/src/shared/lib/uge/ugeHelper.ts`
- hUGETracker: https://github.com/SuperDisk/hUGETracker
