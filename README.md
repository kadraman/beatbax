# BeatBax

[![CI](https://github.com/kadraman/beatbax/actions/workflows/ci.yml/badge.svg)](https://github.com/kadraman/beatbax/actions/workflows/ci.yml) [![Publish](https://github.com/kadraman/beatbax/actions/workflows/publish.yml/badge.svg)](https://github.com/kadraman/beatbax/actions/workflows/publish.yml)

BeatBax is a small live-coding language and toolchain for creating retro-console chiptunes.
This repository contains an MVP implementation focused on the Nintendo Game Boy audio model.

This project is intentionally minimal and zero-dependency for the core parsing/scheduling/export tasks.

## Goals (MVP)
- Live pattern playback (Day 2)
- Authentic 4-channel Game Boy sound model (pulse1, pulse2, wave, noise)
- JSON + MIDI + UGE export (UGE deferred)
- Deterministic tick scheduler

The strict Day 1 scope was:
- Tokenize + parse the language
- Build an AST and resolved song model
- Export validated JSON
- Unit tests for tokenizer and pattern expansion

This repository contains a Day 1-complete baseline: the tokenizer, parser, pattern expansion, a resolver that builds an Intermediate Song Model (ISM), and a validated JSON exporter. All core parsing and expansion behavior is covered by unit tests.

## Quick examples (language)

inst lead  type=pulse1 duty=50 env=gb:12,down,1
inst bass  type=pulse2 duty=25 env=gb:10,down,1
inst wave1 type=wave  wave=[0,3,6,9,12,9,6,3,0,3,6,9,12,9,6,3]
inst snare type=noise env=gb:12,down,1

pat A = C5 E4 G4 C5
pat B = C3 . G2 .

channel 1 => inst lead pat A bpm=140
channel 2 => inst bass pat B
channel 3 => inst wave1 pat A:oct(-1)
channel 4 => inst snare pat "x . x x"

play
export json "song.json"
export midi "song.mid"

The language supports `inst` definitions, `pat` definitions (including repeats and groups), channel routing, octave/transpose modifiers, and simple commands (`play`, `export`).

Recent additions (still Day‑1 scope — authoring & export):

- Top-level `bpm` directive and per-channel `speed` multipliers: use `bpm 120` and `channel 2 => ... speed=2x` to run a channel at a multiple of the master tempo.
- `hit(name,N)` shorthand and `name*4` percussion shorthand: useful for immediate repeated hits (also `inst(name,N)` will emit immediate hits when there are no following note events).
- Resolver improvements: sequence references with modifiers (e.g. `seqName:oct(-1)`) are expanded correctly when channels reference sequences.
- Demo UI: per-channel scheduling indicators and counters, and an effective-BPM display have been added to help debug timing and speed multipliers.

## CLI

There is a small CLI entrypoint in `src/cli.ts`.

Common commands (PowerShell examples):

```powershell
npm run cli -- play songs\example-valid.bax
npm run cli -- verify songs\example-valid.bax
npm run cli -- export json songs\example-valid.bax --out songs\example.json
```

During development you can run the TypeScript CLI directly:

```powershell
npm run cli:dev -- play songs\example-valid.bax
```

`npm run cli` builds then runs the compiled `dist/` CLI; the build includes a small post-build step that rewrites import specifiers so the compiled ESM output runs cleanly under Node.

## Export

- `export json <file> [--out <path>]` — validated JSON export (current Day 1 deliverable)
- `export midi <file> [--out <path>]` — MIDI export placeholder (to be completed in Day 3)

The JSON exporter performs structural validation of the parsed AST and writes a normalized JSON object with metadata.

## Project layout

 - `src/` — TypeScript sources
   - `parser/` — tokenizer and parser (AST builder)
   - `patterns/` — pattern expansion + transposition utilities
   - `audio/` — (Day 2) Game Boy channel emulation and oscillators
   - `scheduler/` — (Day 2) deterministic tick scheduler
   - `export/` — json/midi/uge exporters
   - `cli.ts`, `index.ts` — CLI and program entry
 - `tests/` — Jest unit tests for tokenizer, patterns, and parser
 - `songs/` — example .bax song files used by the CLI

## Development

Install dev deps and run tests:

```powershell
npm install
npm test
```

Build and run the CLI:

```powershell
npm run build
npm run cli -- export json songs\example-valid.bax --out songs\example.json
```

Fast dev run (recommended for iteration):

```powershell
# Fast, no-build iteration — uses `tsx` under the hood
npm run cli:dev -- export json songs\example-valid.bax --out songs\example.json
```

## Status / Roadmap

Day 1 (done): tokenizer, parser, AST, pattern expansion, validated JSON export, unit tests.

Day 2 (in progress / next): deterministic scheduler, WebAudio playback refinements, and GB channel emulation (pulse oscillators, wavetable, noise). The WebAudio Player implementation lives in `src/audio/playback.ts` and the demo (`demo/`) exercises it.

Day 3 (future): full MIDI export, live reload of patterns, CLI polish, mute/solo per channel.

## Contributing

Contributions welcome. Open issues for features, and PRs against `main`. Keep changes small and include tests for parser/expansion behavior.

## License

See `LICENSE` in this repository.

## Scheduler example (public API)

Import the scheduler factory from the package (or from `dist/` after build). The factory chooses a RAF-driven loop in browser environments by default.

```ts
// ESM import from published package
import createScheduler from 'beatbax/scheduler';

// audioContext is a WebAudio AudioContext instance
const sched = createScheduler(audioContext, { useRaf: true });
sched.start();
sched.schedule(audioContext.currentTime + 0.1, () => {
  // play a scheduled note or trigger event
});

// Types are exported for TS consumers
import type { TickSchedulerOptions } from 'beatbax/scheduler';
```
