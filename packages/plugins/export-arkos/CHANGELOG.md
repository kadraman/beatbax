# @beatbax/plugin-exporter-arkos

## 0.2.0

### Minor Changes

- 06404e3: Add experimental Arkos Tracker 3 exporter for Spectrum/CPC and related preview/export fixes.
  - New `@beatbax/plugin-exporter-arkos`: export `.aks` songs (CLI + desktop/browser) and optional `.aki` instrument banks via `export arkos --instruments`.
  - v1 subset: notes/rests/sustains, `vol`, `noise_rate`, `tone_mix`, `tone`; fail-hard diagnostics for unsupported macros/effects.
  - Fix MIDI→Arkos octave mapping (`midi − 12`), looping sustain cells, and export download naming (prefer open `.bax` stem).
  - Spectrum/CPC preview: AY logarithmic DAC volume curve with ~0.85 full-mix peak target (parity with NES/SMS loudness).
  - CLI/desktop wiring, toolbar AKS icon, and docs for the experimental release.
