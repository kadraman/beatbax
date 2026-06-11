[![CI](https://github.com/kadraman/beatbax/actions/workflows/ci.yml/badge.svg)](https://github.com/kadraman/beatbax/actions/workflows/ci.yml) [![Deploy Now: Orchestration](https://github.com/kadraman/beatbax/actions/workflows/beatbax-orchestration.yaml/badge.svg)](https://github.com/kadraman/beatbax/actions/workflows/beatbax-orchestration.yaml)

<p align="center">
  <img src="./media/logo-transparent-bg.png" alt="BeatBax" width="420"/>
</p>
<p align="center">
  <a href="https://app.beatbax.com">
    <img src="https://img.shields.io/badge/Try-BeatBax-blue?style=for-the-badge">
  </a>
</p>

> **Desktop-first split:** BeatBax Desktop is the primary full-featured client in progress at `apps/desktop`, while `apps/web-ui` now targets a lighter web-lite browser experience.

# BeatBax

**BeatBax** is a creative toolchain for making chiptune music in the style of classic 8/16 bit computers and game consoles. Instead of using a Tracker or DAW to develop your songs, you write your songs using a simple, but powerful grammar that describe your instruments, melodies, basslines, and beats - and BeatBax brings them to life with authentic retro sound. **BeatBax** currently supports Nintendo Game Boy (DMG-01) APU and Nintendo Entertainment System (NES) Ricoh 2A03 APU as built-in sound chips. Additional sound chip backends can still be added as plugins (see [ROADMAP](ROADMAP.md) for further details of currently implemented and future sound chips).

<p align="center">
  <img src="./media/web-ui-screenshot-1.png" alt="Alt text" width="600"/>
  <br/>
  <em>An example screenshot of the BeatBax Web-UI.</em>
</p>

Creating chiptunes is rewarding but can be hard and time-consuming, so the BeatBax App includes **BeatBax Copilot*** an AI Assistant (with BYOK model) to help you write your song. This is not a replacement for creativity - don't expect it to write you a classic chiptunes song from scratch - but it can certainly help with the construction and editing of your song, and understanding of good practices and techniques for getting the most out of the BeatBax replace.

One of the main aims in creating **BeatBax** was to be able to aid in the rapid creation of
songs for Homebrew games. So where possible, BeatBax songs can be exported into
Tracker formats that game libraries can consume. For example [hUGETracker](https://nickfa.ro/wiki/HUGETracker) (UGE) format for the Game Boy, or [FamiTracker](http://famitracker.com/) (Txt) for the NES. Standard output formats are also supported including WAV, MIDI and in some cases VGM - with additional chip specific output formats on the (see [ROADMAP](ROADMAP.md)

## Features

- **Simple text-based replace** — create instruments, write melodies, basslines, and beats (in `.bax` files) using a simple but powerful BeatBax grammar.
- **Authentic retro sound** — Chip specific implementation, e.g.: 4-channel Game Boy DMG-01 emulation (pulse, wave, noise) and 5-channel NES Ricoh 2A03 emulation (pulse, triangle, noise, DMC) with hardware-accurate envelopes, duty cycles, and software macros
- **Built-in effects** — vibrato, arpeggio, portamento, pitch bend, sweep, volume slide, tremolo, pan, echo, note cut, and retrigger
- **Reusable instrument libraries** — share instruments across songs via `.ins` files; import locally or directly from GitHub
- **Export formats** — MIDI, WAV, ISM JSON supported for all chips and one (or more) export format for each chip, e.g.hUGETracker v6 (`.uge`) for GameBoy, FamiTracker Text for NES.
- **Desktop IDE (in progress)** — Electron + React client with native file dialogs, recent files, and full desktop-first foundations
- **Web-lite browser client** — simplified try-in-browser editor/playback experience for quick demos and lightweight edits
- **BeatBax Copilot*** — AI assistant that writes and edits songs from natural-language descriptions (BYOK)
- **CLI tool** — `play`, `verify`, `export`, and `inspect` for scripted and headless workflows
- **Extensible architecture** — additional chip backends (C64 SID, Genesis YM2612) can be added as plugins without changing your songs

Game Boy and NES are available immediately from `@beatbax/engine`; optional chips such as SMS and Spectrum remain host-registered plugins.

> *BeatBax Copilot requires your own API key from any OpenAI-compatible provider (including local LLM) - no API key is included. Your own API key will only be stored locally (in browser or app) for use with by BeatBax Copilot.

## Grammar

A `.bax` song defines instruments, effects, patterns, sequences, and a channel arrangement.

```bash
song name "An example song"

chip gameboy
bpm 128

# Import a shared instrument library (local or remote)
import "github:kadraman/beatbax-instruments/main/melodic.ins"

# Instruments
inst lead  type=pulse1 duty=50  env={"level":12,"direction":"down","period":1,"format":"gb"}
inst bass  type=pulse2 duty=25  env={"level":10,"direction":"down","period":1,"format":"gb"}
inst wave1 type=wave   wave=[0,2,3,5,6,8,9,11,12,11,9,8,6,5,3,2,0,2,3,5,6,8,9,11,12,11,9,8,6,5,3,2]
inst snare type=noise  env={"level":12,"direction":"down","period":1,"format":"gb"}

# Named effect presets
effect wobble   = vib:8,4       # Vibrato: depth 8, rate 4
effect fadeIn   = volSlide:+5   # Volume fade-in
effect arpMajor = arp:4,7       # Major chord arpeggio (root + major 3rd + 5th)

# Patterns
pat melody   = C5<wobble> E4<fadeIn> G4<arpMajor> C5
pat bass_pat = C3 . G2<port:C4,50> .
pat drum_pat = snare . snare snare

# Sequences
seq lead_seq  = melody:inst(lead) melody:inst(lead)
seq bass_seq  = bass_pat:inst(bass)*2
seq wave_seq  = melody:oct(-1):inst(wave1) melody:oct(-2):inst(wave1)
seq drums_seq = drum_pat*2

# Channel arrangement
channel 1 => inst lead seq lead_seq
channel 2 => inst bass seq bass_seq
channel 3 => inst wave1 seq wave_seq
channel 4 => inst snare seq drums_seq

play auto repeat
```

Please see the [TUTORIAL](TUTORIAL.md) for more details on how to use the BeatBax grammar.

---

## Instruments

TBD

---

## Effects

BeatBax songs can make use of built-in instrument and

| Effect | Syntax | Description |
|--------|--------|-------------|
| Pan | `pan:L\|C\|R` or `gb:pan:-1.0…1.0` | Stereo panning |
| Vibrato | `vib:<depth>,<rate>[,<wave>[,<dur>[,<delay>]]]` | Pitch LFO |
| Portamento | `port:<speed>` | Smooth pitch glide from previous note |
| Pitch bend | `bend:<semitones>[,<curve>[,<delay>[,<time>]]]` | Musical pitch bend |
| Sweep | `sweep:<time>,<dir>,<shift>` | GB hardware NR10 frequency sweep |
| Arpeggio | `arp:<offset1>,<offset2>[,…]` | Rapid note cycling to simulate chords |
| Volume slide | `volSlide:<±amount>` | Per-tick volume automation |
| Tremolo | `trem:<depth>,<rate>[,<wave>]` | Amplitude LFO |
| Note cut | `cut:<ticks>` | Gate note after N ticks |
| Retrigger | `retrig:<rate>[,<vol>]` | Rhythmic note restart (WebAudio only) |
| Echo | `echo:<delay>,<feedback>` | Feedback delay (WebAudio only) |

Annotated examples for effect are in chip specific directories [songs/features/**](songs/features/).


**Export compatibility:**

| Effect | JSON | MIDI | UGE | FamiTracker Text | WAV |
|--------|------|------|-----|-------------------|-----|
| pan, vib, port, arp, volSlide, cut | ✓ | ✓ | ✓ | ✓ | ✓ |
| bend | ✓ | ✓ | Approx. (3xx portamento) | 3xx portamento | ✓ |
| sweep | ✓ | ✓ | Instrument-level only | Instrument-level only | ✓ |
| trem | ✓ | ✓ | Metadata only | Metadata only | ✓ |
| retrig, echo | ✓ | ✓ | — | — | — |


---

## CLI

> **Windows note:** npm has limitations passing flag arguments through `npm run`. Use `node bin/beatbax` or the `bin\beatbax` wrapper directly.

### Commands

```powershell
# Validate a song file
node bin/beatbax verify songs/sample.bax

# Play (headless by default in Node.js)
node bin/beatbax play songs/sample.bax
node bin/beatbax play songs/sample.bax --browser   # open Web UI instead

# Export
node bin/beatbax export json songs/sample.bax output.json
node bin/beatbax export midi songs/sample.bax output.mid
node bin/beatbax export uge  songs/sample.bax output.uge
node bin/beatbax export wav  songs/sample.bax output.wav

# Convert a WAV into a raw NES DMC sample
node bin/beatbax convert wav2dmc samples/wav/low_kick.wav --dmc-rate 15 --emit-inst

# Inspect a .bax or .uge file
node bin/beatbax inspect songs/sample.bax
node bin/beatbax inspect output.uge --json
```

### Play options

| Flag | Description |
|------|-------------|
| `--browser` / `-b` | Launch browser-based playback via Vite |
| `--headless` | Force Node.js headless playback (default) |
| `--backend <name>` | `auto` (default), `node-webaudio`, `browser` |
| `--sample-rate <hz>` / `-r` | PCM sample rate (default: 44100) |
| `--buffer-frames <n>` | Offline render buffer size |

### Export options

| Flag | Applies to | Description |
|------|-----------|-------------|
| `--out <path>` | all | Output file path |
| `--duration <seconds>` | midi, wav | Override auto-calculated duration |
| `--channels <list>` | midi, wav | Export only listed channels (e.g. `1,3`) |

### NES DMC sample conversion

`convert wav2dmc` turns a 16-bit mono/stereo PCM WAV into a raw NES `.dmc` sample for `type=dmc` instruments:

```powershell
node bin/beatbax convert wav2dmc samples/wav/low_kick.wav --dmc-rate 15 --emit-inst --play
```

The output is a headerless DMC byte stream. Playback settings live on the BeatBax instrument, so the converter prints the matching line when you pass `--emit-inst`:

```bax
inst kick type=dmc dmc_rate=15 dmc_loop=false dmc_sample="local:samples/wav/kick.dmc"
```

Useful controls:

| Flag | Description |
|------|-------------|
| `--dmc-rate <0-15>` / `-q` | DMC rate used for encoding and playback preview. `15` is fastest/highest quality; lower values are darker and shorter-bandwidth. |
| `--dmc-loop` | Use `dmc_loop=true` in emitted snippets and loop the preview. |
| `--trim-silence <db>` / `--no-trim-silence` | Trim quiet WAV tails before encoding; this is often the most useful control for reducing DMC hiss. |
| `--tail-ms <ms>` | Keep a small amount of audio after the last above-threshold sample. |
| `--fade-out-ms <ms>` | Fade the end before encoding to avoid noisy/clicky tails. |
| `--max-duration-ms <ms>` | Hard cap the source duration before encoding. |
| `--ntsc` / `--pal` | Select the DMC hardware rate table (`--ntsc` is default). |

### Headless audio fallback chain

1. `speaker` npm module (best quality — install with `npm install --save-optional speaker`)
2. `play-sound` wrapper (cross-platform system players)
3. System command (`PowerShell`/`afplay`/`aplay`)

### WAV export

WAV export uses a direct PCM renderer (`packages/engine/src/audio/pcmRenderer.ts`) with no WebAudio dependency. It implements all four Game Boy channels (duty, envelope, wavetable, LFSR noise) and outputs stereo 44100 Hz 16-bit PCM. See [docs/exports/wav-export-guide.md](docs/exports/wav-export-guide.md).

---

## Desktop

Start the desktop client during development:

```powershell
npm run desktop:dev
```

Current desktop scope includes the Electron shell, native menu + file I/O plumbing, a React editor workspace, playback controls, and packaging workflow scaffolding.

## Web UI

The browser app is now the **web-lite** profile: a lighter try-in-browser surface that keeps editing, validation, and playback while desktop-only IDE capabilities continue moving into `apps/desktop`.

Start the development server:

```powershell
npm run web-ui:dev
# → http://localhost:5173
```

Features:

- Monaco editor with `.bax` syntax highlighting (15+ token types, dark/light themes)
- Live validation — red squiggles for undefined instruments, patterns, and sequences
- Resizable split-pane layout (state persisted to `localStorage`)
- Transport bar: Play, Pause, Stop, and ⚡ **Live mode** (800 ms debounce, auto-replays on edit)
- Menu bar with File, View, Playback, Export, and Help menus; full keyboard shortcut registry
- **New Song Wizard** — File → New and toolbar New open a guided modal that uses enabled chip plugins for metadata/templates, and auto-opens once on first run
- Unified channel mixer with per-channel mute, solo, and volume controls
- **CodeLens inline actions** — `▶ Preview` and `↺ Loop` above every `pat`, `seq`, and `effect`; five note buttons (`C3`–`C7`) above every `inst` for instant timbre checks
- **Play selected** (`Ctrl+Shift+Space`) — play one or more selected `pat`/`seq` lines simultaneously, each on its own channel
- **Command palette** (`F1` or `Ctrl+Alt+P`) — export, validate, generate snippets, format, mute/solo by name
- **BeatBax Copilot** — AI chat panel backed by any OpenAI-compatible endpoint (OpenAI, Groq, Ollama, LM Studio). Injects editor content and active diagnostics as context. **Edit mode** auto-applies generated code with up to 4 self-correction retries; **Ask mode** answers without touching the editor
- **Settings panel** — unified modal (`Ctrl+,` or `View → Settings…`) with sections for General, Editor, Playback, Features, AI Copilot, and Advanced; most changes apply live without a page reload (exceptions: Auto-save and Audio backend / Sample rate take effect after reload)


---

## Project layout

```
beatbax/
├── apps/
│   ├── desktop/               # BeatBax Desktop Client
│   └── web-ui/                # BeatBax Browser Client
|
├── packages/
│   ├── engine/                # Live-coding language and runtime for retro console chiptunes
│       └── chip-
│   └── cli/                   # Command-line interface for BeatBax chiptune live-coding language.
│   └── plugins/
│       └── chip-sms           # Sega Master System / Game Gear SN76489 PSG chip plugin for BeatBax
│       └── chip-spectrum-128  # ZX Spectrum 128 / Amstrad CPC AY-3-8912 PSG chip plugin for BeatBax
│       └── ...
│       └── export-famitracker # FamiTracker text exporter plugin for BeatBax (.txt format)
│       └── export-vgm         # VGM (Video Game Music) exporter plugin for BeatBax — SN76489 PSG (SMS/Game Gear)
│       └── ...
│
├── bin/
│   └── beatbax                # CLI entry point (Node shebang wrapper)
│
├── songs/                     # Example .bax files
├── docs/                      # Documentation
├── schema/
│   └── ast.schema.json        # JSON Schema for the BeatBax AST
│
├── tests/                     # Root-level integration tests
├── scripts/                   # Build and tooling scripts
├── examples/                  # Standalone code examples
└── media/                     # Logo and promotional assets
```

---

## Documentation index

| Topic | Location |
|-------|----------|
| Tutorial | [TUTORIAL.md](TUTORIAL.md) |
| Roadmap | [ROADMAP.md](ROADMAP.md) |
| Dev notes | [DEVNOTES.md](DEVNOTES.md) |
| Contributing guide | [CONTRIBUTING.md](CONTRIBUTING.md) |

---

## Development

```powershell
npm install
npm run clean-all
npm run build-all
npm test
```

### Workspace scripts

| Script | Description |
|--------|-------------|
| `npm run engine:build` | Build `@beatbax/engine` |
| `npm run cli:build` | Build `@beatbax/cli` |
| `npm run web-ui:dev` | Start Web UI dev server |
| `npm run desktop:dev` | Start the desktop Electron + React app |
| `npm run desktop:build` | Build the desktop app bundles |
| `npm run desktop:test` | Run desktop unit tests |
| `npm run desktop:dist` | Create desktop installers |
| `npm run cli:dev` | Build engine + run CLI dev entry |
| `npm run build-all` | Full monorepo build |
| `npm run clean-all` | Clean all dist outputs |
| `npm test` | Run all test suites |

### Engine → Web UI workflow

```powershell
# Terminal 1
npm run web-ui:dev

# Terminal 2 — after changing packages/engine/src/
npm run engine:build
# Then press r+Enter in Terminal 1 to restart Vite
```

If the restart doesn't pick up changes:

```powershell
cd apps/web-ui && npm run dev:clean   # --force bypasses Vite cache
```

### Engine → CLI workflow

```powershell
npm run engine:build
node scripts/link-local-engine.cjs   # copies dist into node_modules
node bin/beatbax play songs/sample.bax --headless
```

### Global symlink

```powershell
npm run build-all
npm link
beatbax --help
```

---

## Contributing

Contributions welcome. Open issues for features and PRs against `main`. Keep changes small and include tests for parser/expansion behaviour. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
