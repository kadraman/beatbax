# QA: WebAudio ↔ PCM effect parity (spec 112)

## Listens (2026-11-22)

Desktop live is the reference. CLI play and WAV export use PCM.

- `songs/gameboy/tutorial_groove.bax`: SC-001 passes against offline WebAudio for channels 1–4 and the full mix (T055). Author listen is T056.
- `songs/gameboy/effects/` (`gb_vibrato_demo.bax`, `gb_arpeggio_demo.bax`, `gb_portamento_demo.bax`, `gb_tremolo_demo.bax`, `gb_notecut_demo.bax`, `gb_echo_demo.bax`, `gb_retrigger_demo.bax`): author listen matches Desktop and CLI/WAV (T057). Accepted measurement residuals are in `specs/complete/112-webaudio-pcm-effect-parity/plan.md`. Echo’s remaining gap is issue 279. Noise note effects stay issue 277.

`songs/gameboy/tutorial_groove.wav` and the channel stems on disk predate this PCM path and are not the sign-off fixtures (T902).

## Measure

From `packages/engine`, after `npx tsc -b` so capture reads `dist/`:

```bash
node scripts/parity/capture.mjs ..\..\songs\gameboy\effects\<song>.bax --offline-only --pcm-gate
```

Exit 1 when PCM misses the offline render. A noise-channel warning is expected and is not a gate failure.
