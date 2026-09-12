# Implementation Plan: Optional master listening enhancement

**Spec**: [spec.md](spec.md) | **Date**: 2026-09-12 | **Branch**: `feature/master-listening-enhance-49df`

## Summary

Insert an optional presence EQ + glue compressor + make-up gain between `masterGain` and the existing soft limiter for live `AudioContext` playback only. Expose Off/Mild/Strong on the Channel Mixer master strip.

## Technical context

- **Packages / surfaces**: `@beatbax/engine`, `@beatbax/app-core`, `apps/desktop`, `apps/web-ui`
- **Language**: TypeScript (strict), ESM
- **Testing**: Jest via `npm -w @beatbax/engine test`
- **Client profile**: both desktop-full and web-lite
- **Performance**: three extra native Web Audio nodes when Mild/Strong; negligible CPU

## Constitution Check

- [x] No invented syntax or undocumented language behavior
- [x] AST / ISM / scheduler / expansion impact identified (N/A)
- [x] Plugins remain isolated; core does not gain plugin dependencies
- [x] Determinism and compatibility preserved (export/offline stay dry)
- [x] Tests planned for new behavior

## Project structure

- `packages/engine/src/audio/listeningEnhance.ts` — modes + preset constants
- `packages/engine/src/audio/playback.ts` — graph wiring + API
- `packages/engine/tests/playback.listening-enhance.test.ts`
- `packages/engine/tests/playback.master-volume.test.ts` — update expectations if needed
- `packages/app-core/src/utils/local-storage.ts` — StorageKey
- `packages/app-core/src/utils/event-bus.ts` — event type
- `packages/app-core/src/playback/playback-manager.ts` — bridge API
- `apps/desktop/.../DesktopChannelMixer.tsx` + styles
- `apps/web-ui/src/panels/channel-mixer.ts` + styles
- `specs/STATUS.md`, engine CHANGELOG, docs pointer

## Implementation

### Engine

1. Add `ListeningEnhanceMode` and Mild/Strong presets (presence peaking ~3 kHz; Strong adds low shelf ~120 Hz).
2. Extend `_ensureMasterOutputChain` to insert enhance nodes when effective mode ≠ off.
3. Detect offline contexts (`startRendering` / `OfflineAudioContext`) → force Off.
4. Public `setListeningEnhance` / `getListeningEnhance`.

### App-core

1. Persist `MIXER_LISTENING_ENHANCE`.
2. `PlaybackManager.setListeningEnhance` applies to live Player and stores preference.
3. Emit `listening-enhance:changed` for multi-surface sync.

### UI

1. Master strip segmented Off | Mild | Strong control + tooltip.
2. Default Mild when no stored value.

## Testing strategy

### Unit tests

- Off: `masterGain → limiter → destination`
- Mild/Strong: enhance nodes in path; limiter still final
- Offline context: dry regardless of requested mode
- Rewire does not blanket-disconnect masterGain

### Manual / QA

- Dense GB + sparse NES A/B Off vs Mild vs Strong
- Master 100% no harsh clipping
- Export WAV/VGM unchanged vs Off

## Migration and compatibility

Existing users without the storage key get Mild. Export/CLI PCM unchanged.
