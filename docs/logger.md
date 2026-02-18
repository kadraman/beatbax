# BeatBax Logger

Centralized logging system for BeatBax engine and applications.

## Table of Contents

- [Features](#features)
- [Usage](#usage)
  - [Basic Logging](#basic-logging)
  - [Module Namespaces](#module-namespaces)
  - [Configuration (Programmatic)](#configuration-programmatic)
  - [Configuration (URL Parameters)](#configuration-url-parameters)
  - [Configuration (localStorage)](#configuration-localstorage)
  - [Configuration (Console API)](#configuration-console-api)
- [Browser-Specific Features](#browser-specific-features)
  - [URL Parameters](#url-parameters)
  - [localStorage API](#localstorage-api)
  - [window.beatbaxDebug API](#windowbeatbaxdebug-api)
  - [WebAudio Tracing](#webaudio-tracing)
- [Migration Guide](#migration-guide)
- [Production Safety](#production-safety)
- [Rules](#rules)
- [Examples](#examples)
  - [Web App Integration (Complete Example)](#web-app-integration-complete-example)
  - [Web UI Integration](#web-ui-integration)
  - [Engine Usage](#engine-usage)
  - [Error Handling](#error-handling)
- [Implementation Details](#implementation-details)

## Features

- ✅ Runtime configurable log levels (none, error, warn, info, debug)
- ✅ Module namespaces for filtering logs by component
- ✅ Colorized console output in browsers
- ✅ Structured logging support (log objects as data)
- ✅ WebAudio tracing helpers
- ✅ Safe production defaults (error-only)
- ✅ Works in Node.js and browser environments
- ✅ Browser console debug API (`window.beatbaxDebug`)

## Usage

### Basic Logging

```typescript
import { createLogger } from '@beatbax/engine/util/logger';

const log = createLogger('player');

// Simple messages
log.debug('Starting playback');
log.info('Playback started');
log.warn('Buffer underrun detected');
log.error('Failed to initialize', error);

// Structured logging (prefer objects for key data)
log.info({ event: 'started', duration: 120, channels: 4 });
log.debug({ bufferSize: 2048, latencyMs: 15 });
log.warn({ event: 'underrun', bufferSize: 1024, available: 512 });
```

### Module Namespaces

Use descriptive module names to identify the source of logs:

- `player` - Audio playback
- `sequencer` - Sequence/pattern scheduling
- `webaudio` - WebAudio API interactions
- `parser` - BeatBax language parsing
- `resolver` - Song resolution and imports
- `scheduler` - Tick scheduler
- `ui` - User interface components
- `storage` - LocalStorage/persistence
- `network` - Network requests
- `state` - Application state management

### Configuration

**Programmatic:**

```typescript
import { configureLogging } from '@beatbax/engine/util/logger';

// Set global log level
configureLogging({ level: 'debug' });

// Filter to specific modules
configureLogging({
  level: 'debug',
  modules: ['player', 'sequencer']
});

// Enable WebAudio tracing
configureLogging({
  level: 'debug',
  webaudioTrace: true
});

// Disable colors (useful for Node.js logs)
configureLogging({
  level: 'info',
  colorize: false
});
```

**Browser URL Parameters:**

```
?loglevel=debug                              # Set log level
?debug=player,sequencer                      # Enable modules
?loglevel=debug&debug=player&webaudio=1     # Combined
```

**Browser LocalStorage:**

```javascript
// Enable debug logging (persists across page loads)
localStorage.setItem('beatbax.loglevel', 'debug');
localStorage.setItem('beatbax.modules', 'player,sequencer');
localStorage.setItem('beatbax.webaudio', '1');
location.reload();
```

**Browser Console API:**

```javascript
// Global debug helpers (available in browser console)
window.beatbaxDebug.enable('debug', ['player', 'sequencer']);
window.beatbaxDebug.disable();
window.beatbaxDebug.webaudio(true);
window.beatbaxDebug.config(); // View current config
```

## Browser-Specific Features

When running in a browser environment (web-app), the logger provides additional configuration methods optimized for web development and user debugging.

### URL Parameters

Control logging via URL query parameters - useful for sharing debug links or testing specific scenarios:

**Parameter Reference:**

| Parameter | Values | Description | Example |
|-----------|--------|-------------|---------|
| `loglevel` | `none`, `error`, `warn`, `info`, `debug` | Set global log level | `?loglevel=debug` |
| `debug` | Comma-separated module names | Enable debug mode for specific modules | `?debug=player,ui` |
| `logcolor` | `true`, `false` | Enable/disable color output | `?logcolor=true` |

**Usage Examples:**

```
# Enable debug logging for all modules
https://beatbax.app/?loglevel=debug

# Enable debug for specific modules only
https://beatbax.app/?debug=player,sequencer,ui

# Debug specific modules with colors
https://beatbax.app/?loglevel=debug&debug=player&logcolor=true

# Production mode with errors only
https://beatbax.app/?loglevel=error

# Disable all logging
https://beatbax.app/?loglevel=none
```

**Implementation:**

```typescript
import { loadLoggingFromURL } from '@beatbax/engine/util/logger';

// Call on app initialization (reads URL params and configures logger)
loadLoggingFromURL();
```

### localStorage API

Logger configuration persists across browser sessions using localStorage. This allows users to set their preferred debug level once and have it remembered.

**Storage Keys:**

- `beatbax:loglevel` - Global log level (none/error/warn/info/debug)
- `beatbax:debug` - Comma-separated list of enabled modules
- `beatbax:logcolor` - Enable colorization (true/false)

**Usage:**

```typescript
import {
  loadLoggingFromStorage,
  saveLoggingToStorage,
  configureLogging
} from '@beatbax/engine/util/logger';

// Load saved preferences on app start
loadLoggingFromStorage();

// Save user's configuration choice
function handleUserConfigChange(level: string, modules: string[]) {
  configureLogging({ level, modules });
  saveLoggingToStorage(); // Persists to localStorage
}

// Manual localStorage access
localStorage.setItem('beatbax:loglevel', 'debug');
localStorage.setItem('beatbax:debug', 'player,ui,sequencer');
localStorage.setItem('beatbax:logcolor', 'true');
```

**Configuration Priority:**

1. **URL parameters** (highest priority) - applies immediately on page load
2. **localStorage** (fallback) - loaded if no URL params present
3. **Programmatic config** (default) - hardcoded defaults in code

### window.beatbaxDebug API

A global debugging interface is automatically exposed in browser environments (`window.beatbaxDebug`). Users (or developers in DevTools) can control logging without modifying code or reloading the page.

**Available Methods:**

```typescript
// Set global log level
window.beatbaxDebug.setLevel('debug');
window.beatbaxDebug.setLevel('info');
window.beatbaxDebug.setLevel('error');
window.beatbaxDebug.setLevel('none');

// Enable debug logging for specific modules
window.beatbaxDebug.enable('player');
window.beatbaxDebug.enable('player', 'ui', 'sequencer');

// Disable specific modules
window.beatbaxDebug.disable('parser');
window.beatbaxDebug.disable(); // Disable all modules

// View current configuration
window.beatbaxDebug.config();
// Returns: { level: 'debug', modules: ['player', 'ui'], colorize: true }

// Reset to defaults
window.beatbaxDebug.reset();

// Enable/disable WebAudio graph tracing
window.beatbaxDebug.webaudio(true);  // Enable
window.beatbaxDebug.webaudio(false); // Disable

// Enable colorization
window.beatbaxDebug.colorize(true);
```

**Real-World Debugging Workflow:**

```javascript
// 1. User reports playback issue on production site
// 2. Developer asks user to open DevTools console and run:
window.beatbaxDebug.setLevel('debug');
window.beatbaxDebug.enable('player', 'sequencer', 'audio');

// 3. User reproduces issue, logs appear in console
// 4. User copies logs and shares with developer

// 5. Developer analyzes logs, identifies bug
// 6. User resets logging to production mode:
window.beatbaxDebug.reset();
```

**TypeScript Type Definitions:**

```typescript
interface BeatbaxDebugAPI {
  setLevel(level: 'none' | 'error' | 'warn' | 'info' | 'debug'): void;
  enable(...modules: string[]): void;
  disable(...modules: string[]): void;
  config(): { level: string; modules: string[]; colorize: boolean };
  reset(): void;
  webaudio(enabled: boolean): void;
  colorize(enabled: boolean): void;
}

declare global {
  interface Window {
    beatbaxDebug: BeatbaxDebugAPI;
  }
}
```

### WebAudio Tracing

Special helpers for debugging WebAudio graph connections:

```typescript
import { createLogger, traceNodeCreation, traceConnection } from '@beatbax/engine/util/logger';

const log = createLogger('webaudio');

const osc = audioCtx.createOscillator();
traceNodeCreation(osc, 'LeadOscillator');

const gain = audioCtx.createGain();
traceNodeCreation(gain, 'MasterGain');

osc.connect(gain);
traceConnection(osc, gain);

gain.connect(audioCtx.destination);
traceConnection(gain, audioCtx.destination);
```

## Migration Guide

### Before (❌ Don't do this)

```typescript
console.log('Starting player');
console.warn('Buffer issue:', size);
console.error('Playback failed', error);
```

### After (✅ Do this)

```typescript
import { createLogger } from '@beatbax/engine/util/logger';

const log = createLogger('player');

log.debug('Starting player');
log.warn('Buffer issue:', { size });
log.error('Playback failed', error);
```

## Production Safety

- Default log level is `error` (only errors are logged)
- Debug logs can be safely left in production code
- Use `log.debug()` for verbose development logging
- Use `log.info()` for important user-facing events
- Use `log.warn()` for recoverable issues
- Use `log.error()` for critical failures

## Rules

1. **NEVER call `console.log/warn/error` directly**
2. **ALWAYS import `createLogger`** from the logger utility
3. **Use descriptive module namespaces** (e.g., 'player', 'ui', 'network')
4. **Log structured data as objects** when useful: `log.debug({ nodeCount, latencyMs })`
5. **Debug logs must be safe to leave in production** - avoid logging sensitive data

## Examples

### Web App Integration (Complete Example)

**Application Entry Point:**

```typescript
// apps/web-ui/src/main.ts (or App.tsx for React)
import {
  createLogger,
  configureLogging,
  loadLoggingFromURL,
  loadLoggingFromStorage
} from '@beatbax/engine/util/logger';

// Initialize logger on app startup
function initializeLogging() {
  // 1. Load from URL params (highest priority)
  //    Example: ?loglevel=debug&debug=ui,player
  loadLoggingFromURL();

  // 2. Load from localStorage (fallback)
  //    User's saved preferences
  loadLoggingFromStorage();

  // 3. Development defaults (fallback)
  if (import.meta.env.DEV) {
    configureLogging({
      level: 'debug',
      modules: ['ui', 'player', 'sequencer'],
      colorize: true
    });
  }
}

// Call on app mount
initializeLogging();

const log = createLogger('ui');
log.info('BeatBax web app started');
```

**React Component Example:**

```typescript
// apps/web-ui/src/components/Player.tsx
import { createLogger } from '@beatbax/engine/util/logger';
import { useState, useEffect } from 'react';

const log = createLogger('ui-player');

export function Player({ songUrl }: { songUrl: string }) {
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    log.debug('Player component mounted', { songUrl });
    return () => log.debug('Player component unmounted');
  }, []);

  const handlePlay = async () => {
    log.info('Play button clicked', { songUrl });
    try {
      setIsPlaying(true);
      // ... playback logic
      log.info('Playback started successfully');
    } catch (error) {
      log.error('Failed to start playback', { songUrl, error });
    }
  };

  const handleStop = () => {
    log.info('Stop button clicked');
    setIsPlaying(false);
  };

  return (
    <div>
      <button onClick={handlePlay}>Play</button>
      <button onClick={handleStop}>Stop</button>
    </div>
  );
}
```

**Vue Component Example:**

```typescript
// apps/web-ui/src/components/Player.vue
<script setup lang="ts">
import { createLogger } from '@beatbax/engine/util/logger';
import { ref, onMounted, onUnmounted } from 'vue';

const log = createLogger('ui-player');
const isPlaying = ref(false);

onMounted(() => {
  log.debug('Player component mounted');
});

onUnmounted(() => {
  log.debug('Player component unmounted');
});

const handlePlay = async () => {
  log.info('Play button clicked');
  try {
    isPlaying.value = true;
    // ... playback logic
    log.info('Playback started successfully');
  } catch (error) {
    log.error('Failed to start playback', error);
  }
};
</script>
```

**State Management Example:**

```typescript
// apps/web-ui/src/store/songStore.ts
import { createLogger } from '@beatbax/engine/util/logger';

const log = createLogger('state');

export const useSongStore = create((set, get) => ({
  currentSong: null,

  loadSong: async (url: string) => {
    log.debug('Loading song', { url });
    try {
      const response = await fetch(url);
      const song = await response.json();
      set({ currentSong: song });
      log.info('Song loaded', {
        url,
        patterns: Object.keys(song.pats).length,
        instruments: Object.keys(song.insts).length
      });
    } catch (error) {
      log.error('Failed to load song', { url, error });
      throw error;
    }
  },
}));
```

**Browser DevTools Debugging:**

Users can control logging directly from the browser console:

```javascript
// Open DevTools Console and type:

// Enable debug logging for specific modules
beatbaxDebug.setLevel('debug');
beatbaxDebug.enable('ui', 'player', 'sequencer');

// View current configuration
beatbaxDebug.config();

// Disable specific modules
beatbaxDebug.disable('parser');

// Reset to defaults
beatbaxDebug.reset();

// Enable WebAudio graph tracing
beatbaxDebug.webaudio(true);
```

**Persistent User Preferences:**

```typescript
// apps/web-ui/src/components/Settings.tsx
import { configureLogging, getLoggingConfig } from '@beatbax/engine/util/logger';

export function Settings() {
  const handleLogLevelChange = (level: string) => {
    // Configure logger
    configureLogging({ level });

    // Save to localStorage (persists across sessions)
    localStorage.setItem('beatbax:loglevel', level);

    log.info('Log level changed', { level });
  };

  const currentConfig = getLoggingConfig();

  return (
    <select onChange={(e) => handleLogLevelChange(e.target.value)} value={currentConfig.level}>
      <option value="none">Off</option>
      <option value="error">Errors Only</option>
      <option value="warn">Warnings</option>
      <option value="info">Info</option>
      <option value="debug">Debug (Verbose)</option>
    </select>
  );
}
```

### Web UI Integration

```typescript
// apps/web-ui/src/main.ts
import { createLogger, configureLogging } from '@beatbax/engine/util/logger';

// Configure based on environment
if (import.meta.env.DEV) {
  configureLogging({ level: 'debug', modules: ['ui', 'player'] });
}

const log = createLogger('ui');

log.info('Application starting');
log.debug({ modules: ['editor', 'transport', 'output'] });
```

### Engine Usage

```typescript
// packages/engine/src/audio/playback.ts
import from { createLogger } from '../util/logger.js';

const log = createLogger('player');

class Player {
  play() {
    log.info({ event: 'play-started', channels: 4 });
    log.debug({ bufferSize: 2048, sampleRate: 44100 });
  }

  stop() {
    log.info('Playback stopped');
  }
}
```

### Error Handling

```typescript
const log = createLogger('network');

async function fetchSong(url: string) {
  try {
    log.debug('Fetching song', { url });
    const response = await fetch(url);
    log.info('Song loaded', { url, size: response.headers.get('content-length') });
    return response;
  } catch (error) {
    log.error('Failed to fetch song', { url, error });
    throw error;
  }
}
```

## Implementation Details

- Logger output is buffered/conditional (no performance impact when disabled)
- Module filtering uses Set lookup (O(1) performance)
- Colorization is auto-detected (browser vs Node.js)
- Structured objects are preserved (no stringification until output)
- Safe to use in worker threads and Node.js contexts

## Quick Reference

### Basic Setup

```typescript
import { createLogger, configureLogging } from '@beatbax/engine/util/logger';

// Create a logger instance
const log = createLogger('my-module');

// Log at different levels
log.error('Critical error', error);
log.warn('Warning message');
log.info('Info message');
log.debug('Debug details', { data: 123 });
```

### Configuration Methods

| Method | Environment | Use Case |
|--------|-------------|----------|
| `configureLogging({ level, modules })` | All | Programmatic configuration in code |
| `loadLoggingFromURL()` | Browser | Read `?loglevel=debug&debug=player,ui` from URL |
| `loadLoggingFromStorage()` | Browser | Load saved preferences from localStorage |
| `window.beatbaxDebug.*` | Browser | Interactive debugging in DevTools console |
| `configureLoggerFromCLI(argv)` | Node.js | Parse `--verbose` and `--debug` flags |

### Log Levels

| Level | Typical Use | CLI Flag | Example |
|-------|-------------|----------|---------|
| `none` | Production (max performance) | (default) | No logs at all |
| `error` | Production (recommended) | (default) | Fatal errors only |
| `warn` | Production with monitoring | N/A | Warnings + errors |
| `info` | Development | `--verbose` | Progress messages |
| `debug` | Deep debugging | `--debug` | All internal details |

### Common Module Names

| Module | Component | Typical Events |
|--------|-----------|----------------|
| `parser` | Language parser | Parse errors, AST construction |
| `resolver` | Song resolution | Import resolution, pattern expansion |
| `player` | Playback engine | Start/stop, buffer status |
| `scheduler` | Tick scheduler | Event scheduling, timing |
| `sequencer` | Sequence playback | Pattern advancement, channel routing |
| `webaudio` | WebAudio graph | Node creation, connections |
| `ui` | User interface | User actions, component lifecycle |
| `ui-player` | Player UI component | Play/stop buttons, controls |
| `state` | State management | Store updates, data loading |
| `network` | HTTP requests | Fetch operations, API calls |
| `export:json` | JSON export | Export progress and validation |
| `export:midi` | MIDI export | MIDI conversion and file writing |
| `export:uge` | UGE export | UGE format validation and output |

### Browser Debugging Commands

```javascript
// Quick debugging in DevTools console
window.beatbaxDebug.setLevel('debug');          // Enable all debug logs
window.beatbaxDebug.enable('player', 'ui');     // Filter to specific modules
window.beatbaxDebug.disable();                  // Disable module filtering
window.beatbaxDebug.config();                   // Show current config
window.beatbaxDebug.reset();                    // Reset to defaults
window.beatbaxDebug.webaudio(true);             // Trace WebAudio graph
```

### URL Parameter Reference

```
# Enable debug logging globally
?loglevel=debug

# Enable debug for specific modules only
?debug=player,ui,sequencer

# Enable colors in browser console
?logcolor=true

# Combination (most common for debugging)
?loglevel=debug&debug=player&logcolor=true
```

### localStorage Keys

```javascript
localStorage.setItem('beatbax:loglevel', 'debug');           // Global level
localStorage.setItem('beatbax:debug', 'player,ui');          // Module filter
localStorage.setItem('beatbax:logcolor', 'true');            // Colorization
```

### CLI Usage

```bash
# Default (error-only)
npm run cli -- play song.bax

# Verbose mode (show progress)
npm run cli -- play song.bax --verbose

# Debug mode (show all internals)
npm run cli -- play song.bax --debug

# Exports with logging
npm run cli -- export uge song.bax out.uge --verbose
```

---

**For detailed examples and integration patterns, see the [Examples](#examples) section above.**
