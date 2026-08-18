---
"@beatbax/engine": patch
"@beatbax/app-core": patch
---

Export BeatBax `vib` to hUGETracker as 1xx/2xx pitch slides instead of 4xy trills.

hUGE 4xy is a one-sided square period toggle, so named presets sounded harsh in GB Studio. The exporter clones the instrument with a looping tick-rate 1xx/2xx subpattern when a slot is free, and falls back to pattern-row 1xx/2xx when the instrument already has a program or the 15-slot table is full. Editor hover for `vib` now describes that mapping.
