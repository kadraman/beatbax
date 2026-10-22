---
"@beatbax/engine": minor
"@beatbax/plugin-chip-sms": patch
"@beatbax/plugin-chip-spectrum-128": patch
---

Instrument Editor preview metadata (spec 098): `ChipInstrumentTypeDef` gains optional `previewMode` / `previewOctave`; NES plugins may publish `bundledSampleMeta`. Chip schemas set per-type defaults (e.g. GB wave / NES triangle octave 2; SMS tone3 octave 3 for SN76489 period floor; noise/DMC oneshot; GB noise `uge_note`). Spectrum/SMS schemas include the new preview fields only — no playback change.
