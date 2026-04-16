---
title: "Extract Game Boy Backend as @beatbax/plugin-chip-gameboy"
status: proposed
authors: ["kadraman"]
created: 2026-04-16
issue: ""
---

## Summary

Extract the Game Boy (DMG-01) APU backend from `packages/engine/src/chips/gameboy/` into a standalone npm package `@beatbax/plugin-chip-gameboy`, making it structurally identical to `@beatbax/plugin-chip-nes`. The engine will auto-register the Game Boy plugin as a bundled default, but the backend code will live outside the engine core and be removable or replaceable like any other chip plugin.

---

## Problem Statement

The Game Boy backend was the first chip implementation and predates the `ChipPlugin` interface. It is currently hard-wired into the engine in three separate layers that bypass the plugin contract entirely:

| Engine file | Coupling |
|---|---|
| `audio/playback.ts` | Calls `playPulse`, `playWavetable`, `playNoise` directly via an `isGameboy` branch — the whole WebAudio node graph is a separate code path from the plugin route |
| `audio/pcmRenderer.ts` | Imports `midiToFreq`, `parseSweep`, `parseEnvelope`, `registerFromFreq` directly; an `isGameBoy` flag threads through the entire renderer call stack |
| `effects/index.ts` | Imports `parseEnvelope` from the GB source; hard-codes a `'gameboy': 60` fps frame rate constant |

This makes it impossible to:
- Tree-shake the Game Boy backend in environments that don't need it
- Replace or mock the GB backend in tests without touching engine internals
- Publish the GB backend independently with its own versioning
- Hold the GB and other chip plugins to a consistent architectural contract

---

## Proposed Solution

### Summary

Implement in five ordered stages. Each stage is a self-contained, test-passing commit. Only the final stage creates the new npm package.

### Stage 1 — Promote shared frequency utilities

Move `midiToFreq`, `noteNameToMidi` from `chips/gameboy/apu.ts` to a new engine utility `util/frequency.ts`. These functions are chip-neutral (equal-temperament math) but currently force `pcmRenderer.ts` and `playback.ts` to import from the GB source.

**Files changed:**
- `packages/engine/src/util/frequency.ts` ← new file
- `packages/engine/src/chips/gameboy/apu.ts` — re-export from `util/frequency.ts` for backward compat
- `packages/engine/src/audio/playback.ts` — update import path
- `packages/engine/src/audio/pcmRenderer.ts` — update import path
- `packages/engine/src/index.ts` — export `midiToFreq`, `noteNameToMidi` from the new path

### Stage 2 — Add `frameRateHz` to `ChipPlugin` interface and decouple effects

Add an optional `frameRateHz?: number` field to the `ChipPlugin` interface (`chips/types.ts`). Update `effects/index.ts` to read `activePlugin?.frameRateHz ?? 60` instead of the hard-coded `'gameboy': 60` map entry. Remove the `parseEnvelope` import from `effects/index.ts`; replace it with a plugin-provided `parseEnvelope` helper (add an optional `parseEnvelope?(raw: unknown): EnvelopeNode | null` to `ChipPlugin`) or promote `parseEnvelope` to a shared engine utility.

**Files changed:**
- `packages/engine/src/chips/types.ts` — add `frameRateHz?`, `parseEnvelope?`
- `packages/engine/src/chips/gameboy/plugin.ts` — set `frameRateHz: 60`, implement `parseEnvelope`
- `packages/engine/src/effects/index.ts` — remove GB import, use plugin field
- All other chip plugins (`chip-nes`) — no change required (field is optional)

### Stage 3 — Implement `createPlaybackNodes()` on `GBChannelBackend`

The stub `GBChannelBackend` in `chips/gameboy/plugin.ts` currently only implements `render()` for PCM. Implement `createPlaybackNodes(ctx, instrument, note)` using the existing `playPulse`, `playWavetable`, and `playNoise` factory functions so the Game Boy can be driven through the same WebAudio plugin dispatch path that the NES plugin uses.

The returned node pair must be compatible with what `effects/index.ts` expects:
- Pulse/wave channels: `{ sourceNode: OscillatorNode | AudioBufferSourceNode, gainNode: GainNode }`
- Noise channel: appropriate `AudioBufferSourceNode` + `GainNode`

**Files changed:**
- `packages/engine/src/chips/gameboy/plugin.ts` — full `createPlaybackNodes()` implementation for each GB channel type
- `packages/engine/src/chips/gameboy/pulse.ts`, `wave.ts`, `noise.ts` — refactor if needed to accept an external `AudioContext` rather than assuming one

### Stage 4 — Remove `isGameboy` branches from `playback.ts` and `pcmRenderer.ts`

Once Stage 3 is complete, the engine can dispatch GB through the plugin path:

- `audio/playback.ts`: remove the `isGameboy` fork and the three direct `chips/gameboy/*.js` imports; GB is now handled by `backend.createPlaybackNodes()` like any other chip
- `audio/pcmRenderer.ts`: remove the `isGameBoy` parameter and all `chips/gameboy/*.js` imports; GB is handled by `backend.render()` like any other chip

At this point, `packages/engine/src/chips/gameboy/` has no remaining callers inside the engine except `chips/registry.ts` (the plugin registration) and the re-exports from `chips/gameboy/apu.ts`.

**Files changed:**
- `packages/engine/src/audio/playback.ts`
- `packages/engine/src/audio/pcmRenderer.ts`

### Stage 5 — Extract to `@beatbax/plugin-chip-gameboy`

Move the now-decoupled Game Boy source to a new package and publish it:

1. Create `packages/plugins/chip-gameboy/` mirroring `chip-nes` structure:
   ```
   packages/plugins/chip-gameboy/
     src/
       index.ts         ← gameboyPlugin default export
       pulse.ts
       wave.ts
       noise.ts
       apu.ts           ← re-exports midiToFreq/noteNameToMidi from engine util
       periodTables.ts
       ui-contributions.ts
       validate.ts
     package.json
     tsconfig.json
     jest.config.cjs
     README.md
   ```

2. Update `packages/engine/src/chips/registry.ts` — remove the static `import gameboyPlugin from './gameboy/plugin.js'`; instead accept an optional list of default plugins at `ChipRegistry` construction time, defaulting to `[gameboyPlugin]` where the engine imports it from `@beatbax/plugin-chip-gameboy`. This keeps GB auto-registered without hard-wiring it.

3. Update `packages/engine/package.json`:
   - Add `"@beatbax/plugin-chip-gameboy": "workspace:*"` as a regular dependency (not peer) so users get GB out of the box without extra install steps

4. Update `packages/engine/src/index.ts` — re-export `gameboyPlugin` from `@beatbax/plugin-chip-gameboy` for callers who currently import it from the engine

5. Delete `packages/engine/src/chips/gameboy/` directory

**Files changed:**
- `packages/plugins/chip-gameboy/` ← new package
- `packages/engine/src/chips/registry.ts`
- `packages/engine/src/chips/index.ts`
- `packages/engine/src/index.ts`
- `packages/engine/package.json`
- Root `package.json` / `tsconfig.json` workspace references

---

## Implementation Plan

### AST / Parser Changes
None. The language surface (`chip gameboy`) is unchanged. Registry lookup is still by string name.

### Engine API Changes
- `ChipPlugin` interface gains optional `frameRateHz?: number` and `parseEnvelope?(raw: unknown): EnvelopeNode | null` fields (backward compatible — all existing plugins still valid without them)
- `midiToFreq` and `noteNameToMidi` gain a second export path from `@beatbax/engine/util/frequency` (old path still works via re-export)

### CLI Changes
None required. GB is auto-registered via the engine's dependency on `@beatbax/plugin-chip-gameboy`.

### Web UI Changes
None required. GB continues to be the default chip.

### Export Changes
`export/ugeWriter.ts` and `export/midiExport.ts` do not import from `chips/gameboy/` directly — no changes needed.

### Documentation Updates
- Update `docs/features/plugin-system.md` to list `@beatbax/plugin-chip-gameboy` as the first shipped example
- Update `docs/contributing/releasing-to-npm.md` to include the new package in the release checklist
- Update root `README.md` chip support table

---

## Testing Strategy

### Unit Tests
- All 25 existing test suites must pass at every stage with no modifications to test fixtures
- Stage 3: add unit tests for `GBChannelBackend.createPlaybackNodes()` using a mock `AudioContext` (matching the pattern in existing `pulse.test.ts`)
- Stage 5: add a smoke test in `chip-gameboy` package that registers the plugin into a fresh `ChipRegistry` and verifies `registry.get('gameboy')` returns a valid `ChipPlugin`

### Integration Tests
- Stage 4: run the full `export uge` and `export midi` CLI commands against an existing `.bax` song file; diff output binary against the pre-refactor baseline to confirm byte-identical output
- Stage 5: add a workspace integration test that imports `@beatbax/plugin-chip-gameboy` as an external consumer would and registers it manually (no auto-registration) to verify the plugin works standalone

### Regression Guard
Tag a `pre-gb-extraction` git tag before starting Stage 1. CI must produce identical JSON, MIDI, and UGE export output for `songs/grassland_dash.bax` before and after each stage.

---

## Migration Path

This is a purely internal refactor. The public API (`parseWithPeggy`, `BeatBaxEngine`, `chipRegistry`, CLI commands) is unchanged. The only user-visible difference is the new package name for users who were directly importing from `@beatbax/engine`'s internal `chips/gameboy/` paths (unsupported; internal paths were never in the public API contract).

The engine's `package.json` will depend on `@beatbax/plugin-chip-gameboy`, so `npm install @beatbax/engine` continues to give users Game Boy support with zero extra steps.

---

## Implementation Checklist

- [ ] **Stage 1** — Promote `midiToFreq`/`noteNameToMidi` to `util/frequency.ts`; update all import paths; all tests pass
- [ ] **Stage 2** — Add `frameRateHz` and `parseEnvelope` to `ChipPlugin`; decouple `effects/index.ts` from GB source; all tests pass
- [ ] **Stage 3** — Implement `createPlaybackNodes()` on `GBChannelBackend`; add unit tests; all tests pass
- [ ] **Stage 4** — Remove `isGameboy` branches from `playback.ts` and `pcmRenderer.ts`; export baseline diff confirms identical output; all tests pass
- [ ] **Stage 5** — Create `packages/plugins/chip-gameboy/`; update registry; update engine `package.json`; publish `@beatbax/plugin-chip-gameboy@0.1.0`; all tests pass
- [ ] Update `docs/features/plugin-system.md` to list Game Boy as first shipped example
- [ ] Update `docs/contributing/releasing-to-npm.md` release checklist
- [ ] Add changeset for engine (minor — new `ChipPlugin` fields) and new `chip-gameboy` package

---

## Future Enhancements

- **Super Game Boy (SGB)** enhancement mode as an optional extension to the Game Boy plugin
- **Game Boy Color (GBC)** wave channel improvements as a flag on the plugin
- Per-plugin **hardware accuracy mode** toggle (strict LFSR seeding, exact period register clamping) — feasible once the plugin is self-contained

---

## Open Questions

- Should the engine's automatic auto-registration of the GB plugin be opt-out (`ChipRegistry({ defaultPlugins: [] })`)? Useful for environments that want a truly zero-dependency core engine with all chips loaded explicitly.
- Should `@beatbax/plugin-chip-gameboy` be a `dependency` (auto-installed) or `peerDependency` (user-managed) of the engine? Currently proposed as a regular dependency to preserve the zero-config experience. Changing to peer would make the engine more tree-shakable at the cost of requiring users to install the GB plugin explicitly.

---

## References

- `packages/engine/src/chips/gameboy/` — current GB source
- `packages/engine/src/chips/types.ts` — `ChipPlugin` / `ChipChannelBackend` interface
- `packages/engine/src/chips/registry.ts` — current hard-wired registration
- `packages/plugins/chip-nes/` — reference implementation for standalone chip plugin
- `docs/features/plugin-system.md` — chip plugin system spec
- `docs/contributing/releasing-to-npm.md` — release workflow
