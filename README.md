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

pat melody = C5 E4 G4 C5
pat bass_pat = C3 . G2 .

channel 1 => inst lead pat melody
channel 2 => inst bass pat bass_pat
channel 3 => inst wave1 pat melody:oct(-1)
channel 4 => inst snare pat "x . x x"

play
```

## CLI

The CLI provides a number of different sub-commands and options. 

**Important:** On Windows, npm has limitations passing flag arguments through `npm run` scripts. Use direct commands or `bin\beatbax` wrapper instead:

### Play Command Options

The `play` command supports browser and headless playback:

- `--browser` — Launch browser-based playback (starts Vite dev server for web UI)
- `--headless` — Headless Node.js playback using multi-fallback audio system
- `--sample-rate <hz>` — Sample rate for headless playback (default: 44100)

Note on `play` directive flags:
- Songs may include a top-level `play` directive with optional flags: `auto` and `repeat`.
	- `play auto` requests the web UI to start playback when the file is loaded.
	- `play repeat` requests looping/continuous playback.
	The web UI will attempt to honor `play auto` but browsers commonly require a user gesture
	to unlock audible playback; in those cases the UI will prompt the user to enable audio.

Validation note: the CLI performs structural validation of `.bax` files before running `play` or `export`. Definitions like an empty sequence line (`seq NAME =`) are considered errors — run `node bin/beatbax verify <file>` to see diagnostics and fix issues before exporting or playing.

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

All export formats are fully implemented and tested:

- `export json <file> [output] [--out <path>]` — Validated JSON export (ISM format)
- `export midi <file> [output] [--out <path>] [--duration <seconds>] [--channels <1-4>]` — MIDI export (Type-1 SMF, 4 tracks)
- `export uge <file> [output] [--out <path>]` — UGE v6 export (hUGETracker format for Game Boy)
- `export wav <file> [output] [--out <path>] [--duration <seconds>] [--channels <1-4>]` — WAV export (stereo, 44100Hz, 16-bit)

The JSON exporter performs structural validation of the parsed AST and writes a normalized Intermediate Song Model (ISM) with metadata. The MIDI exporter creates a 4-track Standard MIDI File suitable for DAW import, mapping each Game Boy channel to a separate track. The UGE exporter generates valid hUGETracker v6 files that can be opened in hUGETracker and processed by uge2source.exe for Game Boy development. The WAV exporter uses a direct PCM renderer (`packages/engine/src/audio/pcmRenderer.ts`) that generates samples without WebAudio dependencies.

### Examples

```powershell
# Verify song
node bin/beatbax verify songs/sample.bax

# Play with headless audio playback
node bin/beatbax play songs/sample.bax --headless

# Play with browser-based playback
node bin/beatbax play songs/sample.bax --browser

# Render to WAV file (offline export)
node bin/beatbax export wav songs/sample.bax output.wav

# Render with explicit duration (auto-calculated by default)
node bin/beatbax export wav songs/sample.bax output.wav --duration 30

# Export individual channels for debugging
node bin/beatbax export wav songs/sample.bax ch1.wav --channels 1

# Verify/validate a song file
node bin/beatbax verify songs/sample.bax

# Export to different formats
node bin/beatbax export json songs/sample.bax output.json
node bin/beatbax export midi songs/sample.bax output.mid
node bin/beatbax export uge songs/sample.bax output.uge
node bin/beatbax export wav songs/sample.bax output.wav
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

### Engine development workflow

When making changes to the engine that need to appear in the web UI:

```powershell
# Terminal 1: Keep the web UI dev server running
npm run web-ui:dev

# Terminal 2: After making changes to packages/engine/src/
npm run engine:build

# Back to Terminal 1: Press 'r' + Enter to restart the dev server
# This forces Vite to re-optimize dependencies and pick up engine changes
```

**Note:** The web UI uses npm workspace links, so you don't need to run `link-local-engine.cjs` for web UI development. That script is only needed for CLI usage.

**Alternative (if restart doesn't work):**
```powershell
cd apps/web-ui
npm run dev:clean  # Uses --force flag to bypass Vite cache
```

**For CLI development:**
```powershell
# After engine changes
npm run engine:build
node scripts/link-local-engine.cjs  # Copies dist to node_modules
node bin/beatbax play songs/sample.bax --headless
```
 
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
