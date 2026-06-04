# @beatbax/cli

## 0.4.8

### Patch Changes

- a115c2c: Run song-level chip validation after import resolution in `verify` (warnings for shared-resource overlaps when imports are present).

- Updated dependencies [cfff62d]
- Updated dependencies [a115c2c]
  - @beatbax/engine@0.18.0

## 0.4.7

### Patch Changes

- 115eacb: Improve Peggy parser diagnostics for mistyped sequence transforms, including better suggestions and locations, and update CLI test resolution to use local engine TypeScript sources reliably.
- 2b6bbbe: Improve WAV-to-DMC conversion correctness, validation, and paste-safe output.
  - NES DMC encoding:
    - Removed unintended global NES clock-region mutation during encoding.
    - Capped pre-resample and resampled working lengths from maxBytes and rateHz to avoid unnecessary work on long inputs.
    - Reused shared greedy DMC bit-selection logic to remove duplicated encoder logic.
    - Tightened emitted instrument-name sanitization to match identifier rules (no leading digits).
    - Made emitted local sample refs paste-safe by percent-encoding spaces and decoding on load.
  - CLI wav2dmc:
    - Fixed -q/--rate alias precedence over defaulted --dmc-rate.
    - Changed --dmc-rate handling to reject invalid, non-integer, or out-of-range values instead of silently clamping/defaulting.
    - Added integration coverage for invalid rate inputs and spaced output paths in --emit-inst output.
  - Engine WAV reader:
    - Fixed truncated data-chunk handling to size output by bytes actually present, avoiding silent zero-padded tails.
    - Added focused wavReader truncation regression tests.

- Updated dependencies [13e278f]
- Updated dependencies [115eacb]
- Updated dependencies [e195402]
- Updated dependencies [7dfccea]
- Updated dependencies [b6e80c9]
- Updated dependencies [2b6bbbe]
- Updated dependencies [b739513]
- Updated dependencies [738e2e3]
  - @beatbax/engine@0.17.0
  - @beatbax/plugin-chip-nes@0.6.1

## 0.4.6

### Patch Changes

- Updated dependencies [accf3b7]
  - @beatbax/engine@0.16.0
  - @beatbax/plugin-chip-nes@0.6.0
  - @beatbax/plugin-chip-sms@0.3.0
  - @beatbax/plugin-exporter-vgm@0.1.4

## 0.4.5

### Patch Changes

- Updated dependencies [7bbd4a7]
  - @beatbax/engine@0.15.0
  - @beatbax/plugin-exporter-vgm@0.1.3

## 0.4.4

### Patch Changes

- 399ca71: Split engine runtime entrypoints and move Node playback internals into engine Node API.
  - Add @beatbax/engine/node with playFile, playAudioBuffer, and Node runtime helpers.
  - Move nodeAudioPlayer ownership from CLI into engine and update CLI to consume engine Node APIs.
  - Keep CLI command behavior the same while removing internal engine-to-CLI runtime coupling.
  - Update docs and tests for the runtime boundary and Node playback fallback behavior.

- Updated dependencies [399ca71]
  - @beatbax/engine@0.14.0

## 0.4.3

### Patch Changes

- dc5c6ab: Fixed CLI export path for VGM exporter integration tests and updated integration tests to cover the new `@beatbax/plugin-exporter-vgm` plugin.

## 0.4.2

### Patch Changes

- b25cd91: Updated CLI package dependency on engine to pick up chipRegion support and chip-specific effect dispatch.

- Updated dependencies [962e1a2]
- Updated dependencies [b25cd91]
  - @beatbax/engine@0.12.0
  - @beatbax/plugin-chip-nes@0.5.0
  - @beatbax/plugin-chip-sms@0.2.0

## 0.4.1

### Patch Changes

- b5dcde4: engine: fixed Gameboy instrument volume implementation (always starting at max)
  cli: added additional tests
  ===
- Updated dependencies [33fa3d7]
- Updated dependencies [e1dd039]
- Updated dependencies [b5dcde4]
  - @beatbax/plugin-chip-nes@0.4.1
  - @beatbax/plugin-exporter-famitracker@0.2.1
  - @beatbax/engine@0.11.2

## 0.4.0

### Minor Changes

- 09be2ac: Add and polish FamiTracker export CLI flow with clearer export help and improved missing-file error messaging.

### Patch Changes

- Updated dependencies [09be2ac]
- Updated dependencies [09be2ac]
- Updated dependencies [09be2ac]
  - @beatbax/plugin-exporter-famitracker@0.2.0
  - @beatbax/plugin-chip-nes@0.4.0
  - @beatbax/engine@0.11.1

## 0.3.4

### Patch Changes

- Updated dependencies
  - @beatbax/plugin-chip-nes@0.3.0

## 0.3.3

### Patch Changes

- d72b0c6: CLI auto-discovers and registers @beatbax/plugin-chip-_ and beatbax-plugin-chip-_ npm packages at startup.
- d72b0c6: Added list-chips command to list all available chip backends, with a --json flag for machine-readable output.
- d72b0c6: CLI now uses canonical chip/plugin names and aliases for all commands.
- d72b0c6: Updated to use parser error recovery and multi-error reporting from engine.
- Updated dependencies [d72b0c6]
  - @beatbax/engine@0.11.0
  - @beatbax/plugin-exporter-famitracker@1.0.0
  - @beatbax/plugin-chip-nes@1.0.0

## 0.3.2

### Patch Changes

- 110f990: Added aliases for gb,dmg to gameboy so to appear as single chip.
- Updated dependencies [110f990]
  - @beatbax/plugin-chip-nes@0.2.1
  - @beatbax/engine@0.10.1

## 0.3.1

### Patch Changes

- 30f54a1: updated to use parser error recovery with multi-error reporting changes
- Updated dependencies [1a07f2f]
- Updated dependencies [30f54a1]
  - @beatbax/plugin-chip-nes@2.0.0
  - @beatbax/engine@0.10.0

## 0.3.0

### Minor Changes

- 7b431d8: The CLI now auto-discovers and registers `@beatbax/plugin-chip-*` and `beatbax-plugin-chip-*` npm packages at startup. Added a `list-chips` command to list all available chip backends (built-in and plugin-discovered), with a `--json` flag for machine-readable output.

### Patch Changes

- Updated dependencies [7b431d8]
- Updated dependencies [7b431d8]
  - @beatbax/plugin-chip-nes@1.0.0
  - @beatbax/engine@0.9.0

## 0.2.5

### Patch Changes

- Updated dependencies [677f0f2]
- Updated dependencies [0874961]
- Updated dependencies [6817844]
- Updated dependencies [9a42f1e]
  - @beatbax/engine@0.8.0

## 0.2.4

### Patch Changes

- Updated dependencies [c121a66]
  - @beatbax/engine@0.7.0

## 0.2.3

### Patch Changes

- Updated dependencies [d1b46be]
  - @beatbax/engine@0.6.0

## 0.2.2

### Patch Changes

- d9653cf: Delegate validation to parser diagnostics
- Updated dependencies [d9653cf]
  - @beatbax/engine@0.5.0

## 0.2.1

### Patch Changes

- Updated dependencies [bc94574]
  - @beatbax/engine@0.4.0

## 0.2.0

### Minor Changes

- 94ae630: Implements a production-ready centralized logging system for BeatBax engine and CLI

### Patch Changes

- Updated dependencies [94ae630]
- Updated dependencies [94ae630]
  - @beatbax/engine@0.3.0

## 0.1.2

### Patch Changes

- Updated dependencies [348b5df]
  - @beatbax/engine@0.2.0

## 0.1.1

### Patch Changes

- 3d04a3d: Added README documentation
- Updated dependencies [3d04a3d]
  - @beatbax/engine@0.1.1
