# @beatbax/plugin-chip-nes

## 0.6.0

### Minor Changes

- accf3b7: Removed async chip-exporter auto-resolution and standardized explicit exporter registration.
  Chip plugins should register exporters via exporterPlugins (or host/CLI registration), not runtime resolve hooks.
  Also includes web-ui build warning cleanup and feature/spec documentation alignment.

## 0.5.2

### Patch Changes

- b6ce433: Refactor shared music utilities into the engine and expose them through the plugin API, then migrate chip/exporter packages to consume the centralized utilities. Improve VGM exporter backend behavior and alias handling, including normalized SN76489-family chip alias validation consistency (for example underscore/hyphen variants), plus regression coverage and SN76489 flush behavior documentation clarification.

## 0.5.1

### Patch Changes

- 38fe1e5: Move NES New Song wizard metadata/templates into a dedicated `songWizard` module and wire it through the plugin `newSongWizard` field.

  Keep NES `ui-contributions` focused on Copilot prompt, hover docs, and Help panel content to improve maintainability.

## 0.5.0

### Minor Changes

- b25cd91: Added NTSC/PAL clock region support for the NES Ricoh 2A03 APU.
- b25cd91: `chip nes ntsc` / `chip nes pal` selects the CPU clock (1,789,773 Hz vs 1,662,607 Hz)
- b25cd91: All five channel backends (pulse1, pulse2, triangle, noise, DMC) now use the live NES_CLOCK binding — no hardcoded 1789773 literals remain in pulse.ts or triangle.ts
- b25cd91: Added PAL noise period table and PAL DMC rate table; getNoisePeriodTable() and getDmcRateTable() return the correct table for the active region
- b25cd91: configureForSong() hook calls setNesClockRegion() before each playback or PCM render
- b25cd91: Exports setNesClockRegion, getNesClockRegion, NES_CLOCK_NTSC, NES_CLOCK_PAL, and the PAL tables

## 0.4.1

### Patch Changes

- 33fa3d7: - Normalize NES DMC WebAudio loudness to match normalized channel playback without affecting hardware-scaled PCM rendering.
- Updated dependencies [e1dd039]
- Updated dependencies [b5dcde4]
  - @beatbax/engine@0.11.2

## 0.4.0

### Minor Changes

- 09be2ac: Support optional FamiTracker exporter loading and improve NES mix/gain behavior for playback and export integration.

### Patch Changes

- Updated dependencies [09be2ac]
  - @beatbax/engine@0.11.1

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
