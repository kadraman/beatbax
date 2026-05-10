---
title: "Engine Entrypoint Runtime Split (Node vs Browser)"
status: proposed
authors: ["kadraman", "GitHub Copilot"]
created: 2026-05-10
issue: "TBD"
---

## Summary

Split `@beatbax/engine` root exports into runtime-specific entrypoints so browser builds never parse Node-only modules. This removes the need for `dynamicNodeImport` indirection and fixes Vite/Web bundler failures caused by Node built-ins (`fs`, `http`, `path`, `url`, `child_process`) leaking into browser dependency graphs.

The public package remains `@beatbax/engine`, but package `exports` become explicit about browser vs node entry selection. Runtime-specific code is moved out of the mixed root entry.

## Problem Statement

Today, `packages/engine/src/index.ts` combines:
- core/browser-safe exports (music utilities, parser/export APIs, registry types)
- Node-only operational logic (`playFile`, Vite launch helpers, filesystem/network/process interactions)

Because plugin and web-ui code import from `@beatbax/engine` root, browser bundlers inspect `dist/index.js` and encounter Node-only imports. This causes errors like:
- failed resolution of `fs/promises` in Vite import-analysis
- browser externalization warnings for Node modules

Current mitigation (`dynamicNodeImport`) is a workaround, not an architectural boundary.

## Proposed Solution

### Summary

Introduce strict runtime separation in engine entrypoints:

1. Browser-safe root entry:
- `src/index.ts` exports only runtime-safe symbols.
- No Node built-ins and no CLI/browser-launch operational helpers.

2. Node-only operational entry:
- Move `playFile`, `waitForDirectory`, `waitForViteServer`, and related helpers into `src/node/play.ts` (or `src/node/index.ts`).
- Node-only imports remain direct and explicit.

3. Conditional package exports:
- Route `@beatbax/engine` root for browser to browser-safe entry.
- Expose node operations on an explicit subpath (for CLI), e.g. `@beatbax/engine/node`.

4. CLI migration:
- CLI imports Node operations from `@beatbax/engine/node` instead of root.

5. Plugin/runtime import hygiene:
- Runtime plugin code that runs in browser should import granular subpaths (`util/music`, `chips/types`, etc.) or browser-safe root APIs only.

This removes bundler ambiguity and enables deleting `dynamicNodeImport`.

### Example Syntax

No language syntax changes.

### Example Usage

Before:

```ts
import { playFile, noteToMidi } from '@beatbax/engine';
```

After:

```ts
import { noteToMidi } from '@beatbax/engine';
import { playFile } from '@beatbax/engine/node';
```

## Implementation Plan

### AST Changes

None.

### Parser Changes

None.

### CLI Changes

- Update CLI play command path to import from `@beatbax/engine/node`.
- Keep command behavior identical.

### Web UI Changes

- Ensure web-ui never imports `@beatbax/engine/node`.
- Replace any remaining root imports that accidentally drag Node-only paths with explicit browser-safe subpaths where needed.

### Export Changes

No ISM/export semantic changes.

### Documentation Updates

- Add runtime-import guidance in engine API docs:
  - Use `@beatbax/engine` for browser-safe/core APIs.
  - Use `@beatbax/engine/node` only in Node contexts.
- Update plugin authoring docs with import-boundary examples.

## Testing Strategy

### Unit Tests

- New tests for package entrypoint contracts:
  - root entry has no Node built-in imports.
  - node entry exports `playFile` and operational helpers.
- Add lint/static rule test (or script check) rejecting Node built-in imports in browser-safe entry files.

### Integration Tests

- `apps/web-ui`: `npm run dev:clean` starts without `fs/promises` import-analysis failure.
- `apps/web-ui`: production build succeeds with no Node-builtins resolution errors.
- `packages/cli`: play command continues to function in Node.
- Existing engine/plugin tests remain green (no functional regressions).

## Migration Path

1. Add `@beatbax/engine/node` entry without removing existing root exports immediately.
2. Migrate internal consumers (CLI, scripts) first.
3. Migrate plugin/web-ui imports as needed.
4. Deprecate Node operational exports from root entry.
5. Remove deprecated root Node exports in next planned breaking window (or keep compatibility shim if desired).

Backward compatibility recommendation:
- Keep root re-export of `playFile` temporarily with deprecation warning in docs only.

## Implementation Checklist

- [ ] Create `packages/engine/src/node/play.ts` (move Node-only play/launch helpers).
- [ ] Reduce `packages/engine/src/index.ts` to browser-safe/core exports only.
- [ ] Add `packages/engine/src/node/index.ts` re-export surface.
- [ ] Update `packages/engine/package.json` `exports` with `./node` subpath.
- [ ] Update CLI imports to `@beatbax/engine/node`.
- [ ] Remove `dynamicNodeImport` from root entry after split.
- [ ] Add test/guard to prevent Node built-ins in browser-safe entry files.
- [ ] Verify web-ui `dev:clean` and build workflows.
- [ ] Update docs (API + plugin authoring runtime-boundary guidance).

## Future Enhancements

- Add explicit `@beatbax/engine/browser` entry for clarity and tree-shaking ergonomics.
- Add dual-package export condition matrix (`browser`, `node`, `default`, `types`) with stricter CI checks.
- Introduce a workspace-wide import boundary linter to prevent regressions.

## Open Questions

- Should root `@beatbax/engine` continue exposing `playFile` for compatibility, or be cleanly removed in one step?
- Do we want `@beatbax/engine/node/play` and `@beatbax/engine/node` both, or only one public node subpath?
- Should plugin packages be required to avoid root runtime imports in browser-targeted modules, enforced via lint?

## References

- `packages/engine/src/index.ts`
- `apps/web-ui` Vite runtime behavior (`npm run dev:clean`)
- `docs/features/FEATURE_TEMPLATE.md`

## Additional Notes

This feature is architectural and should not alter parser/AST/ISM behavior. Determinism and export byte output must remain unchanged. The goal is runtime boundary correctness and better bundler interoperability, not functional behavior changes.
