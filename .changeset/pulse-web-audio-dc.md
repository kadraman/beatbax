---
"@beatbax/engine": patch
---

Restore Game Boy and NES pulse DC in Web Audio so non-50% duties match bipolar PCM levels (PeriodicWave is AC-only; ConstantSourceNode supplies `2d − 1`).
