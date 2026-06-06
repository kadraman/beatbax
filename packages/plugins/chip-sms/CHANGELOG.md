# @beatbax/plugin-chip-sms

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
