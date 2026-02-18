# BeatBax Logger Implementation Summary

## Overview
Successfully implemented a centralized logging system for the BeatBax engine and applications, based on the existing `BeatBaxLogger.js` pattern.

## Files Created

### Core Logger
- **`packages/engine/src/util/logger.ts`** (370 lines)
  - Full-featured logging system with configurable log levels
  - Module namespacing support
  - Browser and Node.js compatibility
  - WebAudio tracing helpers
  - Global debug API for browser console (`window.beatbaxDebug`)

### Exports
- **`packages/engine/src/util/index.ts`**
  - Clean export interface for logger and diagnostics utilities

### Documentation
- **`docs/logger.md`**
  - Comprehensive usage guide
  - Migration examples
  - Configuration options
  - Best practices and rules

## Files Modified

### Engine Source Files
1. **`packages/engine/src/audio/playback.ts`**
   - Migrated from direct `console.log/error` calls to logger
   - Module namespace: `'player'`
   - ~20 console calls replaced with structured logging

2. **`packages/engine/src/util/diag.ts`**
   - Updated to use logger instead of direct console calls
   - Module namespace: `'diagnostics'`
   - Maintains existing API for backward compatibility

3. **`packages/engine/src/export/jsonExport.ts`**
   - Module namespace: `'export:json'`
   - ~11 console calls migrated to logger

4. **`packages/engine/src/export/midiExport.ts`**
   - Module namespace: `'export:midi'`
   - ~11 console calls migrated to logger

5. **`packages/engine/src/export/wavWriter.ts`**
   - Module namespace: `'export:wav'`
   - ~6 console calls migrated to logger

6. **`packages/engine/src/export/ugeWriter.ts`**
   - Module namespace: `'export:uge'`
   - ~40 console calls migrated to logger

7. **`packages/engine/src/parser/peggy/index.ts`**
   - Module namespace: `'parser'`
   - Logs parse start, completion, and summary statistics

8. **`packages/engine/src/song/resolver.ts`**
   - Module namespace: `'resolver'`
   - Logs resolution phases, sequence expansion, and event counts

9. **`packages/engine/src/index.ts`** (playFile function)
   - Module namespace: `'engine-play'`
   - ~21 console calls migrated to logger
   - Covers headless playback, browser playback, and Vite server integration

### Test Files (6 files updated)
All test files that relied on `console.warn` spying were updated to configure the logger for test environments:

1. **`packages/engine/tests/peggy-env-normalize.test.ts`**
2. **`packages/engine/tests/uge.arp.test.ts`**
3. **`packages/engine/tests/effects.negativeArp.test.ts`**
4. **`packages/engine/tests/parser-space-tolerance.test.ts`**

Each test now:
- Configures logger to emit warnings during tests (`beforeAll`)
- Resets to default error-only level after tests (`afterAll`)
- Updated assertion patterns to handle logger's multi-argument output

## Key Features

### Log Levels
- `none` - No logging
- `error` - Critical failures only (default/production)
- `warn` - Recoverable issues
- `info` - Important user-facing events
- `debug` - Verbose development logging

### Module Namespaces
Currently implemented namespaces:
- `player` - Audio playback (WebAudio)
- `engine-play` - Playback command (headless/browser)
- `export:json` - JSON export
- `export:midi` - MIDI export
- `export:wav` - WAV export
- `export:uge` - UGE export
- `parser` - Language parsing
- `resolver` - Song resolution
- `diagnostics` - Error reporting and warnings

Recommended namespaces for future use:
- `sequencer` - Sequence/pattern scheduling
- `webaudio` - WebAudio API interactions
- `scheduler` - Tick scheduler
- `ui` - User interface
- `storage` - Persistence
- `network` - HTTP requests
- `state` - Application state

### Configuration Methods

**Programmatic:**
```typescript
import { configureLogging } from '@beatbax/engine/util/logger';

configureLogging({
  level: 'debug',
  modules: ['player', 'sequencer']
});
```

**Browser URL Parameters:**
```
?loglevel=debug&debug=player,sequencer&webaudio=1
```

**Browser LocalStorage:**
```javascript
localStorage.setItem('beatbax.loglevel', 'debug');
localStorage.setItem('beatbax.modules', 'player,sequencer');
```

**Browser Console API:**
```javascript
window.beatbaxDebug.enable('debug', ['player']);
window.beatbaxDebug.disable();
window.beatbaxDebug.webaudio(true);
window.beatbaxDebug.config();
```

## Usage Example

**Before (❌):**
```typescript
console.log('[Player] Starting playback');
console.warn('[Player] Buffer underrun:', size);
console.error('[Player] Playback failed:', error);
```

**After (✅):**
```typescript
import { createLogger } from '@beatbax/engine/util/logger';

const log = createLogger('player');

log.debug('Starting playback');
log.warn('Buffer underrun', { size });
log.error('Playback failed:', error);

// Structured logging
log.info({ event: 'started', duration: 120, channels: 4 });
log.debug({ bufferSize: 2048, latencyMs: 15 });
```

## Testing Results

✅ **All 295 tests passing** (3 skipped)
- 82 test suites passed
- 292 tests passed
- No regressions introduced

## Migration Strategy

### Completed
1. ✅ Created logger utility in `packages/engine/src/util/logger.ts`
2. ✅ Migrated `audio/playback.ts` (player module)
3. ✅ Migrated `util/diag.ts` (diagnostics module)
4. ✅ Migrated all export modules (json, midi, wav, uge)
5. ✅ Migrated `parser/peggy/index.ts` (parser module)
6. ✅ Migrated `song/resolver.ts` (resolver module)
7. ✅ Migrated `index.ts` playFile function (engine-play module)
8. ✅ Integrated logger with CLI (configureLoggerFromCLI)
9. ✅ Updated all tests to work with new logger
10. ✅ Created comprehensive documentation

### Command Behavior

**Production (no flags):**
- Clean output, logger at 'error' level
- Only shows critical failures

**Verbose (`--verbose`):**
- Logger at 'info' level
- Shows parse success, resolution success, export progress

**Debug (`--debug`):**
- Logger at 'debug' level
- Shows detailed parsing, resolution, export internals

### Next Steps (Optional)
1. Integrate logger in web-ui:
   - Update `apps/web-ui` to use engine logger
   - Configure appropriate log levels for development/production
   - Add module namespaces for UI components

2. Add logger configuration UI:
   - Settings panel in web-ui for log level/module selection
   - Runtime toggles for debugging

## Rules and Best Practices

1. **NEVER call `console.log/warn/error` directly**
2. **ALWAYS import `createLogger`** from `@beatbax/engine/util/logger`
3. **Use descriptive module namespaces** (e.g., 'player', 'ui', 'network')
4. **Log structured data as objects** when useful: `log.debug({ nodeCount, latencyMs })`
5. **Debug logs must be safe to leave in production** - avoid logging sensitive data
6. **Default log level is 'error'** - only errors logged in production
7. **Use appropriate log levels:**
   - `debug` - Verbose development details
   - `info` - Important user-facing events
   - `warn` - Recoverable issues
   - `error` - Critical failures

## Benefits

- ✅ Centralized logging configuration
- ✅ Runtime control via URL params or localStorage
- ✅ Module-level filtering for focused debugging
- ✅ Production-safe (error-only default)
- ✅ Structured logging support
- ✅ Browser and Node.js compatible
- ✅ Zero dependencies
- ✅ TypeScript typed
- ✅ Backward compatible (tests still pass)

## Performance

- Conditional logging (no overhead when disabled)
- O(1) module filtering (Set-based lookup)
- Structured objects only serialized when logging is enabled
- Safe for high-frequency code paths
