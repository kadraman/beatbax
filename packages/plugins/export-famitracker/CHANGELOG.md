# @beatbax/plugin-exporter-famitracker

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
