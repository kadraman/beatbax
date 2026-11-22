# QA: WebAudio ↔ PCM effect parity (spec 112)

## Manual listen

1. Open `songs/gameboy/tutorial_groove.bax` in Desktop — play (live WebAudio).
2. `npx beatbax play songs/gameboy/tutorial_groove.bax` (PCM — fast).
3. `npx beatbax export wav songs/gameboy/tutorial_groove.bax tmp/tutorial_groove.wav` (PCM, same path as play).
4. Confirm wobble (ch1), spark arps (ch2), bass slides (ch3) vs Desktop; note remaining gaps tracked by spec 112.

## Automated

```bash
npx jest packages/engine/tests/modulation.test.ts packages/engine/tests/pcmRenderer.echo.test.ts packages/engine/tests/pcmRenderer.wave-arp.test.ts packages/engine/tests/parity.tutorial_groove.smoke.test.ts --no-coverage
```

T015 uses Chromium Offline fixtures vs PCM with **active-region windowed** correlation (see `specs/features/112-webaudio-pcm-effect-parity/research.md`). Re-capture refs:

```bash
node packages/engine/scripts/capture-webaudio-ref.mjs --compare
```
