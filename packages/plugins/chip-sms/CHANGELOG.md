# @beatbax/plugin-chip-sms

## 0.3.3

### Patch Changes

- cdddca3: Fix SMS note-cut clicks by preserving scheduled gain levels when applying cut effects.

  SMS WebAudio gain scheduling now records envelope metadata so the engine cut effect can ramp down from the actual scheduled gain instead of jumping to the AudioParam default value.

- cdddca3: Standardize chip platform profile configuration across the engine and chip plugins.

  The engine now exposes a typed `ChipSongContext` and optional `ChipPlugin.configureForSong()` hook, and playback/PCM rendering call the hook without `any` casts. Spectrum/CPC platform selection is aligned around `chip cpc` / `chip amstrad-cpc` aliases, while SMS and NES keep their `pal` / `ntsc` region qualifiers. UI hints, validation, docs, and regression tests were updated to match the new author-facing syntax.

## 0.3.2

### Patch Changes

- b4be200: Web Audio loudness, clipping prevention, chip-aware meters, and CLI/web-ui WAV export parity.
  ### @beatbax/plugin-chip-sms
  - **Loudness parity**: remove `setSmsWebAudioMixMode`, `getSmsWebAudioMixMode`, `getSmsWebAudioNorm`, and the Web-Audio-only 0.7× normalization; unify PCM and Web Audio on `SMS_MIX_GAIN`.
  - Retune `SMS_MASTER_GAIN` for ~0.85 headroom when all four channels play at max attenuation (prevents web-ui clipping on dense arrangements).
  - Add `getMeterDisplayGain()` for tone (ch 0–2) and noise (ch 3) channels.
  - Export `SMS_TARGET_PEAK` and `SMS_MASTER_GAIN` from the plugin entry point.
  - Tests for full-arrangement peak target and meter display gain values.

## 0.3.1

### Patch Changes

- d500a1e: Web UI song-editing polish: chip-aware instrument hovers, MIDI idle preview, editor UX improvements, and parser validation fixes.
  - Add `hoverDocs` for `type` and `vol` (SMS attenuation semantics documented for editor hovers).

## 0.3.0

### Minor Changes

- accf3b7: Removed async chip-exporter auto-resolution and standardized explicit exporter registration.
  Chip plugins should register exporters via exporterPlugins (or host/CLI registration), not runtime resolve hooks.
  Also includes web-ui build warning cleanup and feature/spec documentation alignment.

## 0.2.3

### Patch Changes

- b6ce433: Refactor shared music utilities into the engine and expose them through the plugin API, then migrate chip/exporter packages to consume the centralized utilities. Improve VGM exporter backend behavior and alias handling, including normalized SN76489-family chip alias validation consistency (for example underscore/hyphen variants), plus regression coverage and SN76489 flush behavior documentation clarification.

## 0.2.2

### Patch Changes

- 38fe1e5: Move SMS New Song wizard metadata/templates into a dedicated `songWizard` module and wire it through the plugin `newSongWizard` field.

  Keep SMS `ui-contributions` focused on Copilot prompt, hover docs, and Help panel content to improve maintainability.

## 0.2.1

### Patch Changes

- dc5c6ab: Fixed noise channel frequency calculation and volume slide behaviour to correctly match SN76489 hardware semantics.
  - Corrected noise channel period/rate mapping in `noise.ts` and `periodTables.ts`
  - Fixed `volSlide.ts` to apply attenuation correctly during playback
  - Updated `index.ts` to expose `noise_rate_env` and `vol_env` effect support so they are forwarded from the playback engine

## 0.2.0

### Minor Changes

- b25cd91: New SMS PSG chip plugin for the Sega Master System / Game Gear SN76489 APU.

Provides four channels: three tone generators and one noise channel. Supports:

- Accurate NTSC/PAL clock region selection via `chip sms ntsc` / `chip sms pal`
- Correct attenuation-based volume semantics (0 = loudest, 15 = silent) throughout, including vol_env macros, volSlide effect, and buildVolEnvGainCurve
- Software macros: vol_env, noise_rate_env, arp_env, pitch_env
- Chip-specific effect handlers (volSlide, arp, vib, portamento, pan) resolved at playback time for the active chip only — no global effect pollution
- Game Gear stereo panning via pan effect
- Tone3 coordinator for shared-clock noise sync, using synchronous import
- PCM and Web Audio dual rendering paths
- Instrument validation with descriptive errors
- UI contributions for the web editor
