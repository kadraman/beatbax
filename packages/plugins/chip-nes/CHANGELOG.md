# @beatbax/plugin-chip-nes

## 2.0.0

### Patch Changes

- 1a07f2f: Normalised volume so that maximum amplitude matches the Game Boy backends in the browser.
- Updated dependencies [30f54a1]
  - @beatbax/engine@0.10.0

## 1.0.0

### Minor Changes

- 7b431d8: Initial release of the NES Ricoh 2A03 APU chip plugin. Implements 5 channels (Pulse 1, Pulse 2, Triangle, Noise, DMC) with envelope, length counter, linear counter, sweep, and bundled DMC sample support. Auto-discovered by the BeatBax CLI via the `@beatbax/plugin-chip-*` naming convention.

### Patch Changes

- Updated dependencies [7b431d8]
  - @beatbax/engine@0.9.0
