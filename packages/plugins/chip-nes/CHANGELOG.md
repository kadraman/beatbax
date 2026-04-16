# @beatbax/plugin-chip-nes

## 0.2.0

### Patch Changes

- Normalised volume so that maximum amplitude matches the Game Boy backends in the browser.
- Compatible with @beatbax/engine@0.10.0

## 0.1.0

### Minor Changes

- Initial release of the NES Ricoh 2A03 APU chip plugin. Implements 5 channels (Pulse 1, Pulse 2, Triangle, Noise, DMC) with envelope, length counter, linear counter, sweep, and bundled DMC sample support. Auto-discovered by the BeatBax CLI via the `@beatbax/plugin-chip-*` naming convention.
