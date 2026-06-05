# @beatbax/plugin-exporter-famitracker

## 0.2.3

### Patch Changes

- 004f40d: Move the NES Ricoh 2A03 APU into `@beatbax/engine` as a built-in chip alongside Game Boy.
  - Accept `chip famicom` for FamiTracker Text export via `chipRegistry.resolve()` (not strict `chip === 'nes'`).
  - Advertise `famicom` in `supportedChips` and raise minimum `@beatbax/engine` peer dependency to `>=0.18.0`.

## 0.2.2

### Patch Changes

- b6ce433: Refactor shared music utilities into the engine and expose them through the plugin API, then migrate chip/exporter packages to consume the centralized utilities. Improve VGM exporter backend behavior and alias handling, including normalized SN76489-family chip alias validation consistency (for example underscore/hyphen variants), plus regression coverage and SN76489 flush behavior documentation clarification.

## 0.2.1

### Patch Changes

- 33fa3d7: - Normalize NES DMC WebAudio loudness to match normalized channel playback without affecting hardware-scaled PCM rendering.
  - Warn when FamiTracker export patterns use non-power-of-2 row counts to avoid silent boundary rows and improve export diagnostics.
- Updated dependencies [e1dd039]
- Updated dependencies [b5dcde4]
  - @beatbax/engine@0.11.2

## 0.2.0

### Minor Changes

- 09be2ac: Implement and harden FamiTracker Text export, including macro/pattern handling, safer mapping behaviour and stronger test coverage.

### Patch Changes

- Updated dependencies [09be2ac]
  - @beatbax/engine@0.11.1

## 0.1.1

### Patch Changes

- republished to restore website

## 0.1.0

### Minor Changes

- d72b0c6: Initial externalized version
- Updated dependencies [d72b0c6]
  - @beatbax/engine@0.11.0
