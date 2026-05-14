---
title: "Move Node Audio Player Into Engine Node Entrypoint"
status: proposed
authors: ["GitHub Copilot"]
created: 2026-05-14
issue: "TBD"
---

## Summary

Move the Node audio playback implementation (`nodeAudioPlayer`) from `@beatbax/cli` into `@beatbax/engine` under the Node-only entrypoint so `playFile` no longer depends on CLI package internals.

## Problem Statement

Current Node playback in engine used to resolve audio playback utilities from CLI package output. Even with a stable exported CLI subpath, this created an unnecessary runtime coupling from engine to CLI for functionality that is conceptually part of engine's Node runtime support.

Problems with the current arrangement:

- Engine playback depends on CLI packaging and release cadence.
- Runtime ownership is split between packages in a way that is hard to reason about.
- Optional audio dependency messaging (speaker/system fallback) is implemented outside the package exposing `playFile`.

## Proposed Solution

### Summary

Relocate `nodeAudioPlayer` implementation into `packages/engine/src/node/` and expose it internally through `@beatbax/engine/node`. Keep CLI as a consumer of engine Node APIs instead of the owner of playback plumbing.

### Example Syntax

No language syntax changes.

### Example Usage

Before:

```ts
import { playFile } from '@beatbax/engine/node';
// Internally depends on @beatbax/cli/nodeAudioPlayer
```

After:

```ts
import { playFile } from '@beatbax/engine/node';
// Internally uses @beatbax/engine/node audio player module
```

## Implementation Plan

### AST Changes

None.

### Parser Changes

None.

### CLI Changes

- Remove CLI ownership of `nodeAudioPlayer` implementation.
- Update CLI to consume engine Node playback helpers only.
- Keep CLI behavior and user-facing commands unchanged.

### Web UI Changes

None.

### Export Changes

- Add Node audio player module under engine node runtime folder.
- Keep `@beatbax/engine` root browser-safe posture unchanged.
- Preserve `@beatbax/engine/node` public API contract.

### Documentation Updates

- Update `packages/engine/README.md` runtime notes to reflect ownership change.
- Update `packages/cli/README.md` to remove references that imply CLI owns playback internals.

## Testing Strategy

### Unit Tests

- Add/adjust tests for engine node audio player fallbacks (speaker, play-sound, system command).
- Add tests for `playFile` resolution path to ensure no dependency on CLI subpaths remains.

### Integration Tests

- Verify CLI `play --headless` continues to work in Node.
- Verify error messaging remains actionable when optional playback backends are missing.

## Migration Path

1. Add engine-local node audio player module and wire `playFile` to it.
2. Migrate tests from CLI package to engine package.
3. Remove CLI shim and import playback from `@beatbax/engine/node` directly.

## Implementation Checklist

- [x] Add `packages/engine/src/node/nodeAudioPlayer.ts`.
- [x] Switch `packages/engine/src/node/play.ts` to engine-local player module.
- [x] Migrate playback fallback tests to engine package.
- [x] Remove or deprecate CLI `nodeAudioPlayer` implementation.
- [x] Validate full workspace test suite.
- [x] Update package README/runtime-boundary docs.

## Future Enhancements

- Add explicit per-backend diagnostics (speaker/play-sound/system) for easier troubleshooting.
- Introduce pluggable Node playback backend strategy in engine for advanced deployments.

## Open Questions

- Should `nodeAudioPlayer` be publicly exported from `@beatbax/engine/node` or remain internal?
- Should optional Node playback dependencies be owned by engine package only, or duplicated across CLI for compatibility?
- Do we want a transitional compatibility period where both engine and CLI provide the module?

## References

- `packages/engine/src/node/play.ts`
- `packages/engine/src/node/nodeAudioPlayer.ts`
- `packages/cli/src/cli.ts`
- `docs/features/engine-entrypoint-runtime-split.md`

## Additional Notes

This proposal is architectural and should not affect parser/AST/ISM determinism or export semantics.
