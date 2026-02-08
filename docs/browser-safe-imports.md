# Browser-Safe Import Resolution

## Problem

The original `importResolver.ts` statically imports Node.js built-ins (`fs`, `path`) at the module level. Even though browser environments only use remote imports, these static imports cause issues:

1. **Build failures**: Bundlers may fail to resolve Node.js built-ins
2. **Runtime errors**: Browser environments lack `fs` and `path` modules
3. **Bundle bloat**: Polyfilling Node modules adds unnecessary code

## Solution

We provide separate implementations for Node.js and browser environments using **conditional exports** in `package.json`.

### Architecture

```
packages/engine/src/song/
  ├── importResolver.ts          # Node.js version (uses fs, path)
  ├── importResolver.browser.ts  # Browser version (remote-only, no Node deps)
  ├── index.ts                   # Node.js exports
  └── index.browser.ts           # Browser exports
```

### Conditional Exports

The `package.json` exports field uses the `browser` condition:

```json
{
  "exports": {
    "./song": {
      "browser": "./dist/song/index.browser.js",
      "default": "./dist/song/index.js"
    },
    "./song/importResolver": {
      "browser": "./dist/song/importResolver.browser.js",
      "default": "./dist/song/importResolver.js"
    }
  }
}
```

Modern bundlers (Vite, Webpack, Rollup) automatically select the browser version when building for web.

### Browser Version Limitations

The browser version (`importResolver.browser.ts`) has intentional limitations:

**Supported:**
- ✅ Remote HTTP(S) imports
- ✅ GitHub imports (`github:user/repo/path`)
- ✅ Import cycle detection
- ✅ Instrument merging with last-wins semantics
- ✅ Strict mode and warning handlers

**Not Supported:**
- ❌ Local file imports (`local:...`) - throws clear error
- ❌ File system operations
- ❌ Synchronous imports (`resolveImportsSync` throws error)
- ❌ Path resolution with `baseFilePath` or `searchPaths`

### Usage

No code changes required! The same import statements work in both environments:

```typescript
import { resolveImports } from '@beatbax/engine/song';

// Works in both Node.js CLI and browser
const resolvedAST = await resolveImports(ast, {
  onWarn: (msg) => console.warn(msg),
  remoteOptions: { httpsOnly: true }
});
```

- **Node.js**: Uses `importResolver.ts` (supports local and remote)
- **Browser**: Uses `importResolver.browser.ts` (remote only)

### Bundler Configuration

**Vite** (apps/web-ui/vite.config.ts):
```typescript
export default defineConfig({
  resolve: {
    conditions: ['browser', 'module', 'import', 'default']
  },
  optimizeDeps: {
    exclude: ['fs', 'path']  // Don't try to bundle Node built-ins
  }
});
```

**Webpack**: Automatically respects the `browser` condition in exports.

**Rollup**: Use `@rollup/plugin-node-resolve` with `browser: true`.

### Testing

Both implementations share the same public API (`resolveImports`, `ImportResolverOptions`), ensuring consistent behavior. Test coverage:

- **Node tests**: Test both local and remote imports
- **Browser tests**: Test remote-only imports, verify local imports are blocked

### Type Safety

Both versions export the same TypeScript interfaces. The browser version's `ImportResolverOptions` omits Node-specific options with JSDoc comments:

```typescript
export interface ImportResolverOptions {
  strictMode?: boolean;
  onWarn?: (message: string, loc?: any) => void;
  remoteOptions?: RemoteImportOptions;
  remoteCache?: RemoteInstrumentCache;
  
  // Note: File system options not supported in browser:
  // - baseFilePath, searchPaths, readFile, fileExists, allowAbsolutePaths
}
```

### Migration

No migration needed - existing code works unchanged. The bundler automatically selects the appropriate implementation.

### Future Improvements

Potential enhancements:

1. **Dynamic imports in Node version**: Use `await import('fs')` instead of static imports for better tree-shaking
2. **Service Worker caching**: Enhanced offline support for remote imports
3. **IndexedDB cache**: Persistent caching in browser environments
4. **CORS proxy support**: Optional proxy for repositories without CORS headers

## Current Status

### ✅ Implemented

- Browser-safe import resolver (`importResolver.browser.ts`)
- Conditional exports in `package.json`
- Vite configuration for browser builds
- Web UI updated to use browser-safe imports

### ⚠️ Known Limitations

**Build Warnings**: The web UI build currently shows Vite warnings about Node.js modules (`fs`, `path`) being externalized. This is cosmetic and does not affect functionality:

```
[plugin:vite:resolve] Module "path" has been externalized for browser compatibility
[plugin:vite:resolve] Module "fs" has been externalized for browser compatibility
```

**Root Cause**: The `resolver.js` module internally imports from `importResolver.js` (Node version) for its `resolveSong*` functions. Even though the web UI:
1. Uses the browser-safe `resolveImports` from `importResolver.browser.js`
2. Calls `resolveImports` before calling `resolveSong` (so imports are already resolved)

The `resolver.js` module still has the import statement at the module level, causing Vite to pull in the Node.js dependencies (which it then stubs out).

**Impact**: The Node.js code paths are never executed at runtime since imports are resolved before calling `resolveSong`. The build succeeds and the application works correctly.

**Future Fix**: Refactor `resolver.ts` to use dynamic imports or move import resolution logic entirely out of the resolver module.

## References

- [Node.js Conditional Exports](https://nodejs.org/api/packages.html#conditional-exports)
- [Vite Resolve Conditions](https://vitejs.dev/config/shared-options.html#resolve-conditions)
- Original issue: Browser UI pulling in Node-only code paths
