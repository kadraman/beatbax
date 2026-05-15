# @beatbax/plugin-exporter-vgm

## 0.1.4

### Patch Changes

- accf3b7: Removed async chip-exporter auto-resolution and standardized explicit exporter registration.
  Chip plugins should register exporters via exporterPlugins (or host/CLI registration), not runtime resolve hooks.
  Also includes web-ui build warning cleanup and feature/spec documentation alignment.

## 0.1.3

### Patch Changes

- 7bbd4a7: Expose `midiToFreqForNote` through the engine public API and update the VGM exporter to use the consolidated engine utilities. Tighten the exporter’s engine peer range accordingly and add regression coverage for the shared music utility contract and VGM backend behavior.

## 0.1.2

### Patch Changes

- b6ce433: Refactor shared music utilities into the engine and expose them through the plugin API, then migrate chip/exporter packages to consume the centralized utilities. Improve VGM exporter backend behavior and alias handling, including normalized SN76489-family chip alias validation consistency (for example underscore/hyphen variants), plus regression coverage and SN76489 flush behavior documentation clarification.

## 0.1.1

### Patch Changes

- aaa1c8f: Refactor the VGM exporter into a multi-chip backend architecture, extract shared channel simulation logic, add AY backend scaffolding and registry/tests, and include header/offset fixes plus implementation docs.

## 0.1.0

### Minor Changes

- dc5c6ab: new package

  Implements a VGM (Video Game Music) exporter plugin for BeatBax SMS/Game Gear songs using the SN76489 PSG chip.
  - Converts validated ISM to a standards-compliant VGM v1.51 file
  - Supports all four SN76489 channels: three tone channels and the noise channel
  - Exports volume, frequency, noise mode, and noise rate data
  - Supports effects: `vol_env`, `noise_rate_env`, `gg_stereo` (Game Gear stereo panning via `0x4F` writes)
  - Includes GD3 metadata tag generation
  - Produces files compatible with VGMPlay and similar players
  - Registered as a plugin via the BeatBax plugin architecture; does not modify core
