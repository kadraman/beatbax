# Implementation Plan: C64 SID Chip Plugin

**Spec**: [spec.md](spec.md) | **Migrated**: 2026-09-03

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [ ] No invented syntax or undocumented language behavior
- [ ] AST / ISM / scheduler / expansion impact identified (or N/A)
- [ ] Plugins remain isolated; core does not gain plugin dependencies
- [ ] Determinism and compatibility preserved (or migration documented)
- [ ] Tests planned for new behavior

## Implementation Outline

1. Define plugin package, **6581/8580 + PAL/NTSC profiles**, and shared `SidChipSimulator`.
2. Add minimal engine/parser support for `chipModel` and extend `chipRegion` to `chip sid`.
3. Implement channel backends as **intent emitters** into a song-scoped session (requires engine `beginSongSession` wiring — see Architecture).
4. Implement register-intent collection, arbitration, and deterministic register log.
5. Add instrument + song-level validation for filter conflicts and sync/ring rules.
6. Render preview PCM from the register log.
7. Add chip docs, wizard presets, and sample songs teaching real SID constraints.

## Testing Requirements

- Deterministic register logs across repeated renders.
- Deterministic PCM preview for the same song/profile input.
- Profile differentiation tests (6581 vs 8580 where models intentionally differ).
- Filter conflict and sync/ring validation tests.

## Implementation Plan

### Phase 0: Engine + parser prerequisites

1. Add `chipModel` directive and AST field
2. Extend `chip sid pal|ntsc` region validation
3. Pass `chipModel` through resolver → SongModel → `configureForSong()`
4. Add `beginSongSession()` hook to `playback.ts` and `pcmRenderer.ts` (or equivalent session API)

**Gate:** Parser accepts sample header; `configureForSong` receives model + region.

### Phase 1: Shared chip core

1. Create package structure
2. Implement `sid-profiles.ts` — 6581/8580 × PAL/NTSC clocks and frame rates
3. Implement `periodTables.ts` — freq ↔ 16-bit N
4. Implement `sid-chip.ts` — voice stepping, ADSR, filter approximation
5. Unit tests: frequency formula, ADSR nibble bounds, profile clocks, determinism

**Gate:** `sid-chip.test.ts` passes; repeated steps produce identical state.

### Phase 2: Register intents + plugin wiring

1. Implement `register-intent.ts`, `register-arbitrator.ts`, `register-log.ts`
2. Implement `channel-backend.ts` — facades (no per-channel simulators)
3. Implement `validate.ts` and `validate-song.ts`
4. Implement `index.ts` — session lifecycle + plugin registration
5. Integration test with `sid-smoke-test.bax`

**Gate:** Register log SHA-256 identical across 3 runs.

### Phase 3: Preview audio + UI

1. Implement `audio-from-registers.ts`
2. Implement `ui-contributions.ts` — teach filter globals and sync/ring chain
3. Implement `songWizard.ts` — always emits `chipModel` + `chipRegion`
4. Wire UI contributions

**Gate:** CLI + Web UI play `sid-smoke-test.bax` with non-zero audio.

### Phase 4: Macros + filter effects

1. Map chip-global filter sweeps to `SidChipGlobalIntent`
2. Region-aware macro tick rate (50/60 Hz)
3. Profile-specific filter curves (6581 vs 8580) in `filter-model.ts`

**Gate:** `filter-demo.bax` and `filter-conflict-test.bax` behave as documented.

### Phase 5: Sample songs + chip docs

1. Demo songs listed in Scope
2. Test songs: `filter-conflict-test`, `sync-ring-invalid-test`
3. `docs/chips/c64-sid/hardware_guide.md` and `composition_guide.md`
4. `songs/c64-sid/README.md`

**Gate:** All sample songs render; regression hashes match baseline.

### Phase 6: Export integration (future)

1. PSID/RSID adapters consume `SidRegisterFrame[]`
2. GoatTracker-oriented export from register log
3. Snapshot tests for export determinism

---

## Testing Strategy

### Unit tests

| Test file | Scope |
|-----------|-------|
| `sid-chip.test.ts` | Voice stepping, ADSR, filter approx, gate |
| `register-arbitrator.test.ts` | Filter conflict errors, route-bit merge |
| `register-log.test.ts` | Deterministic serialization |
| `periodTables.test.ts` | PAL/NTSC frequency formula |
| `sid-profiles.test.ts` | 6581/8580 selection, missing model rejected |
| `validate-song.test.ts` | Filter conflicts, sync/ring source rules |
| `validate.test.ts` | Wave/pw/ad/sr bounds |

### Integration tests

| Test file | Scope |
|-----------|-------|
| `plugin.test.ts` | `beginSongSession`, three facades → one chip |
| Playback | Register log + PCM determinism |
| Profiles | Golden log diff 6581 vs 8580 on `model-contrast-demo.bax` |

### Sample song tests

| Song | Scope |
|------|-------|
| `sid-smoke-test.bax` | Minimal regression gate (register log SHA-256) |
| `pulse-width-demo.bax` | PW bounds, pulse-only |
| `filter-demo.bax` | Shared cutoff sweep, routing |
| `sync-ring-demo.bax` | Valid sync/ring chain usage |
| `model-contrast-demo.bax` | 6581 vs 8580 profile output differs where expected |
| `filter-conflict-test.bax` | **Error** on incompatible filter globals |
| `sync-ring-invalid-test.bax` | **Error** on invalid ring/sync assumption |

### Regression gate

1. **Phase 2:** `sid-smoke-test.bax` register log identical across 3 runs
2. **Phase 4:** Conflict tests emit expected diagnostics
3. **Phase 5:** All demo songs byte-identical on repeated register-log renders

---
