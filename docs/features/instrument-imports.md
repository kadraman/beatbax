---
title: "Instrument Imports"
status: implemented
authors: ["kadraman"]
created: 2026-01-01
implemented: 2026-02-05
issue: "https://github.com/kadraman/beatbax/issues/23"
---

## Summary

The `import` directive in `.bax` files pulls in collections of `inst` declarations 
from external `.ins` files. Imported instruments are merged into the song's instrument 
table prior to sequence/pattern expansion. **Status: Fully implemented and tested.**

## Problem Statement

Authors frequently want to reuse instrument collections across songs and
projects. Previously, instrument definitions had to live inside each `.bax`, which
led to duplication and made cross-song updates tedious.

## Solution
### Overview

A top-level directive:

```
import "relative/path/to/instruments.ins"
```

`.ins` files contain only `inst` declarations and optional `import` lines.
Imports resolve relative to the importing file first, then fall back to configured
search paths. Imports are processed recursively with cycle detection and file
caching. When names conflict, later definitions overwrite earlier ones (last-wins); 
the resolver emits warnings by default and can run in strict mode to treat 
overrides as errors.

### Implementation Notes

- **Path Resolution**: Uses Node.js `path.resolve()` with cross-platform support (posix for tests)
- **CLI Integration**: All commands (play, verify, export) resolve imports with filename context
- **Browser Support**: Imports are resolved server-side and inlined for browser playback
- **Cycle Detection**: Import graphs are validated; circular imports throw errors
- **File Caching**: Each imported file is parsed once per resolution session
- **Testing**: 18 tests covering parser, resolver, and end-to-end scenarios

### Example Syntax

`common.ins`:

```
inst lead  type=pulse1 duty=50 env=12,down
inst bass  type=pulse2 duty=25 env=10,down
```

`song.bax`:

```
import "common.ins"

bpm 128
inst lead type=pulse1 duty=30 env=8,up

pat melody = C5 E5 G5 C6
channel 1 => seq melody inst lead
```

The local `inst lead` in `song.bax` overrides `common.ins`'s `lead` because
later definitions win.

## Implementation Plan
### AST Changes

- Add `ImportNode { source: string, loc }` as a top-level AST node.

### Parser Changes

- Recognize `import` as a top-level directive and emit `ImportNode` during
  parsing.
- When parsing `.ins` files, validate that only `inst` and `import` nodes are
  present; report a parse-time error for other node kinds.

Only make updates to the default parser (Peggy grammar) - do not make any updates to legacy parser.

### Export Changes

- No changes to export formats are required; imports are compile-time only and
  merge into the existing instrument table used by the resolver and exporter.

### Documentation Updates

- Add usage docs and examples (this feature doc plus a short example in the
  `songs/` directory). Update `TUTORIAL.md` and CLI help to mention import
  search paths and strict-mode toggle.

## Testing Strategy
### Unit Tests

- Parser: accept `import` lines and reject non-`inst` nodes inside `.ins`.
## Usage

### CLI Commands

All CLI commands support imports automatically:

```bash
# Verify a song with imports
npm run cli -- verify songs/import_demo.bax

# Play with imports (headless)
npm run cli -- play songs/import_demo.bax

# Play in browser (imports are resolved and inlined)
npm run cli -- play songs/import_demo.bax --browser

# Export with imports
npm run cli -- export json songs/import_demo.bax output.json
npm run cli -- export uge songs/import_demo.bax output.uge
```

### Browser Playback

When using `--browser` mode, imports are automatically resolved server-side and 
inlined into the source file. The generated browser-compatible file shows:

```
# Resolved instruments from: lib/gameboy-common.ins
inst gb_lead type=pulse1 duty=50 env={"level":12,"direction":"down","period":3}
inst gb_bass type=pulse2 duty=25 env={"level":10,"direction":"down","period":2}
# import "lib/gameboy-common.ins"

# Resolved instruments from: lib/gameboy-drums.ins
inst kick type=noise env={"level":15,"direction":"down","period":7} noise={...}
inst snare type=noise env={"level":12,"direction":"down","period":5} noise={...}
# import "lib/gameboy-drums.ins"
```

This ensures the browser can play the song without file system access.

### Path Resolution

Imports support standard relative paths:

```
import "lib/common.ins"          # Subdirectory relative to song file
import "../shared/drums.ins"     # Parent directory
import "../../library/fx.ins"    # Multiple levels up
```

Resolution order:
1. Resolve relative to the importing file's directory
2. Fallback to current working directory (search path)

### Creating .ins Libraries

Example library structure:

```
songs/
  import_demo.bax
  lib/
    gameboy-common.ins    # Common melodic instruments
    gameboy-drums.ins     # Percussion/noise instruments
```

`lib/gameboy-common.ins`:
```
inst gb_lead type=pulse1 duty=50 env=12,down
inst gb_bass type=pulse2 duty=25 env=10,down
inst gb_arp  type=pulse1 duty=12 env=15,down
```

`lib/gameboy-drums.ins`:
```
inst kick  type=noise env=15,down
inst snare type=noise env=12,down
inst hat   type=noise env=8,down
```

## Testing

- Resolver: relative path resolution, search-path fallback, caching, and
  cycle detection.
- Merge semantics: last-win overrides and emitted warnings; strict mode
  causes errors.

### Test Coverage (18 tests total)

**Parser Tests** (`parser.imports.test.ts` - 6 tests):
- Single import statement parsing
- Multiple imports
- Import with different quote styles
- Location tracking
- Invalid import syntax errors

**Resolver Tests** (`resolver.imports.test.ts` - 9 tests):
- Basic import resolution
- Relative path resolution (`../` support)
- Import cycle detection
- File caching verification
- Last-wins merging semantics
- Override warnings
- Strict mode (treats overrides as errors)
- .ins file validation (rejects patterns/sequences/channels)
- Missing file error handling

**Integration Tests** (`integration.imports.test.ts`):
- End-to-end import workflow
- Multiple .ins files with recursive imports
- Final ISM validation

All tests pass. See `packages/engine/tests/` for implementation.

## Migration Path

- Existing songs continue to behave as before. Projects can start creating
  `.ins` libraries and import them; because overrides apply, local changes can
  still override library instruments without changing the libraries.

## Implementation Status

✅ **COMPLETE** - All features implemented and tested (Feb 5, 2026)

- ✅ Add `ImportNode` to `ast.ts`
- ✅ Update parser to accept and emit `ImportNode`
- ✅ Add `.ins` parsing validation
- ✅ Implement resolver loading, caching, cycle detection, merge logic
- ✅ Emit warnings for overrides; strict mode support
- ✅ CLI integration (all commands support imports)
- ✅ Browser playback import resolution
- ✅ Add unit and integration tests (18 tests total)
- ✅ Update `TUTORIAL.md`, `README.md`, and documentation

## References

- hUGETracker and other tracker formats use external instrument banks; this
  feature provides similar convenience for `.bax`.
- See `songs/import_demo.bax` for a complete working example
- See `songs/lib/*.ins` for example instrument libraries

- Add unit tests to cover:
  - Basic import resolution (relative and search-path fallback).
  - Recursive imports and cycle detection.
  - Override semantics (last-win) and optional strict-mode errors.
  - Parse errors when non-`inst` nodes appear in `.ins` files.

- Suggested test locations: `engine/tests/` (parser/resolver suites) and a new
  small integration test under `packages/cli/tests/` that loads example songs.

