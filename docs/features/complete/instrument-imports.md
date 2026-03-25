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

BeatBax supports both **local file imports** and **remote URL imports** (HTTP(S) and GitHub repositories).

**For remote import documentation (HTTP(S), GitHub), see [`remote-imports.md`](./remote-imports.md).**

This document covers **local file imports** only.

## Import Prefix Requirement

**All local file imports MUST use the `local:` prefix for security reasons:**

```
import "local:lib/gameboy-common.ins"  # ✅ Correct
import "lib/gameboy-common.ins"        # ❌ Error: Missing prefix
```

**Browser Security:** Local imports are only supported in the CLI (Node.js environment). If a `.bax` file containing `local:` imports is loaded in the browser, an error will be displayed:

```
🛑 Local imports are not supported in the browser for security reasons.
   Use remote imports (github: or https:) instead.
   Found: import "local:lib/gameboy-common.ins"
```

**Note:** When using the CLI with `--browser` flag, local imports will fail at runtime in the browser. The CLI displays a warning but copies the source file as-is:

```
⚠️  Warning: This song contains 2 local file import(s) which will be blocked by browser security.
   The browser will display an error when attempting to load this song.
   To play this song in the browser, replace local imports with remote imports (https:// or github:).
```

To enable browser playback, replace local imports with remote imports (see [`remote-imports.md`](./remote-imports.md)).

Authors frequently want to reuse instrument collections across songs and
projects. Previously, instrument definitions had to live inside each `.bax`, which
led to duplication and made cross-song updates tedious.

## Solution
### Overview

A top-level directive:

```
import "local:relative/path/to/instruments.ins"
```

**The `local:` prefix is required for all local file imports.** This ensures explicit intent and enables security enforcement in browser environments.

`.ins` files contain only `inst` declarations and optional `import` lines.
Imports resolve relative to the importing file first, then fall back to configured
search paths. Imports are processed recursively with cycle detection and file
caching. When names conflict, later definitions overwrite earlier ones (last-wins);
the resolver emits warnings by default and can run in strict mode to treat
overrides as errors.

### Implementation Notes

- **Path Resolution**: Uses Node.js `path.resolve()` with cross-platform support (posix for tests)
- **CLI Integration**: All commands (play, verify, export) resolve imports with filename context
- **Browser Support**: Local imports are NOT supported in browser; use remote imports instead
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
import "local:common.ins"

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

All CLI commands support imports automatically (in Node.js/CLI environment):

```bash
# Verify a song with imports
npm run cli -- verify songs/import_demo.bax

# Play with imports (headless)
npm run cli -- play songs/import_demo.bax

# Note: --browser flag requires remote imports (local imports will fail)
npm run cli -- play songs/import_demo.bax --browser

# Export with imports
npm run cli -- export json songs/import_demo.bax output.json
npm run cli -- export uge songs/import_demo.bax output.uge
```

### Browser Playback Limitations

**Local imports are NOT supported in browser playback.** When using `--browser` mode with a song containing local imports, the CLI will:

1. Display a warning that local imports will fail in the browser
2. Copy the source file as-is (imports are NOT resolved/inlined)
3. Launch the browser where the song will fail to load with an error

**To enable browser playback:**
- Replace `local:` imports with remote imports (`https://` or `github:`)
- See [`remote-imports.md`](./remote-imports.md) for remote import syntax
- Or manually inline all instruments into your `.bax` file

**Why?** Browsers cannot access local files for security reasons. The engine's browser build does not include Node.js file system APIs. Remote imports fetch over HTTP(S) which works in both CLI and browser.

**Example:**
```bash
# This will warn and fail in browser:
npm run cli -- play song.bax --browser  # Contains local: imports

# These work in browser:
npm run cli -- play song-remote.bax --browser  # Uses https:// imports
npm run cli -- play song-inline.bax --browser  # No imports, all inline
```

### Path Resolution

Imports support relative paths with the `local:` prefix. **For security reasons, parent directory traversal using `..` path segments is not allowed:**

```
import "local:lib/common.ins"               # ✅ Subdirectory relative to song file
import "local:instruments/drums.ins"        # ✅ Nested subdirectory
import "local:lib/drums..backup.ins"        # ✅ Filename containing ".."
import "local:../shared/drums.ins"          # ❌ REJECTED - parent directory traversal
import "local:../../library/fx.ins"         # ❌ REJECTED - parent directory traversal
import "local:lib/../sibling.ins"           # ❌ REJECTED - parent directory traversal
```

**Security Note:** The validator checks for `..` as a **path segment** (using regex `/(^|\/)\.\.($|\/)/`), which means:
- `..` preceded by `/` or start-of-string AND followed by `/` or end-of-string is rejected
- Filenames containing `..` (like `drums..backup.ins`) are allowed

This prevents path traversal attacks while allowing legitimate filenames. Organize your instrument libraries within or beneath your song directories, or use the alternatives below.

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

### Organizing Shared Libraries Across Projects

Since parent directory traversal (`..`) is not allowed, you have several options for sharing instrument libraries across multiple projects:

**Option 1: Copy libraries into each project** (recommended for simple cases)
```
project-a/
  songs/
    song1.bax
  lib/
    gameboy-common.ins

project-b/
  songs/
    song2.bax
  lib/
    gameboy-common.ins  # Copy of the same library
```

**Option 2: Use remote imports** (recommended for shared/published libraries)
```
# In your song files:
import "github:username/beatbax-instruments/main/gameboy-common.ins"
import "https://raw.githubusercontent.com/username/repo/main/lib/drums.ins"
```

**Option 3: Centralize projects under a common root**
```
beatbax-workspace/
  lib/                      # Shared libraries
    gameboy-common.ins
    gameboy-drums.ins
  project-a/
    songs/
      song1.bax             # import "local:lib/gameboy-common.ins"
  project-b/
    songs/
      song2.bax             # import "local:lib/gameboy-common.ins"
```
Run the CLI from `beatbax-workspace/` directory so the `lib/` folder is accessible.

**Option 4: Use version control** (Git submodules, symlinks)
```
# Use Git submodules to reference shared libraries:
cd myproject/lib
git submodule add https://github.com/user/beatbax-instruments.git
```

For most users, **Option 2 (remote imports)** provides the best balance of security, convenience, and shareability.

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
- Relative path resolution (within project directories)
- Path traversal rejection (`..` segments are blocked)
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

