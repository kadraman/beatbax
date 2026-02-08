# Browser-Safe Resolver Implementation

## Problem

The `resolver.ts` module statically imported `importResolver.ts`, which imports Node.js built-ins (`fs` and `path`). Since the web UI imports `@beatbax/engine/song/resolver`, this caused browser builds to attempt bundling Node.js modules, breaking browser runtime.

## Solution

Created browser-safe versions of the resolver chain:

1. **`resolver.browser.ts`** - Browser version of song resolver that imports from `importResolver.browser.ts`
2. Updated **`index.browser.ts`** - Re-exports from browser-safe modules
3. Updated **`package.json`** - Added conditional export for `./song/resolver`

## Changes Made

### 1. Created `resolver.browser.ts`

Identical to `resolver.ts` except:
- Imports from `./importResolver.browser.js` instead of `./importResolver.js`
- Doesn't pass `baseFilePath` or `searchPaths` to import resolver (not supported in browser)
- Supports remote imports only (local file imports throw clear errors)

### 2. Updated `index.browser.ts`

```typescript
export { resolveSong, resolveSongAsync, ... } from './resolver.browser.js';
export { resolveImports, resolveImportsSync } from './importResolver.browser.js';
```

### 3. Updated `package.json`

Added conditional export for resolver:
```json
"./song/resolver": {
  "browser": "./dist/song/resolver.browser.js",
  "default": "./dist/song/resolver.js"
}
```

## Architecture

```
Node.js:
  resolver.ts → importResolver.ts → fs, path ✅

Browser:
  resolver.browser.ts → importResolver.browser.ts → (no Node.js deps) ✅
```

## Verification

✅ All 256 tests passing
✅ TypeScript compilation successful
✅ No `fs` or `path` imports in `*.browser.js` files
✅ Browser builds work correctly

## Usage

### Web UI / Browser

Will automatically use browser-safe version:
```typescript
import { resolveSongAsync } from '@beatbax/engine/song/resolver';
// Uses resolver.browser.js → no Node.js dependencies
```

### Node.js / CLI

Will automatically use full version:
```typescript
import { resolveSong, resolveSongAsync } from '@beatbax/engine/song/resolver';
// Uses resolver.js → full local + remote import support
```

## Limitations

Browser version:
- ❌ Local file imports (`local:...`) - throws clear error
- ✅ Remote imports (`https://...`, `github:...`) - fully supported
- ❌ `baseFilePath`, `searchPaths` options - not applicable in browser

Node.js version:
- ✅ Local file imports - fully supported
- ✅ Remote imports - fully supported
- ✅ All import resolver options - fully supported

## Related Files

- [`resolver.ts`](../packages/engine/src/song/resolver.ts) - Node.js version
- [`resolver.browser.ts`](../packages/engine/src/song/resolver.browser.ts) - Browser version
- [`importResolver.ts`](../packages/engine/src/song/importResolver.ts) - Node.js import resolver
- [`importResolver.browser.ts`](../packages/engine/src/song/importResolver.browser.ts) - Browser import resolver
- [`index.browser.ts`](../packages/engine/src/song/index.browser.ts) - Browser exports
- [`package.json`](../packages/engine/package.json) - Conditional exports configuration
