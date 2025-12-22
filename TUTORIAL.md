# BeatBax — Quick Tutorial

This tutorial shows how to write `.bax` songs, use the CLI for playback and export, and work with the browser demo. BeatBax is a complete live-coding language for Game Boy-style chiptunes with deterministic playback and multiple export formats.

**Files used in the demo**
- `songs/sample.bax` — example song shipped with the repo.
- `apps/web-ui/` — browser demo UI that loads and plays `.bax` files.

**Language Quick Reference**

- inst definitions: define instruments and their params.
  - Example: `inst leadA type=pulse1 duty=60 env=gb:12,down,1 gm=81`
  - Fields: `type` (pulse1|pulse2|wave|noise), `duty` (pulse duty %), `env` (envelope), `wave` (16-entry wavetable)
  - `gm` (optional): General MIDI program number (0-127). When present the MIDI
    exporter emits a Program Change for the corresponding track using this value.

- pat definitions: pattern tokens (notes, rests, named tokens, inline inst changes).
  - Notes: `C4`, `G#5`, `A3` — scientific pitch notation.
  - Rests: `.` (cuts the previous note).
  - Sustains: `_` or `-` (extends the previous note).
  - Duration shorthand: `C4:4` (equivalent to `C4 _ _ _`).
  - Grouping and repeat: `(C5 E5 G5)*2`
  - Named tokens: `snare` or `hihat` (mapped to `inst` entries by scheduler)
  - Inline temporary instrument override: `inst(name,N)` — next N non-rest tokens use `name`
  - Inline permanent instrument: `inst(name)` — change default instrument for the pattern

- seq / channel: map patterns and instruments to Game Boy channels
  - Example: `channel 1 => inst leadA pat melody` (use top-level `bpm 160` or per-channel `speed`/sequence transforms)
  - Channels: 1 (Pulse1), 2 (Pulse2), 3 (Wave), 4 (Noise)

Extended `seq` syntax examples
- Multiple sequences on one channel (comma-separated): `seq a,b` — plays `a` then `b`.
- Repetition: `seq a * 2` or shorthand `a*2` repeats `a` twice.
- Space-separated list: `seq a b` is a shorthand for multiple items.
- Parenthesized group repetition: `(a b)*2` repeats the group twice.

Examples:
```
# comma-separated and space-separated
channel 1 => inst leadA seq lead,lead2
channel 2 => inst bass  seq lead lead2

# repetition and group repetition
seq bass_repeat = bass_pat*2
seq arranged = (lead_pat lead_alt)*2 bass_repeat
channel 3 => inst wave1 seq arranged
```

Notes:
- Inline modifiers may be applied per-item, e.g. `lead:inst(leadB):slow(2)`.
- The parser and CLI validate sequence definitions; empty `seq NAME =` lines are reported as errors by `verify`, and `play`/`export` will abort on such errors.

**Transforms (applied at parse/expansion time)**
- `:oct(n)` — transpose by octaves
- `:+N` or `:-N` — semitone transpose
- `:rev` — reverse pattern
- `:slow(N)` — repeat each token N times (default 2)
- `:fast(N)` — take every Nth token (default 2)

**Tempo & Per-Channel Speed**

- Set a master tempo with a top-level directive: `bpm 128` or `bpm=128`.
- Per-channel multipliers: use `speed=2` or `speed=2x` on a channel to play
  that channel at a multiple of the master BPM. Example: `speed=2x` plays
  twice as fast as the master tempo.

Example:
```
# Use master tempo 128 BPM
bpm 128

# Channel 1 uses master BPM (128)
channel 1 => inst leadA seq lead

# Channel 2 runs twice as fast (240 BPM effective) using a speed multiplier
channel 2 => inst leadB seq bass speed=2x
```

**Example pattern snippet**
```
inst leadA type=pulse1 duty=60 env=gb:12,down,7 gm=81
inst sn type=noise env=gb:10,down,1

# C5:4 plays for 4 ticks; E5 _ _ _ also plays for 4 ticks
pat melody = C5:4 E5 _ _ _ (G5 C6)*2 inst(sn,2) C6 C6 .

# Use a top-level BPM instead of channel-level bpm
bpm 160
channel 1 => inst leadA pat melody
channel 4 => inst sn pat drums
```

This plays the motif on channel 1, temporarily substituting the `sn` noise instrument for the next two non‑rest hits.

## Using the CLI

BeatBax provides a command-line interface for playback, validation, and export.

### Play a song

```powershell
npm run cli -- play songs\sample.bax
```

This parses the song and starts WebAudio playback (requires a browser environment or Node with audio support).

### Verify/validate a song

```powershell
npm run cli -- verify songs\sample.bax
```

Checks the song for parsing errors and basic validation issues (undefined instruments, empty patterns, etc.).

### Export formats

BeatBax supports three export formats:

**JSON** (Intermediate Song Model):
```powershell
npm run cli -- export json songs\sample.bax --out output.json
```

**MIDI** (4-track Standard MIDI File):
```powershell
npm run cli -- export midi songs\sample.bax --out output.mid
```

**UGE** (hUGETracker v6 format for Game Boy):
```powershell
npm run cli -- export uge songs\sample.bax --out output.uge
```
*Note: UGE files use a fixed 64-row pattern grid. BeatBax automatically splits longer sequences into multiple 64-row patterns and synchronizes the order list across all 4 channels. For best results, keep your pattern definitions to multiples of 16 or 64 tokens.*

**WAV** (Offline PCM rendering):
```powershell
npm run cli -- export wav songs\sample.bax --out output.wav
```
The UGE files can be opened in hUGETracker or processed with uge2source.exe for Game Boy ROM development.

### Development mode

For faster iteration without rebuilding:

```powershell
npm run cli:dev -- play songs\sample.bax
```

## Running the demo (local)

1. Build the web UI bundle (TypeScript -> browser):

```powershell
npm run web-ui:build
```

2. Run the web UI dev server and open it in a browser:

```powershell
npm run web-ui:dev
# open the URL shown by Vite (usually http://127.0.0.1:5173)
```

3. Controls in the demo:
- Paste or load a `.bax` file into the editor and click `Play` / `Apply & Play`.
- `Live` checkbox: when enabled, edits are applied (debounced) automatically.
- Per‑channel `Mute` / `Solo` controls appear after applying a song.
- Help panel: click the ❓ icon or the Show Help button (H / ? toggles the panel). The help panel surfaces the commented documentation inside `songs/sample.bax`.

## Troubleshooting
- If audio is silent in your browser, verify your browser supports WebAudio and that the demo did not throttle audio (autoplay policies may require a user gesture).
- You can inspect `window.__beatbax_player` in the console for runtime diagnostics.

That's all — for developer notes, see `DEVNOTES.md`.

## Importing UGE Files

BeatBax includes a UGE reader that can parse hUGETracker v6 files:

```typescript
import { readUGEFile } from 'beatbax/import';

const ugeSong = await readUGEFile('path/to/song.uge');
console.log(ugeSong.songName, ugeSong.artist);
console.log('Instruments:', ugeSong.dutyInstruments.length);
console.log('Patterns:', ugeSong.patterns.length);
```

The UGE reader provides full access to instrument tables, pattern data, order lists, and song metadata. See `packages/engine/src/import/uge/uge.reader.ts` for the complete API.

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
