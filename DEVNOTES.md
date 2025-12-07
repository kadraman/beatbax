# BeatBax — Developer Notes (Day‑2 MVP)

This document captures architecture, implementation details, and testing notes for the Day‑2 MVP: a small live‑coding language that targets a Game‑Boy‑like 4‑channel sound model and a deterministic WebAudio scheduler.

High level
- Parser → AST → expansion → channel event streams → Player scheduler → WebAudio nodes
- Key folders:
  - `src/parser/` — tokenizer and parser that produce a minimal AST: `pats`, `insts`, `channels`.
  - `src/patterns/` — `expandPattern` and `transposePattern` utilities.
  - `src/audio/` — `playback.ts` implements `Player`, `Scheduler`, and channel playback helpers: `playPulse`, `playWavetable`, `playNoise`.
  - `src/scheduler/` — `TickScheduler` implementation and `README.md` describing `TickSchedulerOptions` and usage (supports RAF or injected timers).
  - `demo/` — browser demo UI that uses the real parser and Player for live playback.

Scheduler & timing
- `Scheduler` queues functions with absolute `AudioContext.currentTime` timestamps and uses a lookahead interval to execute scheduled callbacks deterministically. This is intentionally simple and deterministic for testing.
- Timing unit: the parser resolves BPM per channel; tick resolution is a 16th note (tickSeconds = (60 / bpm) / 4). Each token occupies one tick. Start times are scheduled relative to `AudioContext.currentTime + 0.1`.

Tempo / speed additions
- A top-level `bpm` directive is now supported in the parser (e.g. `bpm 120`).
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

- Immediate hits / shorthand: `hit(name,N)` emits N immediate named hits. `name*4` shorthand has been added as a concise equivalent to `hit(name,4)`. `inst(name,N)` continues to be a temporary override for upcoming non-rest notes, but as a convenience it now emits immediate hits when there are no future event-producing tokens in the same pattern.

Testing
- Unit tests are under `tests/`. The project uses `jest` with `ts-jest`.
- Parser & expansion tests: assert `expandPattern` and parser modifiers behave correctly (transposes, slow/fast, rev).
- Playback-level tests: we added `tests/playback-expand.test.ts` that stubs the player's scheduler to capture scheduled events and assert that `inst(name,N)` overrides are applied correctly. This verifies the expansion→scheduling boundary.
- The resolver now supports resolving sequence references with modifiers (e.g. `seqName:oct(-1)`) when channels reference sequences; tests cover these cases.
- Console logs are muted during tests by `tests/setupTests.ts` — set `SHOW_CONSOLE=1` if you want console diagnostics during test runs.

Design tradeoffs & future work
- Deterministic scheduler: simple and testable; a production player might require more advanced audio node lifecycle management and lower-latency scheduling strategies.
- Noise LFSR: implemented deterministically but not bit‑for‑bit identical to a real Game Boy; if bit‑exact emulation is required, refine divisor mapping and the LFSR implementation with canonical references.
- Testing: we capture scheduled functions and read their source as a pragmatic way to assert behavior without instantiating WebAudio nodes. A cleaner approach is to separate expansion (pure function) from scheduling and test the expansion output directly. Consider adding a `resolveEvents(ast)` helper that returns a plain array of events (time, dur, instName, token) and test that.
- Bundle size: we used `marked` for demo help rendering which increased the demo bundle size. If bundle size matters, swap to a lighter parser or pre-render help to static HTML.

Developer tips
- To debug runtime scheduling, open the demo and inspect `window.__beatbax_player` (the Player instance exposes some helpers and metrics).
- The demo populates per-channel indicators (`ch-ind-N`) and counters (`ch-count-N`) and exposes an `onSchedule` hook that the demo uses to blink indicators. Use the console logs (`[beatbax]`) to trace resolved ISM and scheduling events.
- To test temporary override semantics, create short patterns using `inst(name,N)` and assert scheduled events via the new playback tests or by examining console diagnostics when running the demo (set `SHOW_CONSOLE=1` for tests or use the browser console for runtime logs).

Files of interest (quick map)
- `src/audio/playback.ts` — Player, Scheduler, playPulse/playWavetable/playNoise and helpers.
- `src/parser/index.ts` — parsing, pattern modifiers, channel resolution.
- `src/patterns/expand.ts` — expandPattern, transposePattern.
- `demo/boot.ts` — demo wiring, help panel and layout.
- `tests/` — parser tests, tokenizer tests, and playback tests.

If you want, I can:
- Extract a pure `resolveEvents(ast)` function for easier testing and produce an event model to drive both scheduler and tests.
- Make the noise LFSR bit‑exact to a reference GB implementation.
- Add additional unit tests that validate exact scheduled times (by mocking `AudioContext.currentTime`) and event durations.

---
These notes are intended to make it quick to continue development and testing of the Day‑2 MVP.
