# BeatBax — Developer Notes

This document captures architecture, implementation details, and testing notes for the completed MVP: a live-coding language targeting a Game Boy 4-channel sound model with deterministic scheduling, WebAudio playback, and multiple export formats.

High level
- Parser → AST → expansion → channel event streams → Player scheduler → WebAudio nodes
- Key folders:
  - `packages/engine/src/parser/` — Peggy grammar + generated parser (feature-flagged via `BEATBAX_PARSER=peggy`) plus the legacy tokenizer/parser retained for one deprecation window. Produces the minimal AST: `pats`, `insts`, `channels`.
  - `packages/engine/src/patterns/` — `expandPattern` and `transposePattern` utilities.
  - `packages/engine/src/audio/` — `playback.ts` implements `Player`, `Scheduler`, and channel playback helpers: `playPulse`, `playWavetable`, `playNoise`.
  - `packages/engine/src/scheduler/` — `TickScheduler` implementation and `README.md` describing `TickSchedulerOptions` and usage (supports RAF or injected timers).
  - `packages/engine/src/export/` — JSON, MIDI, and UGE exporters with validation.
  - `packages/engine/src/import/` — UGE reader for importing hUGETracker v6 files.
  - `apps/web-ui/` — browser web UI that uses the real parser and Player for live playback.

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
- PCM renderer: implements equal-power panning for numeric values and uses enum->value mapping for `L`/`C`/`R`.
- UGE exporter:
  - Hardware mapping: GB NR51 bits map to hUGETracker's expected layout (Pulse1 left=0x01/right=0x10, Pulse2 left=0x02/right=0x20, Wave left=0x04/right=0x40, Noise left=0x08/right=0x80).
  - Emission policy: exporter computes per-row NR51 from per-channel pans and writes a single `8xx` Set‑Panning effect on Channel 1 when the NR51 mix changes and a note onset occurs (initial row or rows with note-on). The writer tracks `lastNr51` to avoid redundant writes across sustain/rest rows.
  - Strict mode / snapping: numeric pans are snapped deterministically to `L/C/R` (pan < -0.33 → L, pan > 0.33 → R, otherwise C) in non-strict exports; `--strict-gb` rejects numeric pans as an error.
  - Metadata: exporter no longer appends an `[NR51=0x..]` tag to the UGE comment; use JSON export for round-trip metadata if needed.
- Tests: new tests cover parser pan parsing, sequence-level pan application, buffered/PCM rendering panning behavior, UGE NR51 mapping and emission policy, and regression tests ensuring no redundant 8xx writes on sustain rows.

- Immediate hits / shorthand: `hit(name,N)` emits N immediate named hits. `name*4` shorthand has been added as a concise equivalent to `hit(name,4)`. `inst(name,N)` continues to be a temporary override for upcoming non-rest notes, but as a convenience it now emits immediate hits when there are no future event-producing tokens in the same pattern.

Testing
- Unit tests are under `tests/`. The project uses `jest` with `ts-jest`.
- 25 test suites with 81 tests covering:
  - Parser & expansion tests: assert `expandPattern` and parser modifiers behave correctly (transposes, slow/fast, rev).
  - Playback-level tests: `tests/playback-expand.test.ts` stubs the player's scheduler to capture scheduled events and assert that `inst(name,N)` overrides are applied correctly.
  - Export tests: `tests/ugeExport.test.ts`, `tests/midiExport.test.ts`, and `tests/cli-export-uge.integration.test.ts` validate output formats.
  - Import tests: `tests/ugeReader.test.ts` validates UGE file parsing.
- The resolver supports resolving sequence references with modifiers (e.g. `seqName:oct(-1)`) when channels reference sequences; tests cover these cases.
- Console logs are muted during tests by `tests/setupTests.ts` — set `SHOW_CONSOLE=1` if you want console diagnostics during test runs.

Parser selection
- The Peggy parser lives in `packages/engine/src/parser/peggy/` and is selected via `BEATBAX_PARSER=peggy`. The full engine suite now passes under this flag; the legacy parser remains the default until the deprecation window closes.

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
- Writes RIFF/WAVE header with format chunk
- Interleaves channels for stereo output
- Clamps samples to `[-1.0, 1.0]` range

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

