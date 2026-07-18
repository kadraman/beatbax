# @beatbax/engine

> Live-coding language and runtime for retro console chiptunes.

[![npm version](https://img.shields.io/npm/v/@beatbax/engine.svg)](https://www.npmjs.com/package/@beatbax/engine)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Overview

The BeatBax engine is a deterministic, tick-accurate audio engine for creating chiptune music. It currently provides a faithful 4-channel Game Boy APU emulation with support for:

- **Pulse 1 & 2** - Square wave channels with duty cycle and envelope control
- **Wave** - Custom wavetable playback (16×4-bit samples)
- **Noise** - LFSR-based noise generation with envelope
- **Instrument programs** - `pitch_env` / `vol_env` / `duty_env` / `arp_env` and native `subpat` lower to a shared tick program for preview/WAV and hUGETracker instrument subpatterns on UGE export

Additional chipsets (NES, SMS, Spectrum AY, …) are available via chip plugins.

## Installation

```bash
npm install @beatbax/engine
```

## Quick Start

```typescript
import { parse } from '@beatbax/engine/parser';
import { resolveSong } from '@beatbax/engine/song';
import { play } from '@beatbax/engine/audio';

const source = `
  chip gameboy
  bpm 120

  inst lead type=pulse1 duty=50 env=gb:12,down,1

  pat melody = C4 E4 G4 C5

  channel 1 => inst lead pat melody
`;

const ast = parse(source);
const song = resolveSong(ast);
await play(song);
```

## Features

### Parser & Language
- Full BeatBax language parser
- Pattern and sequence definitions
- Inline effects and transforms
- Import/export support

### Exports
```typescript
import { exportJSON } from '@beatbax/engine/export';
import { exportMIDI } from '@beatbax/engine/export';
import { exportUGE } from '@beatbax/engine/export';

// Export to various formats
await exportJSON(song, 'output.json');
await exportMIDI(song, 'output.mid');
await exportUGE(song, 'output.uge');
```

### Imports
```typescript
import { readUGE } from '@beatbax/engine/import';

// Import hUGETracker files (v1-v6)
const song = await readUGE('input.uge');
```

### Audio Playback
```typescript
import { play } from '@beatbax/engine/audio';

// Play with controls
const player = await play(song);
player.pause();
player.resume();
player.stop();
```

## API Documentation

### Runtime Entry Points

- **`@beatbax/engine`** — core API surface.
- **`@beatbax/engine/node`** — Node-only operational helpers and playback plumbing (for example `playFile`).

Runtime boundary note:

- The root entrypoint currently re-exports some APIs that directly depend on Node `fs`.
- Use `@beatbax/engine/node` for operational Node helpers.
- In browser-targeted code, avoid root file APIs unless your toolchain intentionally provides an `fs` shim.

Node-dependent root API (current behavior):

- `readUGEFile`

Browser-friendly alternatives:

- Use `parseUGE(buffer)` instead of `readUGEFile(path)`.
- Keep browser code on parser/song/audio/chips/scheduler modules and runtime-safe utility exports.

```typescript
import { noteToMidi } from '@beatbax/engine';
import { playFile } from '@beatbax/engine/node';
```

### Core Modules

- **`@beatbax/engine/parser`** - Parse BeatBax source code
- **`@beatbax/engine/song`** - Song resolution and ISM generation
- **`@beatbax/engine/audio`** - WebAudio playback engine
- **`@beatbax/engine/export`** - Export to JSON, MIDI, UGE
- **`@beatbax/engine/import`** - Import UGE files
- **`@beatbax/engine/chips`** - Game Boy APU emulation
- **`@beatbax/engine/scheduler`** - Deterministic tick scheduler

### Browser Support

The engine supports both Node.js and browser environments. Conditional browser mapping is provided for selected subpaths (for example song resolver modules), while runtime boundaries for root file APIs are documented above:

```typescript
// Automatic browser-safe imports
import { resolveSong } from '@beatbax/engine/song';  // Uses browser version in browsers
```

## Examples

### Using Effects

```javascript
const source = `
  inst lead type=pulse1 duty=50 env=gb:12,down,1

  effect vibLead = vib:4,3
  effect arpMinor = arp:3,7

  pat melody = C4<vibLead> E4 G4<arpMinor>:2

  channel 1 => inst lead pat melody
`;
```

### Export to hUGETracker

```typescript
import { exportUGE } from '@beatbax/engine/export';

await exportUGE(song, 'song.uge', {
  verbose: true  // Show detailed export info
});
```

### Import and Transform

```typescript
import { readUGE } from '@beatbax/engine/import';
import { exportMIDI } from '@beatbax/engine/export';

// Import UGE and export as MIDI
const song = await readUGE('input.uge');
await exportMIDI(song, 'output.mid');
```

## TypeScript Support

Full TypeScript definitions included:

```typescript
import type { AST, Song, Pattern, Instrument } from '@beatbax/engine';
```

## Resources

- [GitHub Repository](https://github.com/kadraman/beatbax)
- [Full Documentation](https://github.com/kadraman/beatbax/tree/main/docs)
- [Tutorial](https://github.com/kadraman/beatbax/blob/main/TUTORIAL.md)
- [CLI Tool](https://www.npmjs.com/package/@beatbax/cli)

## License

MIT © BeatBax Contributors
