# @beatbax/cli

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
