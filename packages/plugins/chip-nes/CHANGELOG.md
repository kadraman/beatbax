# @beatbax/plugin-chip-nes

## 0.3.1

### Patch Changes

- corrected dependency order

## 0.3.0

### Minor Changes

- Wire FamiTracker exporters into nesPlugin via exporterPlugins field; installing plugin-chip-nes now auto-registers famitracker and famitracker-text exporters.

## 0.2.2

### Patch Changes

- d72b0c6: Implements dual rendering and UI contributions for web UI.
- d72b0c6: (If present) Bundles exporter plugins for native tracker formats.
- Updated dependencies [d72b0c6]
  - @beatbax/engine@0.11.0

## 0.2.1

### Patch Changes

- 110f990: Added individual channel volume specifications.
- Updated dependencies [110f990]
  - @beatbax/engine@0.10.1

## 0.2.0

### Patch Changes

- Normalised volume so that maximum amplitude matches the Game Boy backends in the browser.
- Compatible with @beatbax/engine@0.10.0

## 0.1.0

### Minor Changes

- Initial release of the NES Ricoh 2A03 APU chip plugin. Implements 5 channels (Pulse 1, Pulse 2, Triangle, Noise, DMC) with envelope, length counter, linear counter, sweep, and bundled DMC sample support. Auto-discovered by the BeatBax CLI via the `@beatbax/plugin-chip-*` naming convention.
