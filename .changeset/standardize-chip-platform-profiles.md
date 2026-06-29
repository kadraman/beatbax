---
"@beatbax/engine": patch
"@beatbax/plugin-chip-spectrum-128": patch
"@beatbax/plugin-chip-sms": patch
---

Standardize chip platform profile configuration across the engine and chip plugins.

The engine now exposes a typed `ChipSongContext` and optional `ChipPlugin.configureForSong()` hook, and playback/PCM rendering call the hook without `any` casts. Spectrum/CPC platform selection is aligned around `chip cpc` / `chip amstrad-cpc` aliases, while SMS and NES keep their `pal` / `ntsc` region qualifiers. UI hints, validation, docs, and regression tests were updated to match the new author-facing syntax.
