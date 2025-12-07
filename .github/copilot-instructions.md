PROJECT:
Build a live-coding language and runtime for retro console chiptunes.
The first target is the Nintendo Game Boy (DMG-01) APU.

The project must be available as:
- an npm library (core engine)
- a CLI
- a Web UI (optional)
- an Electron UI (optional)

This MVP must support:
- Live pattern playback
- Authentic 4-channel Game Boy APU model
- Deterministic timing
- JSON + MIDI export
- Valid hUGETracker v6 *.UGE binary export (Day 3)
- Parsing + sequencing of multi-pattern songs
- Instrument changes at pattern, sequence, and event level

Copilot MUST:
1. Implement all required features in this document.
2. Use all documentation in `/docs/**/*.md` as authoritative.
3. Especially look in `/docs/features/` for new feature specs.
4. Follow the 3-day MVP breakdown strictly.
5. Extend the system safely without breaking AST semantics.

---------------------------------
FUTURE EXPANSION (NOT MVP)
---------------------------------
The system must be architected to support additional sound chips:
- C64 SID (3 voices, ADSR, waveforms, filters)
- Sega Genesis YM2612 + PSG
- NES APU
- PC-Engine
This requires: plug-in audio backends, configurable channel models, and
instrument definitions per chip.

Direct implementation of those chips is NOT required for the MVP,
but the design MUST support them.

---------------------------------
MVP SCOPE (STRICT)
---------------------------------

Game Boy channels (fixed 4):
1. Pulse 1 – duty + envelope (+ optional sweep post-MVP)
2. Pulse 2 – duty + envelope
3. Wave – 16 × 4-bit wave RAM
4. Noise – LFSR + envelope

Language features:
- inst definitions (Game Boy instruments)
- pat definitions (pattern-level event streams)
- seq definitions (pattern-order lists)
- inline instrument changes in patterns: `inst name`
- temporary instrument changes: `inst(name,N)`
- sequence-level overrides: `A:inst(bass)`
- multi-pattern song sequencing
- notes (C3–B8), rests `.`
- transforms: `oct(+N)`, `inst(name)`, `rev`, `slow`, `fast`
- channel routing + bpm

Patterns SHOULD NOT contain channel information.  
Sequences DO NOT define channels.  
Channels consume sequences.

---------------------------------
SYNTAX BASELINE
---------------------------------

inst lead  type=pulse1 duty=50 env=12,down
inst bass  type=pulse2 duty=25 env=10,down
inst wave1 type=wave   wave=[0,3,6,9,12,9,6,3,0,3,6,9,12,9,6,3]
inst sn    type=noise  env=12,down

pat A    = C5 E5 G5 C6
pat B    = C3 . G2 .
pat FILL = inst sn C6 C6 inst(hat,2) C6 C6

seq main  = A B A FILL A
seq intro = A:inst(bass) B

channel 1 => inst lead  seq main  bpm=140
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

1. Parse patterns into event lists:
   - note events
   - rest events
   - instrument-change events
   - temporary instrument-change events
2. Parse sequences into ordered pattern calls with transforms.
3. Expand sequences into a flattened event stream.
4. Apply sequence transforms first.
5. Apply pattern-level instrument logic.
6. Apply channel-level defaults.
7. Produce final event lists per channel.
8. Provide validated ISM (Intermediate Song Model) for export.

---------------------------------
DAY 1 TARGET
---------------------------------

- Tokenizer + parser for:
  - inst
  - pat
  - seq
  - channel
  - export
- AST definitions for all node types.
- Pattern parser:
  - note events
  - rests
  - inline inst changes
  - inst(name,N)
- Sequence parser:
  - pattern calls
  - transforms
- Build Intermediate Song Model (ISM).
- JSON export implemented.
- Tests:
  - note→frequency
  - pattern expansion
  - instrument-state logic
  - sequence assembly

---------------------------------
DAY 2 TARGET
---------------------------------

- WebAudio playback engine (DMG-01 accurate enough for MVP).
- Implement:
  - Pulse1 oscillator (duty + envelope)
  - Pulse2 oscillator
  - Wave RAM playback
  - Noise LFSR
- Deterministic tick scheduler (no jitter).
- Real-time playback from parsed script.
- Sequence expansion + transform system complete.
- Pattern + sequence reload support.

---------------------------------
DAY 3 TARGET
---------------------------------

- Implement correct hUGETracker v6 *.UGE export:
  - Instrument table
  - Pattern table
  - Order list
  - Channel data
  - Tempo
  - Effects as needed
  - Binary writer with correct endianness

- MIDI export (4-track).
- Live reload improvements.
- Per-channel mute/solo.
- Basic CLI:

  node index.js play song.bax
  node index.js export json song.bax
  node index.js export midi song.bax
  node index.js export uge  song.bax

- Publish npm package:
  - `"type": "module"`
  - Proper entrypoints: ESM + CJS
  - Bundled type declarations
  - “engine-core” usable in browser/Electron/CLI

---------------------------------
QUALITY RULES
---------------------------------

- No stub audio. All oscillators must produce real signals.
- No ignored features in the parser.
- No nondeterministic scheduling.
- No incorrect GB period tables.
- Transforms MUST be applied at compile/expansion time.
- Instrument state machine MUST follow spec:
  - channel default instrument
  - pattern inline `inst`
  - temporary overrides `inst(name,N)`
  - sequence overrides `A:inst(bass)`
- Code must be modular, testable, and documented.
- Copilot must follow ANY extra specs found in /docs/features/*.

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
