---
title: "Remote Instrument Imports"
status: implemented
authors: ["kadraman"]
created: 2026-02-06
implemented: 2026-02-06
---

# Remote Instrument Imports

## Summary

BeatBax now supports importing instrument definitions from remote URLs via HTTP(S) and GitHub repositories. This enables sharing instrument libraries across projects without copying files locally.

## Syntax

```
# HTTP(S) URL
import "https://raw.githubusercontent.com/user/beatbax-instruments/main/gameboy-drums.ins"

# GitHub shorthand (syntactic sugar)
import "github:user/beatbax-instruments/main/gameboy-drums.ins"

# Local file (requires local: prefix for security)
import "local:lib/common.ins"
```

**Security Note**: As of February 2026, all local file imports must use the `local:` prefix to make import intentions explicit and prevent accidental file system access. In browser environments, local imports are blocked and only remote (https:/github:) imports are allowed.

## Features

### URL Support

- **HTTPS URLs**: Full support for any HTTPS endpoint serving `.ins` files
- **HTTP URLs**: Supported but can be disabled in production (`httpsOnly` option)
- **GitHub Shorthand**: `github:user/repo/branch/path` automatically expands to `https://raw.githubusercontent.com/user/repo/branch/path`

### Security

- **CORS-compliant**: Remote endpoints must serve with proper CORS headers
- **HTTPS-only mode**: Optional enforcement of HTTPS for production environments
- **Size limits**: Configurable maximum file size (default: 1MB)
- **Timeout handling**: Network requests timeout after 10 seconds (configurable)
- **Content validation**: Remote files are parsed and validated as proper `.ins` files

### Performance

- **Automatic caching**: Fetched instruments are cached in memory
- **Cache statistics**: API to inspect cache contents and performance
- **Parallel fetching**: Multiple remote imports load concurrently
- **Efficient loading**: Only fetch when not already cached

### Browser Support

Remote imports work in both Node.js and browser environments:

- **Node.js**: Uses native `fetch` or `node-fetch` for HTTP requests
- **Browser**: Uses standard `fetch` API
- **CLI Inlining**: The `play --browser` command preserves remote imports (doesn't inline them)

## Usage

### Basic Example

`song.bax`:
```
chip gameboy
bpm 140

# Community-maintained instrument library
import "github:beatbax/instruments-gb/main/melodic.ins"
import "github:beatbax/instruments-gb/main/percussion.ins"

# Local overrides still work
inst gb_lead type=pulse1 duty=75 env=15,down

pat melody = C5:gb_lead E5 G5 C6
channel 1 => seq melody
```

### CLI Usage

All CLI commands automatically support remote imports:

```bash
# Verify
npm run cli -- verify songs/song.bax

# Play (Node.js)
npm run cli -- play songs/song.bax

# Play (Browser) - remote imports NOT inlined
npm run cli -- play songs/song.bax --browser

# Export
npm run cli -- export json songs/song.bax output.json
npm run cli -- export uge songs/song.bax output.uge
```

### Programmatic Usage

```typescript
import { parse, resolveSongAsync } from '@beatbax/engine';
import { RemoteInstrumentCache } from '@beatbax/engine/import';

// Create a shared remote cache (optional)
const remoteCache = new RemoteInstrumentCache({
  timeout: 10000,        // 10 second timeout
  maxFileSize: 1048576,  // 1MB limit
  httpsOnly: false,      // Allow HTTP in development
  onProgress: (progress) => {
    console.log(`Loading ${progress.url}: ${progress.loaded}/${progress.total}`);
  },
});

const source = `
chip gameboy
bpm 140

import "github:beatbax/instruments-gb/main/melodic.ins"

pat melody = C5 E5 G5 C6
channel 1 => seq melody inst gb_lead
`;

const ast = parse(source);

// Use async resolver for remote imports
const song = await resolveSongAsync(ast, {
  filename: 'song.bax',
  searchPaths: [process.cwd()],
  remoteCache,  // Reuse cache across multiple songs
});

console.log('Instruments:', Object.keys(song.channels[0].events));
```

### Cache Management

```typescript
import { RemoteInstrumentCache } from '@beatbax/engine/import';

const cache = new RemoteInstrumentCache({
  timeout: 5000,
  maxFileSize: 512 * 1024,  // 512KB
});

// Fetch and cache remote instruments
const instruments = await cache.fetch('https://example.com/drums.ins');

// Check if URL is cached
if (cache.has('https://example.com/drums.ins')) {
  console.log('Already cached');
}

// Get cache statistics
const stats = cache.getStats();
console.log(`Cache size: ${stats.size}`);
console.log('Entries:', stats.entries);

// Clear cache
cache.clear();
```

## Configuration

### Remote Import Options

```typescript
interface RemoteImportOptions {
  // Only allow HTTPS URLs (recommended for production)
  httpsOnly?: boolean;  // default: false

  // Maximum file size in bytes
  maxFileSize?: number;  // default: 1048576 (1MB)

  // Request timeout in milliseconds
  timeout?: number;  // default: 10000 (10 seconds)

  // Allowed domains (empty = all domains allowed)
  allowedDomains?: string[];

  // Progress callback
  onProgress?: (progress: RemoteImportProgress) => void;

  // Custom fetch function (for testing)
  fetchFn?: typeof fetch;
}
```

### CLI Options

```bash
# Future: CLI flags for remote import control
npm run cli -- play song.bax --remote-cache --https-only
npm run cli -- export json song.bax output.json --remote-timeout 5000
```

## Implementation Details

### File Resolution Order

When resolving an import statement:

1. Check if the source is a remote URL (`http://`, `https://`, `github:`)
2. If remote:
   - Normalize and validate the URL
   - Check remote cache
   - Fetch from network if not cached
   - Parse and validate as `.ins` file
   - Cache the result
3. If local:
   - Resolve relative to importing file
   - Fall back to search paths
   - Read from file system
   - Parse and validate

### Browser vs Node.js

**Node.js:**
- Uses native `fetch` (Node.js 18+) or can use custom HTTP client
- Can cache to disk (future feature)
- Network failures halt execution with clear error messages

**Browser:**
- Uses standard `fetch` API
- Memory-only caching (future: IndexedDB/localStorage support)
- CORS must be enabled on remote servers
- Loading indicators shown during fetch

### Security Considerations

1. **Remote imports cannot have nested imports**: For security, remote `.ins` files cannot import other files
2. **CORS required**: Remote servers must set appropriate `Access-Control-Allow-Origin` headers
3. **Content validation**: All remote content is parsed and validated as proper `.ins` files
4. **Size limits**: Prevents loading excessively large files
5. **Timeout protection**: Network requests have configurable timeouts

## Testing

Comprehensive test coverage includes:

- URL detection and GitHub shorthand expansion
- Remote cache creation and management
- Fetch mocking and caching behavior
- File size limits and timeout handling
- HTTPS-only mode enforcement
- `.ins` file validation
- Error handling (404, network failures, etc.)

Run tests:
```bash
npm run engine:test -- --testNamePattern="Remote Import"
```

## Limitations (Current)

1. **No nested remote imports**: Remote `.ins` files cannot import other files
2. **No authentication**: Private GitHub repos or authenticated endpoints not supported yet
3. **No version pinning**: No built-in support for `@v1.2.3` version references
4. **No CDN hosting**: No official BeatBax instrument CDN yet
5. **No offline mode**: CLI doesn't have `--offline` flag to skip remote fetches

## Future Enhancements

### Version Pinning

```
import "github:user/repo@v1.2.3/main/file.ins"
```

### GitHub Authentication

```typescript
const cache = new RemoteInstrumentCache({
  githubToken: process.env.GITHUB_TOKEN,
});
```

### Official CDN

```
import "beatbax:gameboy/melodic-v1"  // Resolves to official CDN
```

### Offline Mode

```bash
npm run cli -- play song.bax --offline  # Skip remote fetches, use cache only
```

### Cache Persistence

```typescript
const cache = new RemoteInstrumentCache({
  persistCache: true,  // Save to ~/.beatbax/cache/
  cacheMaxAge: 86400000,  // 24 hours
});
```

## Migration Path

**Breaking Change (February 2026)**: Local imports now require the `local:` prefix for security and clarity.

```
# Before (no longer works)
import "lib/common.ins"

# After (required)
import "local:lib/common.ins"

# Or use remote import
import "github:beatbax/instruments-gb/main/common.ins"
```

**Browser Security**: Files using local imports with the `local:` prefix will have those imports ignored in browser playback with a warning. Only `https://` and `github:` imports are processed in browser environments.

## References

- Import resolution logic: [`packages/engine/src/song/importResolver.ts`](../../../packages/engine/src/song/importResolver.ts)
- Remote cache: [`packages/engine/src/import/remoteCache.ts`](../../../packages/engine/src/import/remoteCache.ts)
- URL utilities: [`packages/engine/src/import/urlUtils.ts`](../../../packages/engine/src/import/urlUtils.ts)
- Tests: [`packages/engine/tests/remote-imports.test.ts`](../../../packages/engine/tests/remote-imports.test.ts)

## Examples

See [`songs/import_demo.bax`](../../../songs/import_demo.bax) for a complete example using both local and remote imports (when community libraries are available).
