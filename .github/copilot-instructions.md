PROJECT:
Build a Strudel-like live-coding language and runtime for retro console chiptunes.
The first target is the Nintendo Game Boy (DMG-01) APU.

This MVP must support:
- Live pattern playback
- Authentic 4-channel Game Boy sound model
- Deterministic timing
- JSON + MIDI export
- (UGE export reserved for post-MVP)

This project uses a pattern → sequence → channel model.
It supports instrument changes inside patterns and overrides at sequence level.

---------------------------------
MVP SCOPE (STRICT)
---------------------------------

Game Boy channels (fixed):
1. Pulse 1 – duty + envelope (sweep optional for post-MVP)
2. Pulse 2 – duty + envelope
3. Wave – 16×4-bit wave RAM
4. Noise – LFSR + envelope

Language features:
- inst definitions (Game Boy instruments)
- pat definitions (pattern event streams)
- seq definitions (pattern-order lists)
- inline instrument changes in patterns
- sequence-level instrument overrides
- temporary instrument changes: inst(name, N)
- notes (C3–B8), rests (.)
- transforms: oct(+N), inst(name), rev, slow, fast (rev optional for post-MVP)
- channel routing
- bpm control

---------------------------------
SYNTAX BASELINE
---------------------------------

# Instruments
inst lead  type=pulse1 duty=50 env=12,down
inst bass  type=pulse2 duty=25 env=10,down
inst wave1 type=wave   wave=[0,3,6,9,12,9,6,3,0,3,6,9,12,9,6,3]
inst sn    type=noise  env=12,down

# Patterns with instrument changes
pat A    = C5 E5 G5 C6
pat B    = C3 . G2 .
pat FILL = inst sn C6 C6 inst(hat,2) C6 C6

# Sequence (pattern-order list)
seq main  = A B A FILL A
seq intro = A:inst(bass) B

# Channels
channel 1 => inst lead  seq main  bpm=140
channel 2 => inst bass  seq main:oct(-1)
channel 3 => inst wave1 seq intro
channel 4 => inst sn    seq drums

# Exports
export json "song.json"
export midi "song.mid"
export uge  "song.uge"   # NOT IMPLEMENTED IN MVP

---------------------------------
TECH STACK
---------------------------------

- TypeScript
- Node.js + optional browser demo
- WebAudio for playback
- No frameworks

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
  instruments/
    instrumentState.ts
  scheduler/
    tickScheduler.ts
  audio/
    pulse.ts
    wave.ts
    noise.ts
    audioEngine.ts
  export/
    jsonExport.ts
    midiExport.ts
    ugeExport.ts   # stub only
  index.ts

---------------------------------
LANGUAGE EXPANSION PIPELINE
---------------------------------

1. Parse patterns into event lists:
   - note events
   - rest events
   - instrument change events
   - temporary instrument change events (inst(name,N))

2. Parse sequences into ordered pattern calls, including transforms:
   - A B A FILL:A:oct(+1)
   - A:inst(bass)
   - A:rev (optional)

3. Expand sequences:
   - flatten pattern calls into a single event stream
   - apply sequence-level transforms
   - apply pattern-local inline instrument events

4. Apply channel defaults:
   - channel-level instrument is the starting instrument
   - inline events override it
   - temporary overrides revert after N events

5. Produce final event list per channel:
   - {note, instrument, length, transforms}

---------------------------------
DAY 1 TARGET
---------------------------------

- Tokenizer + parser implemented.
- AST generation for inst, pat, seq, channel.
- Intermediate Song Model (ISM).
- Implement pattern parsing (notes, rests, inst changes).
- JSON export from resolved ISM.
- Unit tests for:
  - note → frequency
  - pattern expansion
  - instrument change logic

---------------------------------
DAY 2 TARGET
---------------------------------

- WebAudio playback engine.
- Implement:
  - Pulse channels with duty + envelope
  - Wave channel RAM playback
  - Noise channel LFSR + envelope
- Deterministic tick scheduler (no jitter).
- Real-time playback from parsed text.
- Implement sequence expansion + transforms.

---------------------------------
DAY 3 TARGET
---------------------------------

- MIDI export (4-channel, 1 track per GB channel).
- Live pattern/sequence reload.
- Per-channel mute/solo.
- Basic CLI:

  node index.js play song.bax
  node index.js export json song.bax
  node index.js export midi song.bax
  node index.js export uge song.bax  # stub placeholder

---------------------------------
QUALITY RULES
---------------------------------

- No stub audio or fake oscillators.
- No random timing jitter.
- No uncontrolled global state.
- Frequency/period conversions must be documented.
- Instruments must be correctly applied:
  - channel default
  - inline pattern `inst`
  - temporary overrides `inst(name,N)`
  - sequence-level overrides `A:inst(bass)`
- Transforms must be applied during expansion, not playback.
- Code must be modular & testable.

---------------------------------
OUTPUT REQUIREMENTS
---------------------------------

At MVP completion, tool must:

- Parse patterns, sequences, and instrument changes.
- Expand everything into channel-specific event streams.
- Play back GB-style audio in real time.
- Export validated JSON.
- Export MIDI.
- CLI commands must work.
- UGE export must remain a stub for post-MVP.
- Create a browser demo for live coding and playback.
- Create a TUTORIAL.md explaining the language and usage.
- Create a DEVNOTES.md explaining architecture and design decisions.

Start by scaffolding the tokenizer and AST.
