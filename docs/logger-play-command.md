# Play Command Logger Integration

## Overview

The `playFile` function in `packages/engine/src/index.ts` has been fully migrated to use the centralized logging system, eliminating all direct `console.log` calls that were previously bypassing the logger.

## Problem

When running:
```bash
node bin/beatbax play song.bax --verbose --debug
```

There was a lot of debug output that was NOT going through the logger system, making it inconsistent with the rest of the engine (exports, parser, resolver).

## Solution

Migrated all ~21 `console.log` calls in the `playFile` function to use the logger with the module namespace `'engine-play'`.

## Changes Made

**File**: `packages/engine/src/index.ts`

**Module**: `'engine-play'`

**Migrated calls**:
1. Parsed AST dump (verbose debug) → `log.debug()`
2. "Rendering song using native PCM renderer..." → `log.info()`
3. "Playing audio via system speakers..." → `log.info()`
4. "Repeat requested by play directive..." → `log.info()`
5. "[OK] Playback complete" → `log.info()`
6. Speaker installation tips → `log.info()`
7. "[OK] Playback started (WebAudio)" → `log.info()`
8. "Launching browser-based playback..." → `log.info()`
9. Local import warnings → `log.warn()`
10. Remote import info → `log.info()`
11. "Starting Vite dev server..." → `log.info()`
12. "Output directory ready" → `log.debug()`
13. "Resolved song written to: ..." → `log.debug()`
14. "Vite dev server is ready" → `log.debug()`
15. "Waiting additional 2 seconds..." → `log.debug()`
16. "Opening web UI at ..." → `log.info()`
17. "Please open the URL in your browser: ..." → `log.info()`
18. CLI playback help messages → `log.info()`

## Logging Behavior

### Production Mode (No Flags)
```bash
node bin/beatbax play song.bax
```
**Output**: Clean, minimal output (only CLI messages, no engine logs)

### Verbose Mode (`--verbose`)
```bash
node bin/beatbax play song.bax --verbose
```
**Output**: Shows progress messages
```
[parser] Parsed successfully: 1 patterns, 1 sequences, 1 instruments
[engine-play] Rendering song using native PCM renderer...
[resolver] Resolved successfully: 1 channels with 4 total events
[engine-play] Playing audio via system speakers...
[engine-play] [OK] Playback complete
```

### Debug Mode (`--debug`)
```bash
node bin/beatbax play song.bax --debug
```
**Output**: Shows detailed internal processing
```
[parser] Parsing source code { length: 150 }
[parser] Peggy parse complete { statements: 6 }
[parser] Parse complete { patterns: 1, sequences: 1, instruments: 1, channels: 1, imports: 0 }
[parser] Parsed successfully: 1 patterns, 1 sequences, 1 instruments
[engine-play] Rendering song using native PCM renderer...
[resolver] Resolving song { patterns: 1, sequences: 1, instruments: 1, channels: 1, bpm: 120 }
[resolver] Expanding sequences { count: 1 }
[resolver] Sequences expanded { count: 1 }
[resolver] Resolution complete { channels: 1, totalEvents: 4, bpm: 120 }
[resolver] Resolved successfully: 1 channels with 4 total events
[engine-play] Playing audio via system speakers...
[engine-play] [OK] Playback complete
```

## Complete Logging Chain

The play command now shows the complete engine pipeline:

1. **Parser** (`'parser'` module)
   - Parsing source code
   - Peggy parse complete
   - Parse summary

2. **Resolver** (`'resolver'` module)
   - Resolving song
   - Expanding sequences
   - Resolution complete

3. **Playback** (`'engine-play'` module)
   - Rendering/playing audio
   - Browser launch (if applicable)
   - Playback complete

4. **Exports** (`'export:*'` modules, if export command used)
   - Instrument discovery
   - Pattern encoding
   - File writing

## Benefits

1. **Consistency**: All engine output now uses the same logging system
2. **Control**: Logger level can be controlled via CLI flags (`--verbose`, `--debug`)
3. **Structure**: Logs include timestamps and module prefixes
4. **Clarity**: Debug mode shows exactly what the engine is doing internally
5. **Production**: Clean output by default (no noise)

## Testing

✅ All 295 tests passing (3 skipped)
✅ Play command works with all logging levels
✅ Export commands work with all logging levels
✅ Verify command works with all logging levels

## Related Documentation

- [Logger System](./logger.md) — Main logger documentation
- [Logger Implementation Summary](./logger-implementation-summary.md) — Complete migration status
- [Parser/Resolver Logging](./logger-parser-resolver.md) — Parser and resolver logging details
