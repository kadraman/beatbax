---
"@beatbax/engine": minor
"@beatbax/plugin-chip-spectrum-128": minor
"@beatbax/cli": patch
---

Add ZX Spectrum 128 / Amstrad CPC AY-3-8912 chip plugin and engine support for song-level validation and inline software macros.

### @beatbax/plugin-chip-spectrum-128 (new)

- New chip plugin for AY-3-8912 PSG: three tone channels, tone+noise mixing, hardware `vol_env` / `env_bass`, software `arp_env` / `pitch_env`, and tick-aware song validation for global R6 / R11–R13 conflicts.
- Platform profiles for Spectrum 128 (1.7734 MHz AY) and Amstrad CPC (1 MHz) via `chip spectrum-128` / `chip cpc` aliases and `configureForSong`.
- PCM render path with register arbitrator, envelope generator, and demo songs under `songs/spectrum-128/`.

### @beatbax/engine

- Export `getSongValidationIssues()` for chip plugins’ optional `validateSong()` hook; add `SongValidationContext` and `validateSong?` on `ChipPlugin`.
- Shared inline render effects (`applyInlineRenderEffects`) for `arp_env`, `pitch_env`, and `noise_rate_env` in playback and PCM render; optional `prepareNoteRender` on channel backends.
- `ChipConsoleVariant` / `buildHelpSections` for multi-console New Song Wizard and variant-aware help; `ChipHelpContext` with `chip` / `chipRegion`.
- Parser: additional chip aliases and chip directive handling for Spectrum targets.

### @beatbax/cli

- Run song-level chip validation after import resolution in `verify` (warnings for shared-resource overlaps when imports are present).
