# BeatBax — Quick Tutorial

This short tutorial shows how to write a small `.bax` song, run the browser demo, and export the result. It focuses on the Day‑2 MVP features: two pulse channels, a wavetable channel, a noise channel, deterministic scheduling, and live playback from parsed text.

**Files used in the demo**
- `songs/sample.bax` — example song shipped with the repo.
- `demo/` — browser demo UI that loads and plays `.bax` files.

**Language Quick Reference**

- inst definitions: define instruments and their params.
  - Example: `inst leadA type=pulse1 duty=60 env=gb:12,down,1`
  - Fields: `type` (pulse1|pulse2|wave|noise), `duty` (pulse duty %), `env` (envelope), `wave` (16-entry wavetable)

- pat definitions: pattern tokens (notes, rests, named tokens, inline inst changes).
  - Notes: `C4`, `G#5`, `A3` — scientific pitch notation.
  - Rests: `.`
  - Grouping and repeat: `(C5 E5 G5)*2`
  - Named tokens: `snare` or `hihat` (mapped to `inst` entries by scheduler)
  - Inline temporary instrument override: `inst(name,N)` — next N non-rest tokens use `name`
  - Inline permanent instrument: `inst(name)` — change default instrument for the pattern

- seq / channel: map patterns and instruments to Game Boy channels
  - Example: `channel 1 => inst leadA pat A` (use top-level `bpm 160` or per-channel `speed`/sequence transforms)
  - Channels: 1 (Pulse1), 2 (Pulse2), 3 (Wave), 4 (Noise)

**Transforms (applied at parse/expansion time)**
- `:oct(n)` — transpose by octaves
- `:+N` or `:-N` — semitone transpose
- `:rev` — reverse pattern
- `:slow(N)` — repeat each token N times (default 2)
- `:fast(N)` — take every Nth token (default 2)

**Tempo & Per-Channel Speed**

- Set a master tempo with a top-level directive: `bpm 120` or `bpm=120`.
- Per-channel multipliers: use `speed=2` or `speed=2x` on a channel to play
  that channel at a multiple of the master BPM. Example: `speed=2x` plays
  twice as fast as the master tempo.

Example:
```
# Use master tempo 120 BPM
bpm 120

# Channel 1 uses master BPM (120)
channel 1 => inst leadA seq lead

# Channel 2 runs twice as fast (240 BPM effective) using a speed multiplier
channel 2 => inst leadB seq bass speed=2x
```

**Example pattern snippet**
```
inst leadA type=pulse1 duty=60 env=gb:12,down,1
inst sn type=noise env=gb:10,down,1

pat A = (C5 E5 G5 C6) * 2 inst(sn,2) C6 C6 .

# Use a top-level BPM instead of channel-level bpm
bpm 160
channel 1 => inst leadA pat A
channel 4 => inst sn pat P
```

This plays the motif on channel 1, temporarily substituting the `sn` noise instrument for the next two non‑rest hits.

Running the demo (local)

1. Build the demo bundle (TypeScript -> browser):

```powershell
npm run build:demo
```

2. Serve the `demo/` folder locally and open the demo in a browser:

```powershell
npm run demo
# open http://127.0.0.1:8080
```

3. Controls in the demo:
- Paste or load a `.bax` file into the editor and click `Play` / `Apply & Play`.
- `Live` checkbox: when enabled, edits are applied (debounced) automatically.
- Per‑channel `Mute` / `Solo` controls appear after applying a song.
- Help panel: click the ❔ icon or the Show Help button (H / ? toggles the panel). The help panel surfaces the commented documentation inside `songs/sample.bax`.

Exports & CLI (planned / partial)
- The parser and export pipeline include JSON and MIDI export commands (see `src/export/`). The CLI wiring is present under `src/cli.ts` and `index.ts`. Use `npm run cli` or the `beatbax` CLI after building.

Troubleshooting
- If audio is silent in your browser, verify your browser supports WebAudio and that the demo did not throttle audio (autoplay policies may require a user gesture).
- You can inspect `window.__beatbax_player` in the console for runtime diagnostics.

That's all — for developer notes, see `DEVNOTES.md`.

## Buffered Rendering (Performance mode)

For heavy songs or many simultaneous events, BeatBax can pre-render short audio segments and schedule them as AudioBuffer playback to reduce real-time CPU work.

How it works
- The player groups events into fixed-length segments (default 0.5s), renders each segment with an `OfflineAudioContext`, then schedules the rendered `AudioBuffer` on the real `AudioContext` to play at the correct absolute time.
- This reduces the number of live oscillator/buffer-source objects created at playback time and can substantially lower CPU usage for dense arrangements.

Enabling buffered mode
The `Player` constructor accepts a `buffered` option and tuning parameters:

- `buffered` (boolean): enable buffered rendering.
- `segmentDuration` (number, seconds): length of each pre-render segment (default `0.5`).
- `bufferedLookahead` (number, seconds): how far ahead to start rendering a segment before its playback time (default `0.25`).
- `maxPreRenderSegments` (number): optional cap on how many future segments may be queued for pre-rendering; when the cap is reached, the renderer falls back to scheduling nodes directly on the live `AudioContext`.

Example (enable buffering):

```ts
import Player from 'beatbax/audio/playback';

const audioCtx = new AudioContext();
// Enable buffered rendering with a 0.5s segment and 0.3s lookahead, max 6 segments
const player = new Player(audioCtx, { buffered: true, segmentDuration: 0.5, bufferedLookahead: 0.3, maxPreRenderSegments: 6 });
await player.playAST(parsedAst);
```

Notes & tuning
- `segmentDuration` trade-offs:
  - Smaller segments reduce latency for updates/hot-reload and reduce memory per segment, but increase overhead (more segments to render).
  - Larger segments amortize render overhead but increase memory usage and make live edits take longer to reflect.
- `bufferedLookahead`: set this to a value slightly larger than the renderer's expected render time so buffers are ready before playback. Typical values: `0.2`–`0.5`.
- `maxPreRenderSegments`: prevents unbounded pre-rendering (useful for long songs or limited-memory environments). When this limit is reached, the system falls back to scheduling nodes directly, preserving correctness at the cost of higher CPU.

Stop / per-channel cleanup
- `Player.stop()` stops both live-scheduled nodes and any pre-rendered BufferSources that are scheduled to play.
- You can also stop buffered nodes per-channel using the buffered renderer API (exposed internally). If you want a public `stopChannel(chId)` helper added to `Player`, I can add it.

Fallbacks
- If `OfflineAudioContext` is not available, buffered rendering falls back to direct scheduling of events to maintain playback correctness.

When to use buffering
- Use buffered mode for complex songs with many simultaneous oscillators or when demo profiling shows high CPU. For simple songs, direct scheduling is usually fine and has lower latency for live edits.
