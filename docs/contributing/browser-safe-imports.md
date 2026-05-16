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

**Vite** (apps/web-ui) bundles `@beatbax/engine` into the production `dist/` assets (no import map, no copied `/public/engine` tree). Resolution uses package `exports` with the `browser` condition:

```typescript
export default defineConfig({
  resolve: {
    conditions: ['browser', 'module', 'import', 'default'],
    alias: [
      { find: 'fs', replacement: 'src/utils/browser-fs.ts' },
      { find: 'path', replacement: 'src/utils/browser-path.ts' },
    ],
  },
});
```

Engine exporters that call `writeFileSync` are wired to the `browser-fs` capture shim at build time only; the browser bundle does not load Node built-ins.

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
- Vite bundles engine + web UI into `apps/web-ui/dist/` (`npm run build` runs `scripts/verify-bundle.js` to guard against import maps and bare `fs`/`path` in output)
- Web UI uses `@beatbax/engine` via npm workspaces (`"*"`) and `link-local-engine.cjs` for monorepo dev

### Deprecated

- Manual `<script type="importmap">` entries in `index.html`
- Copying `packages/engine/dist` to `apps/web-ui/public/engine` (removed; use Vite bundling instead)

## Song Resolver — Browser-Safe Extension

`resolver.ts` also statically imported `importResolver.ts`. A browser-safe counterpart was added to complete the chain:

- **`resolver.browser.ts`** — identical to `resolver.ts` but imports from `importResolver.browser.js`. Does not pass `baseFilePath` or `searchPaths` (unsupported in browser).
- **`index.browser.ts`** — re-exports from `resolver.browser.js` and `importResolver.browser.js`.
- **`package.json`** — conditional export added for `./song/resolver`.

```json
"./song/resolver": {
  "browser": "./dist/song/resolver.browser.js",
  "default": "./dist/song/resolver.js"
}
```

The same usage pattern applies: importers use the standard `@beatbax/engine/song/resolver` path and the bundler selects the right file automatically.

## References

- [Node.js Conditional Exports](https://nodejs.org/api/packages.html#conditional-exports)
- [Vite Resolve Conditions](https://vitejs.dev/config/shared-options.html#resolve-conditions)
- Original issue: Browser UI pulling in Node-only code paths
