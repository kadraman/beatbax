---
"@beatbax/plugin-chip-spectrum-128": patch
---

Use an AY logarithmic DAC volume table for Spectrum/CPC preview, peak-normalised to ~0.85 full-mix headroom (same target as NES/SMS).

- Mid `vol` steps now follow hardware-accurate relative levels instead of linear `vol/15`.
- Overall preview loudness stays comparable when switching between Game Boy, NES, SMS, and Spectrum songs.
- Absolute LUFS may still differ from Arkos Tracker WAV exports; document the split between curve shape and peak target.
