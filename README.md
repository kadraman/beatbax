# BeatBax

[![CI](https://github.com/kadraman/beatbax/actions/workflows/ci.yml/badge.svg)](https://github.com/kadraman/beatbax/actions/workflows/ci.yml) [![Publish](https://github.com/kadraman/beatbax/actions/workflows/publish.yml/badge.svg)](https://github.com/kadraman/beatbax/actions/workflows/publish.yml)

BeatBax is a live-coding language and toolchain for creating retro-console chiptunes.
This repository contains an initial implementation focused on the Nintendo Game Boy (DMG-01) APU.

## Features
A concise feature summary:

- Live-coding language for Game Boy-style chiptunes (patterns, sequences, transforms)
- Authentic 4-channel GB APU model (pulse1, pulse2, wave, noise) with instrument envelopes
- Deterministic tick scheduler and live playback (browser WebAudio + CLI PCM renderer)
- Exports: validated ISM JSON, 4-track MIDI, hUGETracker v6, and WAV via CLI
- CLI features: headless playback, offline WAV rendering, per-channel export, sample-rate/duration controls
- Extensible toolchain: UGE import, plugin-friendly architecture, per-channel mute/solo, and tests

## Language examples

Each "song" can be defined in a `.bax` file with the following a minimal example.

```
# Set a top-level tempo instead of per-channel BPM
bpm 128

inst lead  type=pulse1 duty=50 env=gb:12,down,1
inst bass  type=pulse2 duty=25 env=gb:10,down,1
inst wave1 type=wave  wave=[0,3,6,9,12,9,6,3,0,3,6,9,12,9,6,3]
inst snare type=noise env=gb:12,down,1

pat A = C5 E4 G4 C5
pat B = C3 . G2 .

channel 1 => inst lead pat A
channel 2 => inst bass pat B
channel 3 => inst wave1 pat A:oct(-1)
channel 4 => inst snare pat "x . x x"

play
```

## CLI

The CLI provides a number of different sub-commands and options. 

**Important:** On Windows, npm has limitations passing flag arguments through `npm run` scripts. Use direct commands or `bin\beatbax` wrapper instead:

### Play Command Options

The `play` command supports browser and headless playback with PCM rendering:

- `--browser` — Launch browser-based playback (starts Vite dev server for web UI)
- `--headless` — Headless Node.js playback using multi-fallback audio system
- `--render-to <file>` — Render to WAV file using PCM renderer (stereo, 44100Hz, 16-bit)
- `--duration <seconds>` — Duration in seconds (default: auto-calculated from song length)
- `--channels <1-4>` — Export specific Game Boy channel only (1=pulse1, 2=pulse2, 3=wave, 4=noise)
- `--sample-rate <hz>` — Sample rate for rendering (default: 44100)

The CLI uses a hybrid approach with cascading fallbacks:
1. **speaker** module (optional, best performance if installed)
2. **play-sound** wrapper (uses system players, works cross-platform)
3. **PowerShell/afplay/aplay** direct system commands (most reliable fallback)

Install optional dependencies for best audio quality:
```powershell
npm install --save-optional speaker play-sound
```

WAV export uses a direct PCM renderer (`packages/engine/src/audio/pcmRenderer.ts`) that generates samples without WebAudio dependencies. It implements all 4 Game Boy channels with envelope support, duty cycle control, wavetable playback, and LFSR-based noise generation. Output is stereo by default and closely matches browser WebAudio quality.

### Export

All three export formats are fully implemented and tested:

- `export json <file> [--out <path>]` — Validated JSON export (ISM format)
- `export midi <file> [--out <path>]` — MIDI export (Type-1 SMF, 4 tracks)
- `export uge <file> [--out <path>]` — UGE v6 export (hUGETracker format for Game Boy)

The JSON exporter performs structural validation of the parsed AST and writes a normalized Intermediate Song Model (ISM) with metadata. The MIDI exporter creates a 4-track Standard MIDI File suitable for DAW import, mapping each Game Boy channel to a separate track. The UGE exporter generates valid hUGETracker v6 files that can be opened in hUGETracker and processed by uge2source.exe for Game Boy development.

### Examples

```powershell
# Play with headless audio playback
node bin/beatbax play songs/sample.bax --headless

# Play with browser-based playback
node bin/beatbax play songs/sample.bax --browser

# Render to WAV file (offline export without playback)
node bin/beatbax play songs/sample.bax --render-to output.wav

# Render with explicit duration (auto-calculated by default)
node bin/beatbax play songs/sample.bax --render-to output.wav --duration 30

# Export individual channels for debugging
node bin/beatbax play songs/sample.bax --render-to ch1.wav --channels 1

# Verify/validate a song file
node bin/beatbax verify songs/sample.bax

# Export to different formats
node bin/beatbax export json songs/sample.bax output.json
node bin/beatbax export midi songs/sample.bax output.mid
node bin/beatbax export uge songs/sample.bax output.uge
```
## Project layout

```
beatbax/
├── packages/                    # Monorepo packages
│   ├── engine/                  # Core BeatBax engine
│   │   ├── src/
│   │   │   ├── audio/           # WebAudio playback and PCM renderer
│   │   │   ├── chips/           # Chip emulation (Game Boy APU)
│   │   │   ├── export/          # JSON/MIDI/UGE/WAV exporters
│   │   │   ├── import/          # UGE file reader
│   │   │   ├── instruments/     # Instrument state management
│   │   │   ├── parser/          # Tokenizer and AST parser
│   │   │   ├── patterns/        # Pattern expansion and transforms
│   │   │   ├── scheduler/       # Deterministic tick scheduler
│   │   │   ├── sequences/       # Sequence expansion
│   │   │   ├── song/            # Song resolver and model
│   │   │   └── index.ts         # Main engine entry point
│   │   └── tests/               # Engine unit tests (25 suites)
│   │
│   └── cli/                     # Command-line interface
│       ├── src/
│       │   ├── cli.ts           # Main CLI implementation
│       │   ├── cli-dev.ts       # Development CLI runner
│       │   ├── cli-uge-inspect.ts  # UGE file inspector
│       │   ├── nodeAudioPlayer.ts  # Node.js audio playback
│       │   └── index.ts         # CLI exports
│       └── tests/               # CLI integration tests
│
├── apps/                        # Frontend applications
│   └── web-ui/                  # Browser-based live editor
│       ├── src/                 # Vite + TypeScript UI
│       ├── public/              # Static assets and songs
│       └── scripts/             # Build preparation scripts
│
├── bin/                         # Executable wrappers
│   └── beatbax                  # Main CLI entry point
│
├── scripts/                     # Build and tooling scripts
│   ├── add-js-extensions.cjs    # ESM import fixer
│   ├── check-dist.cjs           # Build validation
│   ├── cli-wrapper.js           # CLI argument passthrough
│   └── link-local-engine.cjs    # Local package linking
│
├── docs/                        # Documentation
│   ├── features/                # Feature specifications
│   │   ├── cli-audio-export.md
│   │   ├── dynamic-chip-loading.md
│   │   ├── effects-system.md
│   │   ├── hot-reload.md
│   │   ├── playback-via-cli.md
│   │   ├── plugin-system.md
│   │   └── ...
│   ├── scheduler.md             # Scheduler API docs
│   ├── uge-export-guide.md      # UGE export guide
│   ├── uge-reader.md            # UGE import documentation
│   ├── uge-v6-spec.md           # hUGETracker format spec
│   └── wav-export-guide.md      # WAV export documentation
│
├── songs/                       # Example .bax song files
├── examples/                    # Code examples and utilities
├── demo/                        # Legacy demo files
└── tmp/                         # Temporary build outputs
```

## Development

Install dependencies and run tests:

```powershell
npm install
npm run clean-all
npm run build-all
npm test
```

Run the CLI and play the sample song:

```powershell
npm run cli:dev
```

Run the Web UI and load the sample song:

```powershell
npm run web-ui:dev
```

Then browse to `http://localhost:5173` (Vite default) or the URL shown by the dev server.
 
### Local linking (developer convenience)

To use the project CLI globally during local development, create a local symlink with npm. From the repository root run:

```powershell
# build packages first
npm run build-all

# Create a global symlink to the root package's bin stub
npm link

# Now `beatbax` is available globally and uses the local code
beatbax --help
```

If you prefer to link only the CLI package instead of the whole repo, you can:

```powershell
cd packages\cli
npm link
cd ../..
# This will make the `beatbax` command use the local CLI package
beatbax --help
```

On Unix systems the `bin/beatbax` file is executable and contains a shebang so the command works after `npm link` or `npm install -g`.

## Contributing

Contributions welcome. Open issues for features, and PRs against `main`. Keep changes small and include tests for parser/expansion behavior.

## License

See `LICENSE` in this repository.
