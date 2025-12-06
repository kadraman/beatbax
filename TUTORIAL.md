# BeatBax — Quick Tutorial

This short tutorial shows how to write a small `.bax` song, run the browser demo, and export the result. It focuses on the Day‑2 MVP features: two pulse channels, a wavetable channel, a noise channel, deterministic scheduling, and live playback from parsed text.

**Files used in the demo**
- `songs/sample.bax` — example song shipped with the repo.
- `demo/` — browser demo UI that loads and plays `.bax` files.

**Language Quick Reference**

- inst definitions: define instruments and their params.
  - Example: `inst leadA type=pulse1 duty=60 env=12,down`
  - Fields: `type` (pulse1|pulse2|wave|noise), `duty` (pulse duty %), `env` (envelope), `wave` (16-entry wavetable)

- pat definitions: pattern tokens (notes, rests, named tokens, inline inst changes).
  - Notes: `C4`, `G#5`, `A3` — scientific pitch notation.
  - Rests: `.`
  - Grouping and repeat: `(C5 E5 G5)*2`
  - Named tokens: `snare` or `hihat` (mapped to `inst` entries by scheduler)
  - Inline temporary instrument override: `inst(name,N)` — next N non-rest tokens use `name`
  - Inline permanent instrument: `inst(name)` — change default instrument for the pattern

- seq / channel: map patterns and instruments to Game Boy channels
  - Example: `channel 1 => inst leadA pat A bpm=160`
  - Channels: 1 (Pulse1), 2 (Pulse2), 3 (Wave), 4 (Noise)

**Transforms (applied at parse/expansion time)**
- `:oct(n)` — transpose by octaves
- `:+N` or `:-N` — semitone transpose
- `:rev` — reverse pattern
- `:slow(N)` — repeat each token N times (default 2)
- `:fast(N)` — take every Nth token (default 2)

**Example pattern snippet**
```
inst leadA type=pulse1 duty=60 env=12,down
inst sn type=noise env=10,down

pat A = (C5 E5 G5 C6) * 2 inst(sn,2) C6 C6 .
channel 1 => inst leadA pat A bpm=160
channel 4 => inst sn pat P bpm=160
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
