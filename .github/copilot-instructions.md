PROJECT:
BeatBax - A concise, testable, and extensible live-coding language and runtime for retro console chiptunes.
Primary target: the Nintendo Game Boy (DMG-01) APU.

**MVP STATUS: ✅ COMPLETE** (All Day 1-3 deliverables implemented and tested)

Distribution targets (DELIVERED):
- ✅ `engine-core` as an npm library (portable, ESM-first, usable in browser/Electron/CLI)
- ✅ A minimal CLI that can `play`, `verify`, and `export` (json, midi, uge)
- ✅ UGE file import and export (read existing hUGETracker files, export to v6 format)

Optional frontends (nice-to-have, post-MVP):
- Web UI for live editing and playback (demo included in `/demo`)
- Electron desktop UI for integrated workflow

Core MVP guarantees (IMPLEMENTED):
- ✅ Deterministic, tick-accurate scheduling for repeatable playback
- ✅ A faithful, modular 4-channel Game Boy APU model (pulse1, pulse2, wave, noise)
- ✅ Live pattern playback with instrument and temporary instrument overrides
- ✅ Sequence expansion, transforms, and channel routing
- ✅ Reliable exports: JSON (ISM), MIDI (4-track), and valid hUGETracker v6 `.UGE`
- ✅ UGE file reader supporting versions 1-6 with full metadata and pattern extraction

Authority and constraints for Copilot:
1. Treat `/docs/**/*.md` as the authoritative spec—always read new feature specs there.
2. Implement only features present in this file and `/docs/features/` unless the user explicitly approves additions.
3. Preserve AST stability and backward compatibility unless a breaking change is requested and approved.
4. Follow the 3-day MVP breakdown below; track progress via the todo list tool.

---------------------------------
FUTURE EXPANSION (NOT MVP)
---------------------------------
Design the engine so additional audio backends can be added as plugins. Targets for future expansion include:
- C64 SID (3 voices, ADSR, waveforms, filters)
- Sega Genesis YM2612 + PSG
- NES APU
- PC-Engine

Architectural requirements for expandability:
- Backend plugin API for chip/channel models (see `/docs/features/plugin-system.md`)
- Clearly separated instrument definitions per chip
- Stable ISM exports so tools can consume song data independent of backend

Implementations of these extra chips are explicitly out-of-scope for the MVP but must be feasible without reworking the AST or core scheduler.

**Plugin System Status:** Comprehensive feature document created (`/docs/features/plugin-system.md`). Plugins will be published as `@beatbax/plugin-chip-nes`, `@beatbax/plugin-chip-sid`, etc., and auto-discovered by the CLI. The spec covers npm distribution, dynamic loading strategies (Node.js, bundlers, CDN), CLI auto-discovery, and security considerations. The original `dynamic-chip-loading.md` has been merged into this unified spec.

---------------------------------
MVP SCOPE (STRICT)
---------------------------------

Game Boy channels (fixed 4):
1. Pulse 1 — duty, envelope, (sweep optional post-MVP)
2. Pulse 2 — duty, envelope
3. Wave — 16 × 4-bit wave RAM playback
4. Noise — LFSR-based noise with envelope

Language surface (required):
- Top-level `chip` directive to select the audio backend (default: `gameboy`)
- Top-level `bpm` directive to set tempo (default: `120`)
- Top-level `time` or `stepsPerBar` directive to set beats per bar (both supported; default: `4`)
- Top-level `ticksPerStep` directive to set tick resolution per step (default: `16`)
- `inst` definitions for instruments (Game Boy instrument fields)
- `pat` definitions containing note/rest/instrument-change tokens and temporary overrides `inst(name,N)`
- `seq` definitions with pattern order and transforms (`A:inst(bass)` style)
- Inline transforms for patterns: `oct(+N)`, `inst(name)`, `rev`, `slow`, `fast`, etc.
- Top-level `channel` declarations that map a sequence to a channel and define `bpm` and default `inst`
- `play` command to start deterministic live playback
- `export` commands: `json`, `midi`, `uge`

Design rules:
- Patterns must be channel-agnostic. Sequences are ordered lists of patterns (and may include transforms).
- Channels consume sequences; channel-level defaults and overrides are applied during expansion.
- Transforms are compile-time operations applied during sequence/pattern expansion (not runtime hacks).

---------------------------------
SYNTAX BASELINE
---------------------------------

chip gameboy

bpm 128
time 4

inst lead  type=pulse1 duty=50 env=12,down
inst bass  type=pulse2 duty=25 env=10,down
inst wave1 type=wave   wave=[0,3,6,9,12,9,6,3,0,3,6,9,12,9,6,3]
inst sn    type=noise  env=12,down

pat A    = C5 E5 G5 C6
pat B    = C3 . G2 .
pat FILL = inst sn C6 C6 inst(hat,2) C6 C6

seq main  = A B A FILL A
seq intro = A:inst(bass) B

channel 1 => inst lead  seq main
channel 2 => inst bass  seq main:oct(-1)
channel 3 => inst wave1 seq intro
channel 4 => inst sn    seq fill

play

export json "song.json"
export midi "song.mid"
export uge  "song.uge"

---------------------------------
CURRENT PROJECT STRUCTURE
---------------------------------

/src
  parser/
    tokenizer.ts          # ✅ Complete
    parser.ts             # ✅ Complete
    ast.ts                # ✅ Complete
  patterns/
    expand.ts             # ✅ Complete (pattern expansion)
    index.ts              # ✅ Complete
  sequences/
    expand.ts             # ✅ Complete (sequence expansion)
  song/
    resolver.ts           # ✅ Complete
    songModel.ts          # ✅ Complete
  instruments/
    instrumentState.ts    # ✅ Complete
  scheduler/
    tickScheduler.ts      # ✅ Complete (deterministic)
    types.d.ts            # ✅ Complete
    index.ts              # ✅ Complete
  chips/
    gameboy/
      pulse.ts            # ✅ Complete (duty, envelope)
      wave.ts             # ✅ Complete (16×4-bit wavetable)
      noise.ts            # ✅ Complete (LFSR)
      apu.ts              # ✅ Complete
      periodTables.ts     # ✅ Complete
  audio/
    playback.ts           # ✅ Complete (WebAudio engine)
    bufferedRenderer.ts   # ✅ Complete (OfflineAudioContext)
  export/
    jsonExport.ts         # ✅ Complete
    midiExport.ts         # ✅ Complete (4-track SMF)
    ugeWriter.ts          # ✅ Complete (hUGETracker v6)
    index.ts              # ✅ Complete
  import/
    uge/
      uge.reader.ts       # ✅ Complete (UGE v1-6 reader)
    ugeReader.ts          # ✅ Complete (legacy compatibility)
    index.ts              # ✅ Complete
  cli.ts                  # ✅ Complete (play, verify, export)
  cli-dev.ts              # ✅ Complete (development CLI)
  cli-uge-inspect.ts      # ✅ Complete (UGE inspection tool)
  index.ts                # ✅ Complete (main library export)

/docs
  scheduler.md                    # Scheduler API and usage
  uge-export-guide.md             # UGE export user guide
  uge-reader.md                   # UGE import documentation
  uge-writer.md                   # UGE writer implementation details
  uge-v6-spec.md                  # hUGETracker v6 binary format spec
  features/
    dynamic-chip-loading.md       # Post-MVP: Multi-chip backend system

/tests                            # ✅ 25 test suites, 81 tests passing
/demo                             # ✅ Browser-based playback demo

Note: Documentation uses lowercase-with-hyphens naming convention.
Copilot MUST scan `/docs/features/` for new feature specs.

---------------------------------
LANGUAGE EXPANSION PIPELINE
---------------------------------

1. Parse `pat` definitions into tokenized event lists (notes, rests, inline `inst` tokens, temporary overrides).
2. Parse `seq` definitions into ordered pattern references with attached transforms.
3. Expand sequences into a flattened event stream, applying sequence-level transforms first.
4. Resolve pattern-level instrument logic (inline `inst`, `inst(name,N)` temporary overrides).
5. Apply channel-level defaults and sequence-level overrides.
6. Emit final per-channel event lists (ISM) suitable for playback or export.
7. Validate the ISM before exports and playback.

---------------------------------
DAY 1 TARGET
---------------------------------

Deliverables (Day 1 — parser + ISM + JSON export):
- A working tokenizer and parser that recognize at minimum: `inst`, `pat`, `seq`, `channel`, `export`, and a top-level `chip` directive.
- Complete AST type definitions for all node kinds used by the language.
- Pattern parsing that yields event tokens: notes (C3–B8), rests (`.`), inline `inst` changes, and `inst(name,N)` temporary overrides.
- Sequence parsing supporting pattern references and basic transforms.
- Sequence + pattern expansion into a validated Intermediate Song Model (ISM) per-channel.
- JSON export of the ISM (`export json`), suitable for tooling and round-tripping.
- Unit tests covering:
  - Tokenizer correctness
  - Note → frequency mapping
  - Pattern expansion and temporary instrument overrides
  - Sequence assembly and application of transforms
  - ISM validation

---------------------------------
DAY 2 TARGET
---------------------------------

Deliverables (Day 2 — deterministic playback and chip backends):
- A deterministic tick scheduler that drives audio events based on the audio clock (no reliance on variable timers or nondeterministic ordering).
- Implement the Game Boy channel backends with functioning audio output:
  - Pulse 1: duty control, envelope automation (and optional sweep support as an extension)
  - Pulse 2: duty and envelope
  - Wave channel: playback of 16×4-bit wavetable data
  - Noise channel: LFSR-generated noise with envelope
- Integrate the scheduler with the chip backends so that envelope and note events are frame-aligned and deterministic across runs.
- Provide a WebAudio-based playback engine that uses the scheduler and chip backends to perform live playback of parsed scripts.
- Support buffered pre-rendering via OfflineAudioContext or equivalent to reduce runtime CPU load for heavy songs.
- Implement live reload of patterns and sequences without restarting the entire engine (hot-reload behavior for development).
- Complete sequence expansion and transform system so playback consumes the fully-expanded ISM.
- Unit and integration tests for scheduler timing, envelope scheduling, and chip output plumbing (mock AudioParam where needed).

---------------------------------
DAY 3 TARGET (✅ COMPLETED)
---------------------------------

Deliverables (Day 3 — exports, CLI, polish, and packaging):
- ✅ Fully correct hUGETracker v6 `.UGE` export meeting the `docs/uge-v6-spec.md` requirements:
  - ✅ Instrument table encoding (duty, wave, noise)
  - ✅ Pattern and pattern-data encoding (64 rows, notes, effects)
  - ✅ Order list / sequence mapping
  - ✅ Channel data mapping (4-channel ordering)
  - ✅ Tempo and basic effect encodings
  - ✅ Correct binary writer with proper endianness and validation tests
- ✅ MIDI export producing a 4-track Standard MIDI File (tested with DAWs)
- ✅ A minimal CLI supporting commands:
  - `npm run cli -- play <song.bax>` — run playback
  - `npm run cli -- verify <song.bax>` — validate syntax
  - `npm run cli -- export json <song.bax> <output.json>`
  - `npm run cli -- export midi <song.bax> <output.mid>`
  - `npm run cli -- export uge <song.bax> <output.uge>`
  - `npm run cli -- inspect <file.uge>` — inspect UGE files
- ✅ Per-channel controls: mute and solo toggles in the runtime API
- ✅ Packaging and publishing:
  - ✅ ESM-first `package.json` with TypeScript declarations
  - ✅ Built as npm library usable in browser/Electron/CLI
  - ✅ All exports properly typed with `.d.ts` files

Quality bar achievements:
- ✅ `.UGE` files load correctly in hUGETracker v6 with expected audio output
- ✅ MIDI files import correctly into DAWs showing 4 tracks for GB channels
- ✅ 25 test suites with 81 passing tests covering all major features
- ✅ UGE reader tested against v1, v5, and v6 files (self-generated and community files)

---------------------------------
QUALITY RULES
---------------------------------

- No stub audio: audio backends must produce real signals during playback, not placeholders.
- Deterministic scheduling: playback must be repeatable given the same inputs and scheduler seed.
- Parser completeness: the parser must implement all documented language features; missing features require explicit sign-off.
- Correctness of hardware mappings: GB period tables, envelope timing, and LFSR behavior must approximate the hardware within reason for the MVP; Day‑3 aims for validated `.UGE` parity.
- Transforms applied at expansion time: `seq` and `pat` transforms must be applied during compilation/expansion and not patched in ad-hoc at runtime.
- Instrument state semantics must be respected: channel defaults, pattern inline `inst`, temporary `inst(name,N)`, and sequence-level overrides.
- Tests and documentation: all public APIs must have tests and minimal usage docs demonstrating exports and playback.

Copilot must scan `/docs/features/` and incorporate changes into implementations and tests as new specs are added.

---------------------------------
OUTPUT REQUIREMENTS (✅ ALL COMPLETE)
---------------------------------

Completed capabilities:

- ✅ Parse patterns, sequences, multi-pattern songs, instrument events
- ✅ Expand everything into channel-specific event streams (ISM)
- ✅ Accurately simulate Game Boy APU with WebAudio backend
- ✅ Export validated JSON (ISM format)
- ✅ Export valid MIDI (4-track Standard MIDI File)
- ✅ Export VALID hUGETracker v6 `.UGE` files
- ✅ Import and parse UGE files (versions 1-6)
- ✅ Provide CLI commands (play, verify, export, inspect)
- ✅ Bundle as npm library for external usage
- ✅ Created TUTORIAL.md and DEVNOTES.md
- ✅ Documentation system in /docs with lowercase-hyphen naming convention

Current workflow:
1. For new features: Check `/docs/features/` for specifications
2. Implement with tests following existing patterns
3. Update documentation in `/docs` as needed
4. Ensure all 25+ test suites continue to pass
5. Maintain ESM compatibility and TypeScript type safety
