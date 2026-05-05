---
"@beatbax/plugin-exporter-vgm": minor
"@beatbax/engine": minor
"@beatbax/plugin-chip-sms": patch
"@beatbax/cli": patch
"@beatbax/web-ui": patch
---

## `@beatbax/plugin-exporter-vgm` — new package

Implements a VGM (Video Game Music) exporter plugin for BeatBax SMS/Game Gear songs using the SN76489 PSG chip.

- Converts validated ISM to a standards-compliant VGM v1.51 file
- Supports all four SN76489 channels: three tone channels and the noise channel
- Exports volume, frequency, noise mode, and noise rate data
- Supports effects: `vol_env`, `noise_rate_env`, `gg_stereo` (Game Gear stereo panning via `0x4F` writes)
- Includes GD3 metadata tag generation
- Produces files compatible with VGMPlay and similar players
- Registered as a plugin via the BeatBax plugin architecture; does not modify core

## `@beatbax/engine`

Added inline macro effect support and fixed portamento frequency seeding.

- `parseEffectParams` now splits on top-level commas only, preserving bracketed inline macro payloads (e.g. `pitch_env:[0,2,0,-2,0]`). Previously, bracketed arrays were incorrectly split.
- Added `pitch_env` (inline pitch envelope macro) and `vol_env` (inline volume envelope macro) effect handlers in the effects registry.
- Fixed portamento (`port` effect) to correctly seed the starting frequency from the previous note using `_prevFreq`, fixing cases where portamento began from the wrong frequency when the preceding note did not also use `port`.
- Playback engine now tracks the last played frequency per channel (`_lastNoteFreqByChannel`) and seeds it onto oscillator nodes before effects are applied.
- Inline instrument-property effects (`noise_rate_env`, `vol_env`) are now merged into the effective instrument before `createPlaybackNodes` is called, enabling chip plugins to receive them.

## `@beatbax/plugin-chip-sms`

Fixed noise channel frequency calculation and volume slide behaviour to correctly match SN76489 hardware semantics.

- Corrected noise channel period/rate mapping in `noise.ts` and `periodTables.ts`
- Fixed `volSlide.ts` to apply attenuation correctly during playback
- Updated `index.ts` to expose `noise_rate_env` and `vol_env` effect support so they are forwarded from the playback engine

## `@beatbax/cli`

Fixed CLI export path for VGM exporter integration tests and updated integration tests to cover the new `@beatbax/plugin-exporter-vgm` plugin.

## `@beatbax/web-ui`

Registered `@beatbax/plugin-exporter-vgm` as an available exporter. Added "Export VGM" entries to the menu bar and toolbar using the plugin's menu/toolbar provider hooks.
