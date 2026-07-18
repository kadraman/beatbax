---
"@beatbax/engine": minor
"@beatbax/app-core": patch
---

Add Game Boy instrument programs that lower macros and native `subpat` into a shared tick IR for preview/WAV and hUGETracker UGE instrument subpatterns.

- Support `pitch_env` / `vol_env` / `duty_env` / `arp_env` and native `subpat` (`jump:`, `vol:`, `timbre:`, `fx:`, `halt`, empty rows) on `chip gameboy`.
- Drive pulse/noise WebAudio and PCM from the same tick program as UGE export (`lowerGameBoyInstrumentProgram`).
- Encode/decode UGE v6 subpattern rows; one-shot macros halt so they do not auto-loop.
- Clamp tick offsets and `jump:` targets to UGE-representable ranges (with warnings) so preview and export stay aligned.
- Cache tick timelines / cursors for O(1) per-tick playback on long held notes.
- Retune pulse mix gain for closer hUGETracker WAV parity on sustained tones.
- Editor completions and hover for `subpat` / instrument program fields in app-core.
