---
"@beatbax/engine": minor
---

Parse hUGETracker `.uge` v1–v6 (not only BeatBax-exported v6) and extract instruments to `.ins` source.

`readUGEFile` / `parseUGE` now follow GB Studio’s instrument, wavetable, and pattern layout: mixed 15-slot banks on v1–v2, typed 45-slot banks from v3, v4–v5 noise macros migrated to subpattern rows, and `noiseMode` on noise instruments. `extractUgeInstrumentLibrary` maps duty/wave/noise slots (plus `subpat`) into BeatBax kit source with sanitized names and clash renaming.
