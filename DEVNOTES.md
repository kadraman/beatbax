# BeatBax — Developer Notes

This document captures architecture, implementation details, and testing notes for the completed MVP: a live-coding language targeting a Game Boy 4-channel sound model with deterministic scheduling, WebAudio playback, and multiple export formats.

High level
- Parser → AST → expansion → channel event streams → Player scheduler → WebAudio nodes
  - `arrange` expansion: the parser supports a first-class `arrange` construct which is
    expanded early in the pipeline. Per-arrange defaults and per-slot modifiers (e.g.
    `:inst(name)`, `:oct(-1)`) are applied during expansion and produce the per-channel
    ISM directly. Existing `channel` mappings remain supported as a legacy/fallback.
- Key folders:
  - `packages/engine/src/parser/` — Peggy grammar + generated parser (default). Legacy tokenizer/parser has been removed after the Peggy migration. Produces the minimal AST: `pats`, `insts`, `channels`.
  - `packages/engine/src/patterns/` — `expandPattern` and `transposePattern` utilities.
  - `packages/engine/src/audio/` — `playback.ts` implements `Player`, `Scheduler`, and channel playback helpers: `playPulse`, `playWavetable`, `playNoise`.
  - `packages/engine/src/scheduler/` — `TickScheduler` implementation and `README.md` describing `TickSchedulerOptions` and usage (supports RAF or injected timers).
  - `packages/engine/src/export/` — JSON, MIDI, and UGE exporters with validation.
  - `packages/engine/src/import/` — UGE reader for importing hUGETracker v1-v6 files with helper functions.
  - `apps/web-ui/` — browser web UI that uses the real parser and Player for live playback.

## UGE Reader — implementation notes
- Module: `packages/engine/src/import/uge/uge.reader.ts`
- Supports hUGETracker versions 1-6 with backward compatibility
- **Binary parsing**: Uses custom BinaryReader class for sequential buffer reading
  - Tracks offset automatically
  - Little-endian format
  - Pascal-style string reading (length prefix)
- **Pattern cells**: 17 bytes per cell (note, instrument, volume, effectCode, effectParam)
  - Note index: 0-71 (C3-B8), 90=rest, 91=cut
  - Instrument: 0-14 relative index, 15=no change
  - Effects: 0x00-0x0F with 8-bit parameter
- **Instrument structures**:
  - Duty/Wave: 1381 bytes (v6), 1325 bytes (v5)
  - Noise: 1137 bytes
  - Fields: envelope, sweep, duty cycle, wavetable, subpattern data
- **Helper functions**:
  - `parseUGE(buffer)` — parse binary data into structured object
  - `readUGEFile(path)` — convenience function for file I/O
  - `getUGESummary(uge)` — text summary for CLI
  - `getUGEDetailedJSON(uge)` — comprehensive JSON with formatted data
  - `midiNoteToUGE(midi)` / `ugeNoteToString(idx)` — note conversion utilities
- **CLI integration**: `inspect` command supports both summary and JSON output modes
  - `beatbax inspect file.uge` — shows version, title, BPM, counts
  - `beatbax inspect file.uge --json` — detailed breakdown with note names, hex wavetables
- **Use cases**:
  - Debugging UGE exports (verify pattern data, instrument encoding)
  - Analyzing community hUGETracker files
  - Round-trip testing (export → inspect → validate)
  - Format conversion workflows

Scheduler & timing
- `Scheduler` queues functions with absolute `AudioContext.currentTime` timestamps and uses a lookahead interval to execute scheduled callbacks deterministically. This is intentionally simple and deterministic for testing.
- Timing unit: the parser resolves BPM per channel; tick resolution is a 16th note (tickSeconds = (60 / bpm) / 4). Each token occupies one tick. Start times are scheduled relative to `AudioContext.currentTime + 0.1`.

Tempo / speed additions
- A top-level `bpm` directive is now supported in the parser (e.g. `bpm 128`).
- Channels support a `speed` multiplier (e.g. `speed=2` or `speed=2x`) which multiplies the master BPM when channel-level `bpm` is not specified. The Player computes effective BPM for a channel as:
  - `channel.bpm` if present
  - otherwise `ast.bpm * channel.speed` if both exist
  - otherwise `ast.bpm` if present
  - otherwise the Player default

Playback helpers
- `playPulse(ctx,freq,duty,start,dur,inst)` — creates an `OscillatorNode` with a generated `PeriodicWave` (pulse) and a `GainNode` for envelope. Falls back to `'square'` oscillator if `setPeriodicWave` fails in the environment.
- `playWavetable(ctx,freq,table,start,dur,inst)` — builds a tiny `AudioBuffer` for one cycle (sampled at 8192 Hz) and uses a looping `AudioBufferSourceNode` with `playbackRate` tuned for frequency.
- `playNoise(ctx,start,dur,inst)` — produces a deterministic noise buffer using an LFSR-like generator approximating Game Boy noise (width, divisor, shift configurable via `inst` props). It samples the LFSR to create an audio buffer and plays it as a one-shot buffer source.

Instrument semantics
- Channel default instrument: set by `channel N => inst name ...`.
- Inline permanent swap: `inst(name)` inside a pattern sets the current pattern instrument from that point.
- Inline temporary override: `inst(name,N)` sets a temporary `tempInst` that applies to the next N non‑rest tokens. The counter decrements only for tokens that produce sound (rests are ignored). This behavior is implemented in `Player.playAST`.
- Named tokens: tokens like `snare` or `hihat` are looked up in `insts` at schedule time. If the named instrument is noise, it is scheduled immediately as a noise hit; otherwise the instrument is used for note playback.

## Panning — implementation notes
- Parsing & AST: `parseEffects` (parser) recognizes `pan` tokens and returns `{ effects, pan }`; inline `pan` tokens are attached to `NoteToken.pan`. The `gb:` namespace propagates to `pan.sourceNamespace`.
- Sequence-level `:pan(...)` transforms: `expandSequenceItems` injects `pan()` / `pan(...)` tokens around sequence occurrences so the resolver applies a sequence-scoped pan override for that occurrence.
- Playback (browser & buffered): `effects` registry includes a built-in `pan` handler that uses `StereoPannerNode` when available; `bufferedRenderer` will apply pan handler during offline rendering.
  - **Fixed (2026-01-31):** Panning now works correctly in web browser by calling `gain.disconnect()` without arguments to disconnect from ALL destinations (including `masterGain`) before inserting `StereoPannerNode`. Previously, the code tried to disconnect from `ctx.destination` specifically, which failed when `masterGain` was used, causing hard pan (`gb:pan=L/R`) to not work properly in the browser.
  - Implementation details:
    - `playback.ts` (`Player.tryApplyPan`): Uses `gain.disconnect()` and determines the correct destination as `masterGain || ctx.destination` to support both standalone and web UI contexts.
    - `effects/index.ts` (shared pan handler): Uses `gain.disconnect()` and connects to `ctx.destination` (appropriate for BufferedRenderer and other contexts that don't use masterGain).
- PCM renderer: implements equal-power panning for numeric values and uses enum->value mapping for `L`/`C`/`R`.
- UGE exporter:
  - Hardware mapping: GB NR51 bits map to hUGETracker's expected layout (Pulse1 left=0x01/right=0x10, Pulse2 left=0x02/right=0x20, Wave left=0x04/right=0x40, Noise left=0x08/right=0x80).
  - Emission policy: exporter computes per-row NR51 from per-channel pans and writes a single `8xx` Set‑Panning effect on Channel 1 when the NR51 mix changes and a note onset occurs (initial row or rows with note-on). The writer tracks `lastNr51` to avoid redundant writes across sustain/rest rows.
  - Strict mode / snapping: numeric pans are snapped deterministically to `L/C/R` (pan < -0.33 → L, pan > 0.33 → R, otherwise C) in non-strict exports; `--strict-gb` rejects numeric pans as an error.
  - Metadata: exporter no longer appends an `[NR51=0x..]` tag to the UGE comment; use JSON export for round-trip metadata if needed.
- Tests: new tests cover parser pan parsing, sequence-level pan application, buffered/PCM rendering panning behavior, UGE NR51 mapping and emission policy, and regression tests ensuring no redundant 8xx writes on sustain rows.

## Portamento — implementation notes
- Parsing & AST: `parseEffects` recognizes `port` tokens with speed parameter (0-255). Inline `port` effects are attached to `NoteToken.effects`.
- Runtime semantics:
  - WebAudio playback: `src/effects/index.ts` implements frequency automation using exponential ramps. Per-channel state tracking (Map<channelId, lastFreq>) enables smooth slides across rests.
  - State management: `clearEffectState()` function clears all effect state on playback stop to prevent frequency persistence across sessions.
  - PCM renderer: `src/audio/pcmRenderer.ts` applies cubic smoothstep easing for portamento with per-channel state tracking for consistent behavior across rests.
- UGE exporter:
  - Effect mapping: Maps to hUGETracker's `3xx` (tone portamento) opcode with speed parameter directly mapped to `xx` (0-255).
  - First-note handling: Uses `hasSeenNote` flag to skip portamento on the first note of a pattern (no previous frequency to slide from).
  - Empty cell handling: Rest, sustain, padding, and empty pattern cells use `instrument: -1` (converted to `relativeInstrument: 0`) to prevent unwanted instrument changes that interfere with portamento.
- Pattern operations: `transposePattern` utility correctly handles notes with inline effects by extracting the note, transposing it, and reconstructing the token with effects intact (e.g., `E3<port:8>` → `E2<port:8>`).
- Testing: Comprehensive demo in `songs/effects/port_effect_demo.bax` validates WebAudio playback, PCM rendering, UGE export, and transpose operations.

## Arpeggio (`arp`) Implementation

**Syntax**: `<arp:n1,n2,...>` where each `n` is a semitone offset from the root note

**Parameters:**
  - Semitone offsets (variadic, 1-15 values): Each parameter adds a note to the arpeggio cycle
  - Example: `<arp:3,7>` → cycles [0, +3, +7] (root, minor third, perfect fifth)
  - The root note (offset 0) is always included automatically

**Runtime semantics:**
  - WebAudio playback: `src/effects/index.ts` implements rapid note cycling at chip frame rate (60Hz for Game Boy)
  - Per-channel state tracking: `arpeggioState` Map stores current index and interval ID for each channel
  - Cycle behavior: Rotates through [root, +n1, +n2, ...] continuously until note ends or new note/effect occurs
  - State management: `clearEffectState()` clears all arpeggio intervals on playback stop

**Export behavior:**
  - UGE exporter: Maps to hUGETracker's `0xy` (arpeggio) opcode
    - Maximum 2 offsets supported (3 notes total including root)
    - `x` = first semitone offset (nibble 0-15)
    - `y` = second semitone offset (nibble 0-15)
    - Example: `<arp:3,7>` → `037` (minor chord)
  - MIDI exporter: Expands arpeggio into rapid note sequence at 60Hz cycle rate
  - PCM renderer: Applies arpeggio by cycling frequencies at chip frame boundaries

**Named presets:**
  - Common chord patterns can be defined as effect presets:
    ```bax
    effect arpMinor = arp:3,7
    effect arpMajor = arp:4,7
    effect arpMajor7 = arp:4,7,11
    effect arpDim = arp:3,6
    ```
  - Usage: `C4<arpMinor>` or `C4<arpMajor>:4`

- Testing: Demo song `songs/effects/arpeggio.bax` validates WebAudio playback, PCM rendering, UGE export, and MIDI export with various chord types

## Volume Slide (`volSlide`) Implementation

**Syntax**: `<volSlide:delta>` or `<volSlide:delta,steps>`

**Parameters:**
  - `delta` (required, signed integer): Volume change rate per frame
    - Positive: fade in / crescendo
    - Negative: fade out / decrescendo
    - Typical range: ±1 to ±15
  - `steps` (optional, positive integer): Number of discrete steps for terraced slides
    - If omitted: smooth linear ramp over note duration
    - If provided: stepped volume changes creating audible "stairs"

**Runtime semantics:**
  - WebAudio playback: `src/effects/index.ts` uses `AudioParam.linearRampToValueAtTime` for smooth slides
  - **Architectural limitation**: Volume slide calls `cancelScheduledValues()` which **disables instrument envelope automation**
    - This is necessary to prevent conflicts between envelope and volume slide automation
    - Instruments with active envelopes will have envelope disabled when volume slide is applied
  - PCM renderer: `src/audio/pcmRenderer.ts` applies manual gain ramping over note duration with optional step quantization
  - Per-channel state: Tracks `volSlideGain` for proper initialization on each note

**Export behavior:**
  - UGE exporter: Maps to hUGETracker's `Axy` (volume slide) opcode
    - `x` nibble: Up/down direction (0=down, 1=up)
    - `y` nibble: Speed/magnitude (0-15)
    - Conversion: `x = (delta > 0) ? 1 : 0; y = Math.min(15, Math.abs(delta))`
    - Example: `<volSlide:+6>` → `A16` (up, speed 6)
    - Example: `<volSlide:-3>` → `A03` (down, speed 3)
  - MIDI exporter: Uses CC7 (Volume) messages with linear interpolation over note duration
  - Named events: Volume slide on named percussion events uses hUGETracker index 24 (C3 equivalent)

**Common patterns:**
  - Fade-in from silence: `inst low type=pulse1 env=1,flat` + `C4<volSlide:+14>:12`
  - Fade-out: `C5<volSlide:-5>:8`
  - Terraced slides: `C4<volSlide:+8,4>:16` (4 audible steps)
  - Combined effects: `C4<vib:3,6,volSlide:+3>` (vibrato + crescendo)

**Important notes:**
  - Low-volume instruments: Start from `env=1` instead of `env=0` to avoid complete silence
  - Note re-triggering: Insert rests (`.`) between identical pitches to force re-trigger on monophonic channels
  - Envelope conflict: Volume slide cancels envelope automation (architectural limitation)

- Testing: Demo song `songs/effects/volume_slide.bax` validates WebAudio playback, PCM rendering, UGE export, MIDI export, and stepped vs smooth behavior

## Tremolo (`trem`) Implementation

**Syntax**: `<trem:depth,rate>` or `<trem:depth,rate,waveform>` or `<trem:depth,rate,waveform,duration>`

**Parameters:**
  - `depth` (required, 0-15): Tremolo amplitude modulation
    - 0 = no effect
    - 15 = maximum amplitude modulation (±50% volume)
    - Typical range: 4-12 for musical tremolo
  - `rate` (optional, Hz): Tremolo speed (default: 6 Hz)
    - 1-4 Hz: Slow, gentle shimmer
    - 5-10 Hz: Medium tremolo
    - 10+ Hz: Fast pulsing effect
  - `waveform` (optional, string): LFO shape (default: `sine`)
    - `sine`: Smooth, natural tremolo
    - `triangle`: Linear volume ramp
    - `square`: Hard on/off pulsing
    - `saw` / `sawtooth`: Ramp waveform
  - `duration` (optional, rows): Duration in pattern rows (defaults to full note length)

**Runtime semantics:**
  - WebAudio playback: `src/effects/index.ts` creates LFO oscillator connected to GainNode for amplitude modulation
    - Uses OscillatorNode with specified waveform type
    - LFO amplitude = baseline gain × (depth / 15) × 0.5 (±50% max modulation)
    - Modulation depth scales from 0% (depth=0) to ±50% (depth=15)
  - PCM renderer: `src/audio/pcmRenderer.ts` applies manual LFO waveform generation per sample
    - Generates sine, triangle, square, or sawtooth waveforms based on phase accumulation
    - Applies tremolo gain multiplier: `1.0 + (lfo × modulationDepth)`
    - Supports pulse and wave channels (not yet implemented for noise)
  - Per-channel state: Uses per-sample phase calculation for consistent tremolo across note boundaries

**Export behavior:**
  - UGE exporter: No native tremolo effect in hUGETracker
    - Exported as MIDI meta-event only (not written to UGE file)
    - Can be approximated manually with volume column automation in hUGETracker
  - MIDI exporter: Documented via text meta event (no CC automation)
    - Format: `trem:depth=N,rate=N,waveform=NAME`
    - MIDI doesn't have native tremolo, so it's documented via text meta event
  - WAV export: Fully rendered into PCM audio with accurate LFO modulation

**Common patterns:**
  - Atmospheric shimmer: `C4<trem:6,4,sine>:8` (gentle sine wave tremolo)
  - Pulsing effect: `C4<trem:10,8,square>:4` (hard on/off square wave)
  - Combined modulation: `C4<vib:3,6,trem:6,4>` (vibrato + tremolo for rich movement)
  - Stereo tremolo: `C5<pan:-1.0,trem:10,8>` (panning + tremolo)

**Named presets:**
  - `effect shimmer = trem:6,4,sine` - Gentle shimmer effect
  - `effect pulse = trem:10,8,square` - Hard pulsing
  - `effect slow_wave = trem:4,2,triangle` - Slow wave modulation

**Use cases:**
  - Atmospheric pads and sustained notes
  - Simulating rotary speaker (Leslie) effects
  - Adding movement to static tones
  - Creating "shimmer" or "pulse" textures
  - Combining with vibrato for rich modulation

- Testing: Demo song `songs/effects/tremolo.bax` validates WebAudio playback, PCM rendering, and MIDI export with various waveforms

## Noise Channel Gain Balancing

**Status**: ✅ Fixed (2026-01-31)

**Issue**: In web browser playback, the noise channel was significantly louder than pulse channels, creating an unbalanced mix. The CLI/PCM renderer had correct balance.

**Root cause**: The WebAudio implementation in `noise.ts` used a hardcoded gain multiplier of `0.8`, while pulse channels used full-scale envelope values (`0-1` range from `/15` normalization). The pulse waveform (created via Fourier series with `disableNormalization: true`) has naturally lower amplitude than the noise buffer's `±1.0` samples, making the noise channel disproportionately loud.

**Fix**: Reduced noise channel gain from `0.8` to `0.3` in all WebAudio code paths:
- Raw LFSR buffer samples: `sampleVal * 0.3` (was `0.8`)
- Game Boy envelope values: `(cur / 15) * 0.3` (was `0.8`)
- Fallback gain settings: `0.3` (was `0.8`)
- Skip-envelope mode: `0.3` (was `0.8`)

**Files modified**:
- `packages/engine/src/chips/gameboy/noise.ts`: All gain values reduced to 0.3

**Result**: Noise channel now balances correctly with pulse channels in web browser, matching the CLI mixing behavior.

## Noise Channel Note Mapping (UGE Export)

**Status**: ✅ Implemented (2026-01-25)

The Game Boy noise channel doesn't use traditional musical pitches—notes control the LFSR shift and divisor parameters. Early versions applied an automatic +36 semitone transpose during UGE export, mapping C2→index 36, but this caused notes to be clamped at the maximum index (72), appearing as "???" in hUGETracker.

**Current behavior (v0.1.0+)**:
- **1:1 mapping**: Notes export directly to hUGETracker indices with NO automatic transpose
  - C2 in BeatBax → index 0 (displays as C-3 in hUGETracker)
  - C5 in BeatBax → index 24 (displays as C-6 in hUGETracker)
  - C6 in BeatBax → index 36 (displays as C-7 in hUGETracker, **typical percussion range**)
  - C9 in BeatBax → index 72 (displays as C-10 in hUGETracker = maximum)
- **Octave Display Note**: hUGETracker displays all notes ONE OCTAVE HIGHER than BeatBax's MIDI notation
- **Recommendation**: Use C5-C6 for typical percussion sounds (snares, hi-hats)
- **Override**: Add `uge_transpose=N` to instrument definition for custom offsets
- **Default note parameter**: Instruments can specify `note=C6` to set default pitch when using instrument name as token (see [instrument-note-mapping-guide.md](docs/instrument-note-mapping-guide.md))

**Implementation**:
- `packages/engine/src/export/ugeWriter.ts`: Note-to-index conversion, no automatic transpose
- `packages/engine/src/parser/parser.ts`: Parse `note=` parameter in instrument definitions
- `packages/engine/src/song/resolver.ts`: Pass `defaultNote` from instrument to events
- `docs/uge-export-guide.md`: Updated "Noise Channel Note Mapping" section
- `docs/instrument-note-mapping-guide.md`: Complete guide for `note=` parameter usage
- `songs/percussion_demo.bax`: Demonstration with `note=` parameter and corrected octave ranges

**Files modified**:
- `ugeWriter.ts`: Note-to-index conversion with octave display clarification
- `uge-export-guide.md`: Updated with octave display offset explanation
- `instrument-note-mapping-guide.md`: New user guide for `note=` parameter
- `percussion_demo.bax`: Updated to use C6 for typical percussion (not C7)

## Vibrato (`vib`) Implementation

- Syntax: `C5<vib:depth,rate,waveform,duration>` where:
  - `depth` (1st param, required): vibrato amplitude 0-15 → mapped to `y` nibble in UGE `4xy`
  - `rate` (2nd param, required): vibrato speed (Hz-like units for BeatBax playback, not exported to UGE)
  - `waveform` (3rd param, optional): LFO shape selector (name or 0-15) → mapped to `x` nibble in UGE `4xy`. Default: `none` (0)
  - `durationRows` (4th param, optional): length in pattern rows for vibrato effect

- Waveform mapping: BeatBax supports 16 official hUGETracker waveform names (0-F) plus common aliases:
  - Official names: `none`, `square`, `triangle`, `sawUp`, `sawDown`, `stepped`, `gated`, `gatedSlow`, `pulsedExtreme`, `hybridTrillStep`, `hybridTriangleStep`, `hybridSawUpStep`, `longStepSawDown`, `hybridStepLongPause`, `slowPulse`, `subtlePulse`
  - Common aliases: `sine`/`sin` → 2 (triangle), `tri` → 2, `sqr`/`pulse` → 1, `saw`/`sawtooth` → 3, `ramp` → 4, `noise`/`random` → 5
  - Note: hUGETracker has no true sine wave; `sine` maps to `triangle` for smooth, musical vibrato
  - Function: `mapWaveformName()` in `ugeWriter.ts` handles name-to-number conversion with case-insensitive matching

- Parsing & AST: `parseEffects` recognizes `vib` tokens with up to 4 parameters. Inline `vib` effects are attached to `NoteToken.effects`.

- Playback:
  - WebAudio: `src/effects/index.ts` implements frequency modulation using LFO on `OscillatorNode.frequency`
  - PCM renderer: `src/audio/pcmRenderer.ts` applies per-sample frequency modulation
  - Both use `fx.durationSec` (computed from `durationRows` by resolver) for timing

- UGE export behavior:
  - **Key change (v0.1.0+):** Vibrato now appears on BOTH the note row AND the first sustain row (instead of only sustain rows)
  - Rationale: Provides immediate vibrato effect from note trigger, matching user expectations for expressive modulation
  - Implementation: Modified note event processing in `ugeWriter.ts` to apply vibrato handler to note row cell, while keeping `activeVib` state for one additional sustain row
  - Post-processing: Updated enforcement loop in `ugeWriter.ts` to start from note row (`globalStart`) instead of first sustain row (`globalStart+1`)
  - Effect mapping: Maps to hUGETracker's `4xy` (vibrato) opcode where `x`=waveform (0-15), `y`=depth (0-15)
  - First note behavior: Vibrato is applied to all notes including the first note (no special-case skipping)
  - Duration handling: When `durationRows` is specified, vibrato spans exactly that many rows starting from the note row

- Testing: Demo song `songs/effects/vibrato.bax` validates WebAudio playback, PCM rendering, and UGE export with various waveforms

- Fixed issues:
  - ✅ Parser bug where waveform names (e.g., `square`) were treated as separate effects due to optional colon in regex
  - ✅ Updated regex in `parseEffectsInline()` to require colon for new effect identification
  - ✅ Removed post-processing code that cleared vibrato from note rows
  - ✅ All 16 official hUGETracker waveform names now supported with correct mappings
- Fixed issues:
  - Portamento state persistence across playback sessions (now cleared on stop).
  - First-note portamento in UGE exports (now skipped correctly).
  - Transpose only affecting first note when effects present (now handles all notes).
  - Empty UGE cells having instrument values that interfered with effects (now use -1).

- Immediate hits / shorthand: `hit(name,N)` emits N immediate named hits. `name*4` shorthand has been added as a concise equivalent to `hit(name,4)`. `inst(name,N)` continues to be a temporary override for upcoming non-rest notes, but as a convenience it now emits immediate hits when there are no future event-producing tokens in the same pattern.

Testing
- Unit tests are under `tests/`. The project uses `jest` with `ts-jest`.
- 25+ test suites with 81+ tests covering:
  - Parser & expansion tests: assert `expandPattern` and parser modifiers behave correctly (transposes, slow/fast, rev).
  - Playback-level tests: `tests/playback-expand.test.ts` stubs the player's scheduler to capture scheduled events and assert that `inst(name,N)` overrides are applied correctly.
  - Export tests: `tests/ugeExport.test.ts`, `tests/midiExport.test.ts`, and `tests/cli-export-uge.integration.test.ts` validate output formats.
  - Import tests: `tests/ugeReader.test.ts` validates UGE file parsing for v1, v5, and v6 files (self-generated and community files).
  - Inspect command tests: validate both summary and JSON output modes for .bax and .uge files.
- The resolver supports resolving sequence references with modifiers (e.g. `seqName:oct(-1)`) when channels reference sequences; tests cover these cases.
- Console logs are muted during tests by `tests/setupTests.ts` — set `SHOW_CONSOLE=1` if you want console diagnostics during test runs.

**UGE Reader Testing:**
- Tests cover v1, v5, and v6 format parsing
- Validates instrument table extraction (duty, wave, noise)
- Pattern cell parsing with note, effect, and instrument data
- Order list and routine parsing
- Helper function correctness (note conversion, formatting)
- Round-trip testing: export .bax → .uge, then re-read with reader

Parser selection
- The Peggy parser lives in `packages/engine/src/parser/peggy/` and is the default. The legacy parser has been removed after the Peggy migration. The full engine suite passes under Peggy.

## Hardware Parity and Frequency Logic

BeatBax aims for bit-accurate parity with Game Boy hardware and hUGETracker.

- **Period Tables**: Instead of standard equal temperament (A4=440Hz), the engine uses a hardware-accurate 11-bit period table for Game Boy channels. This table is defined in `packages/engine/src/chips/gameboy/periodTables.ts` and covers 72 notes (6 octaves).
- **Frequency Calculation**: The `midiToFreq` function in `packages/engine/src/chips/gameboy/apu.ts` maps MIDI notes to these hardware periods. The frequency is then calculated using the Game Boy formula: `f = 131072 / (2048 - period)`. This ensures that playback in the browser or CLI sounds identical to the exported `.UGE` file.
- **UGE Note Mapping**: hUGETracker's note index 0 (displayed as C3) corresponds to MIDI 36 (C2, ~65.4Hz). The UGE exporter maps BeatBax notes to this index using `ugeIndex = midiNote - 36`.

Design tradeoffs & future work
- Deterministic scheduler: simple and testable; a production player might require more advanced audio node lifecycle management and lower-latency scheduling strategies.
- Noise LFSR: implemented deterministically but not bit‑for‑bit identical to a real Game Boy; if bit‑exact emulation is required, refine divisor mapping and the LFSR implementation with canonical references.
- Testing: we capture scheduled functions and read their source as a pragmatic way to assert behavior without instantiating WebAudio nodes. A cleaner approach is to separate expansion (pure function) from scheduling and test the expansion output directly. Consider adding a `resolveEvents(ast)` helper that returns a plain array of events (time, dur, instName, token) and test that.
- Bundle size: we used `marked` for demo help rendering which increased the demo bundle size. If bundle size matters, swap to a lighter parser or pre-render help to static HTML.

Developer tips
- To debug runtime scheduling, open the demo and inspect `window.__beatbax_player` (the Player instance exposes some helpers and metrics).
- The demo populates per-channel indicators (`ch-ind-N`) and counters (`ch-count-N`) and exposes an `onSchedule` hook that the demo uses to blink indicators. Use the console logs (`[beatbax]`) to trace resolved ISM and scheduling events.
- To test temporary override semantics, create short patterns using `inst(name,N)` and assert scheduled events via the new playback tests or by examining console diagnostics when running the demo (set `SHOW_CONSOLE=1` for tests or use the browser console for runtime logs).

## Development Workflow

### Making Engine Changes for Web UI

The web UI uses npm workspace links to import the engine, so changes flow through automatically after rebuild:

```powershell
# Terminal 1: Keep web UI dev server running
npm run web-ui:dev

# Terminal 2: After making changes to packages/engine/src/
npm run engine:build

# Terminal 1: Press 'r' + Enter to restart the dev server
# This forces Vite to re-optimize the @beatbax/engine dependency
```

**Important:** Do NOT run `link-local-engine.cjs` for web UI development. The workspace link handles this automatically.

**If Vite doesn't pick up changes:**
```powershell
cd apps/web-ui
npm run dev:clean  # Uses --force flag to bypass Vite's dependency cache
```

### Web UI Phase 1 — Modular Architecture (✅ Complete)

The web UI has been refactored from a monolithic `main.ts` into a modular, testable architecture:

**Core Modules:**
- `src/utils/event-bus.ts` — Type-safe pub/sub system for component communication
- `src/editor/monaco-setup.ts` — Monaco editor factory with auto-save and EventBus integration
- `src/editor/beatbax-language.ts` — Monarch tokenizer with comprehensive syntax highlighting
- `src/editor/diagnostics.ts` — Parse error/warning display with Monaco markers
- `src/ui/layout.ts` — Vanilla JS split panes with localStorage persistence

**Syntax Highlighting:**
- 15+ token types with VS Code-compatible colors (`beatbax-dark` theme)
- Keywords, definitions, properties, effects, modifiers, notes, comments, JSON objects
- URI scheme highlighting for imports (`local:`, `github:`, `https:`)
- Inline effects `<vib:3,6>` and sequence modifiers `:oct(-1)` highlighted
- Custom theme supports user-defined effect/sequence presets
- Live validation with red squiggles for undefined instrument/pattern/sequence references
- 500ms debounced validation for performance

**Entry Points:**
- `src/main-phase1.ts` — New modular entry point using all Phase 1 components
- `src/main.ts` — Legacy monolithic implementation (preserved during migration)

**Test Coverage:**
- `tests/event-bus.test.ts` — 12 tests for EventBus functionality
- `tests/editor-integration.test.ts` — 12 tests for full editor initialization
- 22/24 tests passing (2 skipped complex E2E scenarios)

**Documentation:**
- [PHASE1-README.md](../apps/web-ui/PHASE1-README.md) — Phase 1 implementation details
- [docs/web-ui-syntax-highlighting.md](./web-ui-syntax-highlighting.md) — Complete color scheme reference
- [docs/features/web-ui-migration.md](./features/web-ui-migration.md) — Full migration plan with Phases 1-4

**Next Phases:**
- Phase 2: Playback & output panel
- Phase 3: Export & import UI
- Phase 4: Advanced features (menu bar, help panel, channel mixer, theme switching)
- Post-Phase 3: User-configurable syntax highlighting themes

### Making Engine Changes for CLI

The CLI requires manual linking after each build:

```powershell
# After making changes to packages/engine/src/
npm run engine:build
node scripts/link-local-engine.cjs  # Copies dist to node_modules/@beatbax/engine
node bin/beatbax play songs/sample.bax --headless
```

### Understanding the Build Scripts

**`scripts/link-local-engine.cjs`** (root)
- Copies `packages/engine/dist` → `node_modules/@beatbax/engine/dist`
- Used for CLI and Node.js imports
- Simulates `npm install` for local development
- Only needed for CLI usage, not web UI

**`apps/web-ui/scripts/prepare-engine.js`**
- Copies `packages/engine/dist` → `apps/web-ui/public/engine`
- Also copies `/songs` → `/public/songs`
- Used for production builds (serves static ESM from `/engine/`)
- In dev mode, Vite imports from workspace `node_modules` instead

### Vite Dependency Caching

Vite pre-bundles dependencies for performance. When the engine changes:
1. Vite needs to detect the change and re-optimize
2. Restarting the dev server (press `r` + Enter) triggers this
3. The `--force` flag (`npm run dev:clean`) forces re-optimization
4. Look for "Forced re-optimization of dependencies" in console output

Files of interest (quick map)
- `src/audio/playback.ts` — Player, Scheduler, playPulse/playWavetable/playNoise and helpers.
- `src/parser/index.ts` — parsing, pattern modifiers, channel resolution.
- `src/patterns/expand.ts` — expandPattern, transposePattern.
- `apps/web-ui/src/main.ts` — web UI entry (adapted from the legacy demo boot script).
- `tests/` — parser tests, tokenizer tests, and playback tests.

## Export Formats

The engine supports three export formats:

### JSON Export
- Outputs the Intermediate Song Model (ISM) with full validation
- Includes metadata, instruments, patterns, and per-channel event streams
- Used for tooling integration and round-trip testing

### MIDI Export
- Generates Type-1 Standard MIDI Files with 4 tracks (one per GB channel)
- Maps pulse1/pulse2/wave to melodic tracks with Program Change messages
- Routes noise channel to MIDI channel 10 (GM percussion) with appropriate drum key mappings
- Preserves timing and instrument changes
- See "Recommended General MIDI mappings" below for instrument mapping details

### UGE Export
- Generates valid hUGETracker v6 binary files
- Includes instrument table, pattern data, order lists, and channel routing
- Compatible with hUGETracker and uge2source.exe for Game Boy development
- Handles envelope encoding, duty cycles, wavetables, and noise parameters
- See `docs/uge-v6-spec.md` and `DEVNOTES-UGE-IMPLEMENTATION.md` for format details

## Per-Channel Controls

The `Player` class in `packages/engine/src/audio/playback.ts` implements mute and solo controls:
- `toggleChannelMute(chId: number)` — mute/unmute a specific channel
- `toggleChannelSolo(chId: number)` — solo/unsolo a channel (silences all others)
- The `muted` Set and `solo` property track state and are checked during scheduling

## Recommended General MIDI mappings

When exporting to MIDI, the exporter maps Game Boy-style instruments to General MIDI programs by
default. You can also explicitly set `gm=<0-127>` on an `inst` definition to force a Program Change
value in exported MIDI files. Example:

```
inst leadA type=pulse1 duty=60 env=gb:12,down,1 gm=81
```

Recommended defaults used by the exporter (tweak to taste):

- `pulse1` (primary lead): GM 80–81 (Lead 1 / Lead 2)
- `pulse2` (secondary / bass): GM 34 (Electric Bass)
- `wave` (wavetable / pad): GM 81/82 (Lead / Saw)
- `noise` (percussion): routed to GM percussion channel (MIDI channel 10 / index 9);
  named tokens are mapped to drum keys (e.g. `snare` -> 38, `hihat` -> 42, `kick` -> 36)

If `gm` is omitted the exporter falls back to the defaults above. Adding explicit `gm=` values is
recommended when exporting to DAWs so instrument timbres are predictable.

## Future Enhancements

Possible extensions beyond MVP:
- Extract a pure `resolveEvents(ast)` function for easier testing
- Make the noise LFSR bit-exact to a reference GB implementation
- Additional chip backends (C64 SID, NES APU, Genesis YM2612)
- Advanced timing validation tests (mocking `AudioContext.currentTime`)
- Live hot-reload of patterns during playback

---

All MVP deliverables are complete. These notes document the architecture for continued development.

### Test lifecycle note

- `npm test` now triggers a build first via npm's `pretest` lifecycle script. This ensures the
  `packages/*/dist/` artifacts (used by some integration tests that invoke `node packages/cli/dist/cli.js`) are up-to-date
  before Jest runs. If you prefer faster local test runs during development, run `jest` directly
  (or `npm run test:fast` if you add such a script) — CI should keep the `pretest` step to avoid
  flaky failures caused by stale build artifacts.

## CLI Audio Playback Implementation

The CLI supports headless audio playback and WAV rendering without browser dependencies. This section documents the implementation architecture and algorithms.

### Architecture Overview

Two rendering paths coexist:

1. **WebAudio Path** (Browser + `--browser` flag)
   - Real-time scheduling using `TickScheduler` + WebAudio nodes
   - Chip implementations: `pulse.ts`, `wave.ts`, `noise.ts`
   - Uses `OscillatorNode`, `AudioBufferSourceNode`, `GainNode`
   - Handles envelope automation via `AudioParam` scheduling

2. **PCM Rendering Path** (CLI headless + `export wav`)
   - Direct sample generation without WebAudio dependency
   - Implementation: `packages/engine/src/audio/pcmRenderer.ts`
   - Outputs stereo Float32Array samples at 44100Hz (configurable)
   - Used by both WAV export and real-time playback

### PCM Renderer Algorithm (`pcmRenderer.ts`)

The PCM renderer processes the Intermediate Song Model (ISM) and generates audio samples directly:

```typescript
function renderSongToPCM(song: SongModel, opts: RenderOptions): Float32Array {
  // 1. Calculate duration from song events (auto-detect unless overridden)
  const maxTicks = Math.max(...song.channels.map(ch => ch.events.length));
  const duration = opts.duration ?? Math.ceil(maxTicks * tickSeconds) + 1;

  // 2. Allocate stereo output buffer
  const buffer = new Float32Array(totalSamples * channels);

  // 3. Render each channel independently
  for (const ch of song.channels) {
    renderChannel(ch, song.insts, buffer, sampleRate, channels, tickSeconds);
  }

  // 4. Normalize to prevent clipping
  normalizeBuffer(buffer);

  return buffer;
}
```

**Per-Channel Rendering:**
- Iterates through event stream (notes, rests, instrument changes)
- Resolves instrument state (default, inline swap, temporary override)
- Dispatches to channel-specific renderer based on instrument type

**Pulse Channel (`renderPulse`):**
- Generates square wave with configurable duty cycle
- Applies Game Boy envelope (initial volume, direction, period)
- Amplitude: `square * envelopeValue * 0.6` (matches browser output)

**Wave Channel (`renderWave`):**
- Uses 16×4-bit wavetable (GB format: values 0-15)
- Phase-accurate sample lookup with linear interpolation
- Normalized to `[-1, 1]` range scaled by 0.6

**Noise Channel (`renderNoise`):**
- Implements Game Boy LFSR (Linear Feedback Shift Register)
- Configurable: width (7/15-bit), divisor, shift frequency
- LFSR frequency: `GB_CLOCK / (divisor * 2^(shift+1))`
- Output: `(lfsr & 1) ? 1.0 : -1.0` scaled by envelope

**Envelope Calculation:**
```typescript
function getEnvelopeValue(time: number, env: Envelope): number {
  if (!env) return 1.0;
  const GB_CLOCK = 4194304;
  const stepPeriod = env.period * (65536 / GB_CLOCK); // ~0.0625s per step
  const currentStep = Math.floor(time / stepPeriod);

  if (env.direction === 'down') {
    return Math.max(0, (env.initial - currentStep)) / 15.0;
  } else {
    return Math.min(15, (env.initial + currentStep)) / 15.0;
  }
}
```

### Audio Playback System (`nodeAudioPlayer.ts`)

For real-time headless playback, the CLI uses a multi-tier fallback system:

**Tier 1: speaker module** (optional dependency)
- Native streaming audio output
- Best performance and lowest latency
- Requires native compilation (node-gyp)
- Falls back automatically if unavailable

**Tier 2: play-sound** (optional dependency)
- Cross-platform wrapper around system audio players
- Creates temporary WAV file, invokes system player
- Works on Windows, macOS, Linux without compilation
- Currently used as primary playback method

**Tier 3: Direct system commands** (built-in fallback)
- Windows: PowerShell `Media.SoundPlayer.PlaySync()`
- macOS: `afplay <file>`
- Linux: `aplay <file>`
- Most reliable fallback, always available

**Algorithm:**
```typescript
export async function playAudioBuffer(
  samples: Float32Array,
  options: { channels: number; sampleRate: number }
): Promise<void> {
  try {
    // Tier 1: Try speaker module (streaming)
    const Speaker = await import('speaker');
    // Write samples in chunks with backpressure handling
    return streamToSpeaker(samples, options);
  } catch {
    try {
      // Tier 2: Try play-sound (temp WAV + system player)
      const player = (await import('play-sound')).default();
      const tempFile = createTempWAV(samples, options);
      return playViaSystem(player, tempFile);
    } catch {
      // Tier 3: Direct system command fallback
      return playViaSystemCommand(samples, options);
    }
  }
}
```

**WAV Buffer Generation:**
- Converts Float32 samples to 16-bit signed PCM
- Applies 0.6x volume scaling to match browser auto-gain behavior
- Writes RIFF/WAVE header with format chunk
- Interleaves channels for stereo output
- Clamps samples to `[-1.0, 1.0]` range

**Volume Normalization (2026-02-02):**
- CLI playback applies 0.6x volume scaling factor to match browser loudness
- Compensates for WebAudio's automatic dynamic range compression/limiting
- Ensures consistent perceived volume between CLI and browser playback
- Scale factor can be adjusted in `floatTo16BitPCM()` if needed

This architecture ensures audio works on all platforms without requiring native compilation, while providing optimal performance when native modules are available.

## Build / tooling note: `.js` import specifiers

- To support Node ESM, the repository now emits compiled ESM files with explicit `.js` extensions
  in relative import/export specifiers. This is accomplished by rewriting TypeScript source
  import specifiers before build using `scripts/add-js-extensions.cjs` so the emitted `.js`
  outputs are already correct for Node consumption.
- During development and test runs, Jest resolves these `.js` specifiers back to the TypeScript
  sources using a small custom resolver (`scripts/jest-resolver.cjs`) wired into package
  `jest.config.cjs` files. This keeps `ts-jest` happy while allowing runtime code to use proper
  ESM specifiers.
- If you need to revert to the prior workflow (post-build compiled-file patching), note that
  `scripts/fix-imports.cjs` is now deprecated and replaced with a no-op stub. Prefer the
  source-level `.js` approach — it's more reliable and avoids modifying compiled artifacts.

