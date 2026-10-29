# Implementation Plan: Song Timing Pattern Grid Inspector

**Spec**: [spec.md](spec.md) | **Updated**: 2026-10-28 (refresh after 008 sections)

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [x] No invented syntax or undocumented language behavior — inspector visualizes resolved timing; no new `.bax` syntax
- [x] AST / ISM / scheduler / expansion impact identified — **read-only** over resolved `SongModel` + AST after composition expansion (spec 008); no scheduler/ISM writes
- [x] Plugins remain isolated; core does not gain plugin dependencies — diagnostics in `@beatbax/app-core` / desktop UI only
- [x] Determinism and compatibility preserved — same inputs → same timeline/diagnostics; no song semantics change
- [x] Tests planned for new behavior — fixtures for length mismatch, section mismatch, split kit, UGE portamento (see tasks.md)

## Implementation Plan

### Engine / App-Core

1. Timeline extraction helper over parsed AST + resolved `SongModel` (channel lengths, pattern/seq blocks, source refs). Prefer authored `ast.sections` / `ast.forms` labels when present (after 008 expansion, channel tokens are still `<section>_<role>`).
2. Timing diagnostics after resolution.
3. Expose via existing validation plumbing.
4. Optional UGE exporter-readiness diagnostics.

### UI

1. Pattern Grid Inspector tab / diagnostics mode (Desktop).
2. Channel rows with block widths ∝ `lengthSteps`.
3. Bar/step ruler from `stepsPerBar`.
4. Diagnostic badges; block details panel (source pat/seq, length, step table, diagnostics).

### Dependencies

- Spec 014 seek/loop — complete
- Spec 087 section focus — complete
- Spec 008 composition sections — in progress / available for labeled sections on migrated songs

## Testing Strategy

- Unit: timeline lengths, section mismatch, missing kit anchors
- Integration: Desktop inspector on `songs/gameboy/crypt_of_fallen_kings.bax` (008 structured) and a classic monolithic NES song
