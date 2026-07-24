---
"@beatbax/engine": patch
---

Honor Game Boy wave instrument tick programs (`pitch_env` / `vol_env` / `subpat`) in preview and PCM, matching UGE subpattern export.

- Apply shared `lowerGameBoyInstrumentProgram` offsets (and optional volume steps) in `renderWave` and WebAudio `playWavetable`.
- Add `gbWaveProgramPlayback` coverage for wave `pitch_env` lowering and audible PCM difference vs a static wave kick.
