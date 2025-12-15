# BeatBax

[![CI](https://github.com/kadraman/beatbax/actions/workflows/ci.yml/badge.svg)](https://github.com/kadraman/beatbax/actions/workflows/ci.yml) [![Publish](https://github.com/kadraman/beatbax/actions/workflows/publish.yml/badge.svg)](https://github.com/kadraman/beatbax/actions/workflows/publish.yml)

BeatBax is a small live-coding language and toolchain for creating retro-console chiptunes.
This repository contains an initial implementation focused on the Nintendo Game Boy audio model.

## Features
- Live pattern playback
- Authentic 4-channel Game Boy sound model (pulse1, pulse2, wave, noise)
- JSON + MIDI + UGE export
- Deterministic tick scheduler

- Unit tests for tokenizer and pattern expansion

## Quick examples (language)

The language supports `inst` definitions, `pat` definitions (including repeats and groups), channel routing, octave/transpose modifiers, and simple commands (`play`, `export`).

```
inst lead  type=pulse1 duty=50 env=gb:12,down,1
inst bass  type=pulse2 duty=25 env=gb:10,down,1
inst wave1 type=wave  wave=[0,3,6,9,12,9,6,3,0,3,6,9,12,9,6,3]
inst snare type=noise env=gb:12,down,1

pat A = C5 E4 G4 C5
pat B = C3 . G2 .

# Set a top-level tempo instead of per-channel BPM
bpm 140

channel 1 => inst lead pat A
channel 2 => inst bass pat B
channel 3 => inst wave1 pat A:oct(-1)
channel 4 => inst snare pat "x . x x"

play
export json "song.json"
export midi "song.mid"
export uge "song.uge"
```

## CLI

The CLI provides commands for playback, validation, and export. The entrypoint is in `packages/cli/src/cli.ts` and compiles to `packages/cli/dist/cli.js` (the root `bin/beatbax` delegates to the packaged CLI in `packages/cli`).

Common commands (PowerShell examples):

```powershell
# Play a song with browser-based playback
npm run cli -- play songs\sample.bax --browser

# Play (default behavior - shows message without auto-launching browser)
npm run cli -- play songs\sample.bax

# Play with headless options (v0.3.0+)
# Note: Headless playback requires native audio bindings (future feature)
npm run cli -- play songs\sample.bax --no-browser
npm run cli -- play songs\sample.bax --render-to output.wav --duration 30

# Verify/validate a song file
npm run cli -- verify songs\sample.bax

# Export to different formats
npm run cli -- export json songs\sample.bax --out songs\output.json
npm run cli -- export midi songs\sample.bax --out songs\output.mid
npm run cli -- export uge songs\sample.bax --out songs\output.uge
```

### Play Command Options (v0.3.0)

The `play` command now supports browser and headless playback flags:

- `--browser` — Launch browser-based playback (starts Vite dev server for web UI)
- `--no-browser` — Force headless Node.js playback (no browser window)
- `--backend <name>` — Audio backend: `auto` (default), `node-webaudio`, `browser`
- `--sample-rate <hz>` — Sample rate for headless context (default: 44100)
- `--render-to <file>` — Render to WAV file (offline) instead of real-time playback
- `--duration <seconds>` — Duration for offline rendering in seconds (default: 60)

**Note:** By default, `play` no longer automatically launches a browser. Use `--browser` to explicitly launch the Vite dev server and open browser-based playback. Headless playback and WAV rendering require native audio bindings not yet available in pure Node.js. The infrastructure is implemented; native backend support is planned as a post-MVP feature. See [docs/features/playback-via-cli-implementation-notes.md](docs/features/playback-via-cli-implementation-notes.md) for details.

During development you can run the TypeScript CLI directly:

```powershell
npm run cli:dev -- play songs\sample.bax
```

`npm run cli` builds then runs the compiled `dist/` CLI; the build includes a post-build step that rewrites import specifiers so the compiled ESM output runs cleanly under Node.

## Export

All three export formats are fully implemented and tested:

- `export json <file> [--out <path>]` — Validated JSON export (ISM format)
- `export midi <file> [--out <path>]` — MIDI export (Type-1 SMF, 4 tracks)
- `export uge <file> [--out <path>]` — UGE v6 export (hUGETracker format for Game Boy)

The JSON exporter performs structural validation of the parsed AST and writes a normalized Intermediate Song Model (ISM) with metadata. The MIDI exporter creates a 4-track Standard MIDI File suitable for DAW import, mapping each Game Boy channel to a separate track. The UGE exporter generates valid hUGETracker v6 files that can be opened in hUGETracker and processed by uge2source.exe for Game Boy development.

## Project layout

 - `packages/*/src/` — TypeScript sources (packages: `engine`, `cli`, `web-ui`)
   - `parser/` — tokenizer and parser (AST builder)
   - `patterns/` — pattern expansion + transposition utilities
   - `audio/` — Game Boy channel emulation and WebAudio playback engine
   - `scheduler/` — deterministic tick scheduler
   - `export/` — JSON/MIDI/UGE exporters
   - `import/` — UGE reader for importing hUGETracker files
   - `cli.ts`, `index.ts` — CLI and program entry
 - `tests/` — Jest unit tests (25 suites, 81 tests)
 - `songs/` — example .bax song files
 - `apps/web-ui/` — browser-based live editor and player

## Development

Install dev deps and run tests:

```powershell
npm install
npm test
```

Run the CLI:

```powershell
npm run build
npm run cli -- export json songs\sample.bax --out songs\output.json
```

Fast dev run (recommended for iteration):

```powershell
# Fast, no-build iteration — uses `tsx` under the hood
npm run cli:dev -- play songs\sample.bax
```

Run the web UI (local development):

```powershell
# Development server (apps/web-ui uses Vite)
npm --prefix apps/web-ui run dev
```

Then browse to `http://localhost:5173` (Vite default) or the URL shown by the dev server.
 
### Local linking (developer convenience)

To use the project CLI globally during local development, create a local symlink with npm. From the repository root run:

```powershell
# build packages first
npm run build

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

For a short scheduler API example and notes, see `docs/scheduler.md`.
