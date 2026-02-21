<p align="center"><img src="./media/logo-transparent-bg.png" alt="BeatBax" width="420"/></p>



# BeatBax

[![CI](https://github.com/kadraman/beatbax/actions/workflows/ci.yml/badge.svg)](https://github.com/kadraman/beatbax/actions/workflows/ci.yml) [![Deploy](https://github.com/kadraman/beatbax/actions/workflows/deploy-to-ionos.yml/badge.svg)](https://github.com/kadraman/beatbax/actions/workflows/deploy-to-ionos.yml)

**BeatBax** is a live-coding language and toolchain for creating retro-console chiptunes.
Initial implementation is focused on the Nintendo Game Boy (DMG-01) and NES (RP2A03) APUs.

## Features

- **Simple, live-coding language**: Including instruments, patterns, sequences and transforms.
- **Effects system**: 11 core effects fully implemented - panning, vibrato, portamento, pitch bend, pitch sweep, arpeggio, volume slides, tremolo, note cut, retrigger, and echo/delay with UGE/MIDI/WAV export
- **Web UI**: Monaco editor with syntax highlighting, live validation, split-pane layout (Phase 1), playback controls with pause/resume (Phase 2), and real-time position tracking with progress visualization (Phase 2.5 complete)
- **Authentic**: 4-channel GB APU model (pulse1, pulse2, wave, noise) with instrument envelopes
- **Scheduler**: Deterministic tick scheduler and live playback (browser WebAudio + CLI PCM renderer)
- **Exports**: validated ISM JSON, 4-track MIDI, hUGETracker v6, and WAV via CLI
- **CLI features**: headless playback, offline WAV rendering, per-channel export, sample-rate/duration controls
- **Extensible toolchain**: UGE import, plugin-friendly architecture, per-channel mute/solo, and tests
- **Instrument imports**: Reusable `.ins` libraries with relative/search-path resolution, cycle detection, and last-wins merging
- **Noise channel**: Direct 1:1 note mapping to hUGETracker (C2→index 0, C7→index 48), no automatic transpose

## Language examples

Each "song" can be defined in a `.bax` file with the following a minimal example:

```
song name "An example song"

chip gameboy
import "github:beatbax/instruments-gb/main/melodic.ins"  # Import reusable instruments

bpm 128

# Instruments for pulse, wave and noise (or import from .ins files above)
inst lead  type=pulse1 duty=50 env={"level":12,"direction":"down","period":1,"format":"gb"}
inst bass  type=pulse2 duty=25 env={"level":10,"direction":"down","period":1,"format":"gb"}
inst wave1 type=wave  wave=[0,3,6,9,12,9,6,3,0,3,6,9,12,9,6,3]
inst snare type=noise env={"level":12,"direction":"down","period":1,"format":"gb"}

# Named effect presets
effect wobble = vib:8,4              # Vibrato with depth 8, rate 4
effect fadeIn = volSlide:+5          # Volume fade in
effect arpMajor = arp:4,7            # Major chord arpeggio

# Patterns of notes with inline effects
pat melody = C5<wobble> E4<fadeIn> G4<arpMajor> C5
pat bass_pat = C3 . G2<port:C4,50> .  # Portamento glide to C4
pat drum_pat = "snare . snare snare"

# Sequences of patterns with default instruments
seq lead_seq  = melody:inst(lead) melody:inst(lead)
seq bass_seq  = bass_pat:inst(bass)*2
seq wave_seq  = melody:oct(-1):inst(wave1) melody:oct(-2):inst(wave1)
seq drums_seq = drum_pat*2

# Arrangements of sequences via slots that map to sound chip channels
arrange main = lead_seq | bass_seq | wave_seq | drums_seq

play auto repeat
```

## Effects System

The following effects have been implements:

- `pan` / `gb:pan` - Stereo panning (numeric -1.0 to 1.0 or GB enum L/C/R)
- `vib` - Vibrato (pitch modulation with depth, rate, waveform)
- `port` - Portamento (smooth pitch glides)
- `bend` - Pitch bend (musical pitch bending with delay parameter for hold-then-bend behavior)
- `sweep` - Pitch sweep (hardware-accurate GB NR10 frequency sweep for classic laser/sci-fi sounds)
- `arp` - Arpeggio (chord simulation via rapid note cycling)
- `volSlide` - Volume slides (dynamic volume automation)
- `trem` - Tremolo (amplitude modulation with depth, rate, waveform)
- `cut` - Note cut (gate notes after N ticks for staccato/percussive effects)
- `retrig` - Retrigger (rhythmic note retriggering with volume fadeout, WebAudio-only)
- `echo` - Echo/Delay (time-delayed feedback repeats for ambient effects, WebAudio-only)

See [songs/effects](songs/effects) for detailed examples of each effect.

**Export Notes:**
- UGE export supports: pan, vib, port, bend (approximated with portamento), sweep (instrument-level), arp, volSlide, cut
- UGE export does NOT support: retrig (no hUGETracker equivalent), trem (metadata-only), echo (no hUGETracker equivalent)
- Pitch bend: UGE export approximates bends with `3xx` portamento; warnings issued for non-linear curves and delay parameters
- Pitch sweep: Best used as instrument property (`inst sweep=...`) for GB hardware; inline `<sweep:...>` effects warn in UGE export
- **Retrigger and Echo**: Only work in WebAudio/browser playback; CLI/PCM renderer displays warnings but continues playback without these effects. Exporting songs with retrigger or echo to UGE will display warnings (no hUGETracker equivalent)

## CLI

The CLI provides a number of different sub-commands and options.

>On Windows, npm has limitations passing flag arguments through `npm run` scripts. Use direct commands or the `bin\beatbax` wrapper instead:

### Play Command Options

The `play` command supports browser and headless playback. In Node.js, it defaults to **headless playback**.

- `--browser` (or `-b`) - Launch browser-based playback (starts Vite dev server for Web UI)
- `--headless` (or `--no-browser`) - Force headless Node.js playback (default in Node)
- `--backend <name>` — Audio backend (choices: `auto` (default), `node-webaudio`, `browser`)
- `--sample-rate <hz>` (or `-r`) - Sample rate for headless playback (default: 44100)
- `--buffer-frames <n>` - Buffer length in frames for offline rendering (optional)

>Note on `play` directive flags:
>
>Songs may include a top-level `play` directive with optional flags: `auto` and `repeat`.
	- `play auto` requests the web UI to start playback when the file is loaded.
	- `play repeat` requests looping playback.
>
>The web UI will attempt to honor `play auto` but browsers commonly require a user gesture to unlock audible playback; in those cases the UI will prompt the user to enable audio.

The CLI performs structural validation of `.bax` files before running `play` or `export`. Definitions like an empty sequence line (`seq NAME =`) are considered errors — run `node bin/beatbax verify <file>` to see diagnostics and fix issues before exporting or playing.

The CLI uses a hybrid approach with cascading fallbacks:
1. **speaker** module (optional, best performance if installed)
2. **play-sound** wrapper (uses system players, works cross-platform)
3. **PowerShell/afplay/aplay** direct system commands (most reliable fallback)

**Volume Normalization:** CLI playback applies a 0.6x volume scaling factor to match browser auto-gain behavior, ensuring consistent loudness between headless and browser playback.

Install optional dependencies for best audio quality:
```powershell
npm install --save-optional speaker play-sound
```

WAV export uses a direct PCM renderer (`packages/engine/src/audio/pcmRenderer.ts`) that generates samples without WebAudio dependencies. It implements all 4 Game Boy channels with envelope support, duty cycle control, wavetable playback, and LFSR-based noise generation. Output is stereo by default and closely matches browser WebAudio quality.

### Inspect

Inspect `.bax` or `.uge` files and view their structure:

- `inspect <file>` — Show a text summary (default)
- `inspect <file> --json` (or `-j`) — Output detailed JSON structure

**For .bax files:**
```powershell
node bin/beatbax inspect songs/sample.bax
# Output: chip, tempo, pattern/sequence/instrument counts, metadata

# Detailed JSON (full AST)
node bin/beatbax inspect songs/sample.bax --json
```

**For .uge files:**
```powershell
node bin/beatbax inspect songs/example.uge
# Output: version, title, BPM, pattern/instrument counts

# Detailed JSON breakdown
node bin/beatbax inspect songs/example.uge --json
# Output: patterns with note names, instruments with readable fields,
#         wavetables in hex, orders, routines, statistics
```

The inspect command is useful for:
- Debugging exports (verify UGE files after export)
- Understanding hUGETracker file structure
- Extracting metadata from existing UGE files
- Validating pattern and instrument data

### Export

The following export formats are implemented:

- `export json <file> [output] [--out <path>]` — Validated JSON export (ISM format)
- `export midi <file> [output] [--out <path>] [--duration <seconds>] [--channels <list>]` — MIDI export (Type-1 SMF)
- `export uge <file> [output] [--out <path>]` — UGE v6 export (hUGETracker format for Game Boy)
- `export wav <file> [output] [--out <path>] [--duration <seconds>] [--channels <list>]` — WAV export (stereo, 44100Hz, 16-bit)

The JSON exporter performs structural validation of the parsed AST and writes a normalized Intermediate Song Model (ISM) with metadata. The MIDI exporter creates a multi-track Standard MIDI File suitable for DAW import, mapping each channel to a separate track. The UGE exporter generates valid hUGETracker v6 files that can be opened in hUGETracker and processed by uge2source.exe for Game Boy development. The WAV exporter uses a direct PCM renderer (`packages/engine/src/audio/pcmRenderer.ts`) that generates samples without WebAudio dependencies.

### Examples

```powershell
# Verify song
node bin/beatbax verify songs/sample.bax

# Play with headless audio playback (default)
node bin/beatbax play songs/sample.bax

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
│   │   │   ├── effects/         # Effects system (pan, vib, port, arp, volSlide, trem)
│   │   │   ├── expand/          # Reference/token expansion helpers
│   │   │   ├── export/          # JSON/MIDI/UGE/WAV exporters
│   │   │   ├── import/          # UGE file reader and remote cache
│   │   │   ├── instruments/     # Instrument state management
│   │   │   ├── parser/          # Parser and structured parse helpers
│   │   │   │   ├── peggy/       # Peggy grammar + generated parser
│   │   │   │   ├── structured.ts# Helpers to materialize structured AST nodes
│   │   │   │   └── tokenizer.ts # Legacy tokenizer stub (removed runtime impl)
│   │   │   ├── patterns/        # Pattern expansion and transforms
│   │   │   ├── scheduler/       # Deterministic tick scheduler
│   │   │   ├── sequences/       # Sequence expansion
│   │   │   ├── song/            # Song resolver and model (Node + browser)
│   │   │   ├── tests/           # Source-level unit tests
│   │   │   ├── util/            # Utility helpers (diag, parsing helpers)
│   │   │   └── index.ts         # Main engine entry point
│   │   └── tests/               # Engine unit tests (25+ suites)
│   │
│   └── cli/                     # Command-line interface
│       ├── src/
│       │   ├── cli.ts           # Main CLI implementation
│       │   ├── cli-dev.ts       # Development CLI runner
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
│   ├── issues/                  # Issue tracking documentation
│   ├── ast-schema.md            # AST schema documentation
│   ├── browser-safe-imports.md  # Browser import resolution
│   ├── browser-safe-resolver.md # Browser-safe resolver design
│   ├── import-security.md       # Import security documentation
│   ├── instruments.md           # Instrument definition reference
│   ├── metadata-directives.md   # Song metadata directives
│   ├── scheduler.md             # Scheduler API docs
│   ├── uge-export-guide.md      # UGE export guide
│   ├── uge-reader.md            # UGE import documentation
│   ├── uge-transpose.md         # UGE transposition guide
│   ├── uge-v6-spec.md           # hUGETracker format spec
│   ├── uge-writer.md            # UGE writer implementation
│   ├── volume-directive.md      # Volume directive reference
│   └── wav-export-guide.md      # WAV export documentation
│
├── schema/                      # Schema definitions
│   └── ast.schema.json          # JSON schema for AST
│
├── lib/                         # Libraries and resources
│   └── uge/                     # UGE test files and samples
│
├── media/                       # Project assets
│   └── logo-*.png               # BeatBax logos
│
├── songs/                       # Example .bax song files
├── examples/                    # Code examples and utilities
├── tests/                       # Root-level integration tests
└── tmp/                         # Temporary build outputs
```

## Security

BeatBax implements security measures to protect against malicious `.bax` files:

### Import Path Validation

Import statements are validated to prevent path traversal attacks:

- **Rejects `..` segments** - Prevents directory traversal like `"../../../etc/passwd"`
- **Rejects absolute paths by default** - Blocks access to system files like `"/etc/passwd"` or `"C:/Windows/System32/config/sam"`
- **Validates resolved paths** - Ensures imports stay within allowed directories (base directory and search paths)

**Safe import examples:**
```
import "local:lib/common.ins"              # ✅ Relative path
import "local:instruments/drums.ins"       # ✅ Subdirectory
import "github:user/repo/branch/file.ins"  # ✅ Remote GitHub import
import "https://example.com/drums.ins"     # ✅ Remote HTTPS import
```

**Blocked attempts:**
```
import "lib/common.ins"              # ❌ Missing local: prefix
import "../../../etc/passwd"         # ❌ Path traversal
import "/etc/passwd"                 # ❌ Absolute path (unless allowAbsolutePaths: true)
import "C:/Windows/System32/file"    # ❌ Absolute path
```

For more details and advanced configuration, see [Import Security Documentation](docs/import-security.md).

**Important:** Never execute untrusted `.bax` files without reviewing their import statements.

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

**Web UI Features (Phase 1):**
- Monaco editor with comprehensive syntax highlighting for `.bax` files
- 15+ token types with VS Code-compatible `beatbax-dark` theme
- Live validation with red squiggles for undefined instruments, patterns, and sequences
- Split-pane layout with resizable editor and output panels (persists to localStorage)
- Event-driven architecture with modular, testable components
- Autocomplete for keywords, notes, and BeatBax language features
- See [apps/web-ui/PHASE1-README.md](apps/web-ui/PHASE1-README.md) and [docs/web-ui-syntax-highlighting.md](docs/web-ui-syntax-highlighting.md) for details

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
