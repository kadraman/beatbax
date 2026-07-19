# @beatbax/plugin-chip-spectrum-128

## 0.2.3

### Patch Changes

- 06404e3: Add experimental Arkos Tracker 3 exporter for Spectrum/CPC and related preview/export fixes.
  - New `@beatbax/plugin-exporter-arkos`: export `.aks` songs (CLI + desktop/browser) and optional `.aki` instrument banks via `export arkos --instruments`.
  - v1 subset: notes/rests/sustains, `vol`, `noise_rate`, `tone_mix`, `tone`; fail-hard diagnostics for unsupported macros/effects.
  - Fix MIDI→Arkos octave mapping (`midi − 12`), looping sustain cells, and export download naming (prefer open `.bax` stem).
  - Spectrum/CPC preview: AY logarithmic DAC volume curve with ~0.85 full-mix peak target (parity with NES/SMS loudness).
  - CLI/desktop wiring, toolbar AKS icon, and docs for the experimental release.

## 0.2.2

### Patch Changes

- cdddca3: Standardize chip platform profile configuration across the engine and chip plugins.

  The engine now exposes a typed `ChipSongContext` and optional `ChipPlugin.configureForSong()` hook, and playback/PCM rendering call the hook without `any` casts. Spectrum/CPC platform selection is aligned around `chip cpc` / `chip amstrad-cpc` aliases, while SMS and NES keep their `pal` / `ntsc` region qualifiers. UI hints, validation, docs, and regression tests were updated to match the new author-facing syntax.

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
