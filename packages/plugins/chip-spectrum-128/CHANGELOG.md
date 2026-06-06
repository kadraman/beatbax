# @beatbax/plugin-chip-spectrum-128

## 0.2.1

### Patch Changes

- d500a1e: Web UI song-editing polish: chip-aware instrument hovers, MIDI idle preview, editor UX improvements, and parser validation fixes.
  - Add `hoverDocs` for `type` and per-channel `tone1` / `tone2` / `tone3` (editor keyword and value hovers).

## 0.2.0

### Minor Changes

- a115c2c: Add ZX Spectrum 128 / Amstrad CPC AY-3-8912 chip plugin and engine support for song-level validation and inline software macros.
  - New chip plugin for AY-3-8912 PSG: three tone channels, tone+noise mixing, hardware `vol_env` / `env_bass`, software `arp_env` / `pitch_env`, and tick-aware song validation for global R6 / R11–R13 conflicts.
  - Platform profiles for Spectrum 128 (1.7734 MHz AY) and Amstrad CPC (1 MHz) via `chip spectrum-128` / `chip cpc` aliases and `configureForSong`.
  - PCM render path with register arbitrator, envelope generator, and demo songs under `songs/spectrum-128/`.
