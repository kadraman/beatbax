# @beatbax/cli

> Command-line interface for BeatBax chiptune live-coding language.

[![npm version](https://img.shields.io/npm/v/@beatbax/cli.svg)](https://www.npmjs.com/package/@beatbax/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Overview

BeatBax CLI provides command-line tools for working with BeatBax chiptune files:

- Play `.bax` songs
- Verify syntax
- Export to JSON, MIDI, and UGE (hUGETracker) formats
- Convert WAV files to raw NES DMC samples
- Inspect UGE files

Runtime note: Node playback internals are provided by `@beatbax/engine/node`, and the CLI consumes that API.

## Installation

```bash
npm install -g @beatbax/cli
```

Or use without installing:

```bash
npx @beatbax/cli play song.bax
```

## Usage

### Play a Song

```bash
beatbax play song.bax
```

Options:
- `--headless` - Play without UI (server environments)
- `--loop` - Loop playback

### Verify Syntax

```bash
beatbax verify song.bax
```

Checks for syntax errors without playing.

### Export Formats

**JSON (ISM - Intermediate Song Model):**
```bash
beatbax export json song.bax output.json
```

**MIDI (4-track Standard MIDI File):**
```bash
beatbax export midi song.bax output.mid
```

**UGE (hUGETracker v6):**
```bash
beatbax export uge song.bax output.uge
```

Export options:

- `--verbose` - Show detailed progress
- `--debug` - Show diagnostic information
- `--strict-gb` - Reject non-GB-compatible features

### Inspect UGE Files

```bash
beatbax inspect file.uge
```

Shows metadata, instruments, patterns, and effects from UGE files.

### Convert WAV to NES DMC

```bash
beatbax convert wav2dmc kick.wav --dmc-rate 15 --emit-inst
beatbax convert wav2dmc kick.wav --dmc-rate 10 --trim-silence -50 --tail-ms 12 --play
```

This creates a raw `.dmc` byte stream for NES DMC playback. The file does not store playback settings, so the chosen `--dmc-rate` must match the `dmc_rate=` value used by the instrument:

```bax
inst kick type=dmc dmc_rate=15 dmc_loop=false dmc_sample="local:kick.dmc"
```

Useful options:

- `--dmc-rate <0-15>` / `-q <0-15>` - DMC playback rate used for encoding and preview (`15` is the highest quality/default).
- `--dmc-loop` - Emit and preview the sample as a looping DMC instrument.
- `--emit-inst` - Print a ready-to-paste `inst ... type=dmc` line.
- `--play` - Preview the converted sample using the selected rate and loop setting.
- `--trim-silence <db>` / `--no-trim-silence` - Trim quiet tails before encoding to reduce DMC hiss.
- `--tail-ms <ms>` and `--fade-out-ms <ms>` - Keep and smooth the end of a trimmed sample.
- `--max-duration-ms <ms>` - Hard cap the source length before encoding.
- `--ntsc` / `--pal` - Select the DMC hardware rate table (`--ntsc` is the default).

## Example Workflow

```bash
# Create a song
cat > mysong.bax << EOF
chip gameboy
bpm 128

inst lead type=pulse1 duty=50 env=gb:12,down,1
inst bass type=pulse2 duty=25 env=gb:10,down,1

pat melody = C4 E4 G4 C5
pat bassline = C3 . G2 .

channel 1 => inst lead pat melody
channel 2 => inst bass pat bassline
EOF

# Verify syntax
beatbax verify mysong.bax

# Play it
beatbax play mysong.bax

# Export to multiple formats
beatbax export json mysong.bax mysong.json
beatbax export midi mysong.bax mysong.mid
beatbax export uge mysong.bax mysong.uge

# Inspect the exported UGE
beatbax inspect mysong.uge
```

## Help

Get help for any command:

```bash
beatbax --help
beatbax play --help
beatbax export --help
beatbax convert wav2dmc --help
```

## Programmatic Usage

You can also use the CLI programmatically:

```javascript
import { play, verify, exportFile } from '@beatbax/cli';

await play('song.bax');
const isValid = await verify('song.bax');
await exportFile('uge', 'song.bax', 'output.uge');
```

## Requirements

- Node.js 16+ (18+ recommended)
- For audio playback: speaker support (automatic on most platforms)

## Resources

- [GitHub Repository](https://github.com/kadraman/beatbax)
- [Full Documentation](https://github.com/kadraman/beatbax/tree/main/docs)
- [Tutorial](https://github.com/kadraman/beatbax/blob/main/TUTORIAL.md)
- [Engine Library](https://www.npmjs.com/package/@beatbax/engine)

## License

MIT © BeatBax Contributors
