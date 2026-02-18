# Parser and Resolver Logging Integration

## Overview

The BeatBax parser and resolver modules now integrate with the centralized logging system, providing comprehensive visibility into the compilation and resolution process.

## Modules Added

### Parser Module (`parser`)

**File**: `packages/engine/src/parser/peggy/index.ts`

**Log Points**:
- `log.debug('Parsing source code', { length })` — Entry point for parsing
- `log.debug('Peggy parse complete', { statements })` — AST generation complete
- `log.debug('Parse complete', { patterns, sequences, instruments, channels, imports })` — Parse completion summary
- `log.info('Parsed successfully: X patterns, Y sequences, Z instruments')` — High-level parse summary
- `log.error('Parse error', error)` — Parse errors

### Resolver Module (`resolver`)

**File**: `packages/engine/src/song/resolver.ts`

**Log Points**:
- `log.debug('Resolving song', { patterns, sequences, instruments, channels, bpm })` — Entry point for resolution
- `log.debug('Expanding sequences', { count })` — Sequence expansion start
- `log.debug('Sequences expanded', { count })` — Sequence expansion complete
- `log.debug('Resolution complete', { channels, totalEvents, bpm })` — Resolution summary
- `log.info('Resolved successfully: X channels with Y total events')` — High-level resolution summary

## CLI Integration

The parser and resolver logs are automatically enabled based on CLI flags:

- **Default (no flags)**: Only errors shown (`level: 'error'`)
- **`--verbose`**: Info-level logging (`level: 'info'`) — Shows parse/resolve success messages
- **`--debug`**: Debug-level logging (`level: 'debug'`) — Shows detailed parse/resolve progress

## Usage Examples

### Production Mode (Clean Output)
```bash
node bin/beatbax verify song.bax
# Output: OK: song.bax parsed and validated
```

### Verbose Mode (Progress Messages)
```bash
node bin/beatbax verify song.bax --verbose
# Output:
# [parser] Parsed successfully: 5 patterns, 3 sequences, 4 instruments
# [resolver] Resolved successfully: 4 channels with 256 total events
# OK: song.bax parsed and validated
```

### Debug Mode (Detailed Logging)
```bash
node bin/beatbax verify song.bax --debug
# Output includes:
# [parser] Parsing source code { length: 1234 }
# [parser] Peggy parse complete { statements: 15 }
# [parser] Parse complete { patterns: 5, sequences: 3, instruments: 4, channels: 4, imports: 0 }
# [parser] Parsed successfully: 5 patterns, 3 sequences, 4 instruments
# [resolver] Resolving song { patterns: 5, sequences: 3, instruments: 4, channels: 4, bpm: 120 }
# [resolver] Expanding sequences { count: 3 }
# [resolver] Sequences expanded { count: 3 }
# [resolver] Resolution complete { channels: 4, totalEvents: 256, bpm: 120 }
# [resolver] Resolved successfully: 4 channels with 256 total events
```

## Export Commands with Logging

All export commands (`export json`, `export midi`, `export uge`, `export wav`) now show comprehensive logging:

```bash
node bin/beatbax export uge song.bax output.uge --debug
# Shows:
# - Parser logs (parsing source, parse completion)
# - Resolver logs (sequence expansion, event generation)
# - Export logs (instrument discovery, pattern encoding, UGE structure)
```

## Verify Command with Logging

The `verify` command shows parser and resolver activity:

```bash
node bin/beatbax verify song.bax --debug
# Shows complete parsing and resolution pipeline
```

## Benefits

1. **Debugging**: Debug-level logs show exactly what the parser and resolver are doing
2. **Progress Feedback**: Verbose mode provides reassuring progress messages for long operations
3. **Clean Production**: Default mode keeps output minimal for scripting/automation
4. **Consistent UX**: Parser/resolver logs follow the same format as export modules

## Implementation Details

### Logger Creation
Both modules create a logger instance at module level:
```typescript
import { createLogger } from '../../util/logger.js';
const log = createLogger('parser');  // or 'resolver'
```

### Structured Logging
All debug logs use structured data for machine-readable output:
```typescript
log.debug('Parse complete', {
  patterns: Object.keys(pats).length,
  sequences: Object.keys(seqs).length,
  instruments: Object.keys(insts).length,
  channels: channels.length,
  imports: imports.length,
});
```

### Info-Level Summaries
High-level summaries are logged at info level for verbose mode:
```typescript
log.info(`Parsed successfully: ${patCount} patterns, ${seqCount} sequences, ${instCount} instruments`);
```

## Testing

All 295 tests pass with the new logging integrated. Logger calls are silent during tests unless explicitly configured.

## Related Documentation

- [Logger System](./logger.md) — Main logger documentation
- [Logger Implementation Summary](./logger-implementation-summary.md) — Implementation overview
- [UGE Export Guide](./uge-export-guide.md) — Export module logging examples
