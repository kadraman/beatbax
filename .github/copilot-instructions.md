PROJECT:
Build a concise, testable, and extensible live-coding language and runtime for retro console chiptunes.
Primary target: the Nintendo Game Boy (DMG-01) APU.

Distribution targets (must be provided):
- `engine-core` as an npm library (portable, ESM-first, usable in browser/Electron/CLI)
- A minimal CLI that can `play` and `export` (json, midi, uge)

Optional frontends (nice-to-have, post-MVP):
- Web UI for live editing and playback
- Electron desktop UI for integrated workflow

Core MVP guarantees (what the engine must actually deliver):
- Deterministic, tick-accurate scheduling for repeatable playback
- A faithful, modular 4-channel Game Boy APU model (pulse1, pulse2, wave, noise)
- Live pattern playback with instrument and temporary instrument overrides
- Sequence expansion, transforms, and channel routing
- Reliable exports: JSON (ISM), MIDI (4-track), and valid hUGETracker v6 `.UGE` (Day 3 requirement)

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
- Backend plugin API for chip/channel models
- Clearly separated instrument definitions per chip
- Stable ISM exports so tools can consume song data independent of backend

Implementations of these extra chips are explicitly out-of-scope for the MVP but must be feasible without reworking the AST or core scheduler.

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

bpm 120
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
REQUIRED PROJECT STRUCTURE
---------------------------------

/src
  parser/
    tokenizer.ts
    parser.ts
    ast.ts
  patterns/
    expandPattern.ts
  sequences/
    expandSequence.ts
  song/
    resolver.ts
    songModel.ts
  instruments/
    instrumentState.ts
  scheduler/
    tickScheduler.ts
  chips/
    gameboy/
      pulse.ts
      wave.ts
      noise.ts
      apu.ts
    shared/
      periodTables.ts
  audio/
    audioEngine.ts
  export/
    jsonExport.ts
    midiExport.ts
    ugeExport.ts     # Full implementation REQUIRED Day 3
  cli/
    index.ts
  index.ts

/docs
  features/
    *.md   # Copilot MUST scan these for new feature specs

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
DAY 3 TARGET
---------------------------------

Deliverables (Day 3 — exports, CLI, polish, and packaging):
- Fully correct hUGETracker v6 `.UGE` export meeting the `docs/uge-v6-spec.md` requirements, including:
  - Instrument table encoding
  - Pattern and pattern-data encoding
  - Order list / sequence mapping
  - Channel data mapping (4-channel ordering)
  - Tempo and basic effect encodings needed for exported songs
  - Correct binary writer with proper endianness and validation tests
- MIDI export producing a 4-track Standard MIDI File that maps each Game Boy channel to a distinct track and preserves timing and instrument changes where feasible.
- A minimal CLI supporting commands:
  - `node index.js play <song.bax>` — run playback in a headless or browser-backed mode
  - `node index.js export json <song.bax>`
  - `node index.js export midi <song.bax>`
  - `node index.js export uge <song.bax>`
- Live reload usability improvements (faster recompile and update of in-memory AST/ISM for development).
- Per-channel controls: mute and solo toggles in the runtime API.
- Packaging and publishing requirements:
  - `package.json` should be ESM-first, with compatible CJS entrypoints where needed
  - Bundle or ship TypeScript declarations (`.d.ts`) for the core engine
  - Ensure `engine-core` is usable as a browser/Electron/CLI dependency

Quality bar for Day 3:
- The `.UGE` files produced must pass a reference validation tool (or the test harness in `/docs`) and load in hUGETracker v6 with the expected audible result.
- MIDI files should import correctly into common DAWs and show 4 tracks corresponding to the 4 GB channels.

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
OUTPUT REQUIREMENTS
---------------------------------

At MVP completion, tool must:

- Parse patterns, sequences, multi-pattern songs, instrument events.
- Expand everything into channel-specific event streams.
- Accurately simulate Game Boy APU with WebAudio backend.
- Export validated JSON.
- Export valid MIDI.
- Export VALID hUGETracker v6 `.UGE` files.
- Provide CLI commands.
- Bundle as npm library for external usage.
- Create TUTORIAL.md and DEVNOTES.md.
- Automatically integrate new features found in /docs/features/.

Start by scaffolding the tokenizer and AST.
