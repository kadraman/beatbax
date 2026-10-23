# Implementation Plan: Instrument editor Game Boy subpat row editor

**Spec**: [spec.md](spec.md) | **Date**: 2026-10-23 | **Branch**: `feat/101-instrument-editor-subpat-rows`

## Summary

Extend Instrument Editor writeback to insert/replace `subpat` blocks and clear/set `subpat=` on the `inst` line; add a single-column row UI with Create / Attach / Detach in Desktop. Reuse existing SubPatRow formatting; add a parse helper for cell text. No grammar or lowering changes.

## Technical context

- **Packages / surfaces**: `packages/app-core`, `apps/desktop`, optional small helpers in `packages/engine` if parse belongs next to grammar types
- **Language**: TypeScript (strict), ESM
- **Testing**: Jest via `npm test`
- **Client profile**: desktop-full (Instrument Editor)
- **Performance / constraints**: N/A (small tables; hUGE-sized programs)

## Constitution Check

GATE: must pass before implementation. Re-check after design changes.

- [x] No invented syntax or undocumented language behavior — edits emit existing `subpat` / SubPatRow forms only
- [x] AST / ISM / scheduler / expansion impact identified (or N/A) — N/A (source rewrite → re-parse; no new AST shapes)
- [x] Plugins remain isolated; core does not gain plugin dependencies — GB-only UI gated on chip schema / type; no plugin React
- [x] Determinism and compatibility preserved (or migration documented) — 082 lowering unchanged
- [x] Tests planned for new behavior

**Exceptions**: none

## Project structure

- `packages/app-core/src/editor/instrument-editor-writeback.ts` — `findSubpatLineIndex` already exists; add block extent, `replaceSubpatBlock`, `insertSubpatBlock`, helpers to set/clear `subpat=` via existing `replaceInstLine` / serialize
- `packages/app-core/src/editor/subpat-format.ts` — keep `formatSubPatternRow` / `formatSubPatternSource`; add `parseSubPatternRow` (or sibling module) as inverse
- `packages/app-core/src/editor/instrument-editor-draft.ts` — ensure dirty fingerprint includes `subpat` name + rows when Live off
- `apps/desktop/src/renderer/src/components/panels/DesktopInstrumentEditor.tsx` — Create / Attach / Detach + row list under current `subpat` field; shared-use note
- `apps/desktop/src/renderer/src/styles.css` — `.bb-inst-editor__subpat-*` list styles
- `packages/app-core/tests/` — writeback + parse/format round-trip tests
- `docs/grammar/instruments.md` — note that Desktop can edit `subpat` rows
- `specs/complete/021-instrument-editor-panel/spec.md` — Future Enhancements: mark single-column editor as feature 101; leave multi-column as future

## Implementation

### AST changes

N/A

### Parser / grammar changes

N/A (consume existing SubPatRow)

### CLI changes

N/A

### Desktop / web UI changes

1. **Writeback**: Given rows + name, serialize with `formatSubPatternSource`; replace lines from `subpat name =` through the last indented row (or one-line form). Insert new blocks near the selected `inst` (or after last `subpat` / before first `inst` — pick one deterministic rule and document in tasks).
2. **Parse cell**: Text → `SubPatternRow`; reject on failure for write-valid-only.
3. **Create**: Allocate unique name; insert starter block; patch draft `subpat` + `subpatRows`; commit per Live.
4. **Attach**: UI picker of `Object.keys(ast.subpatterns)`; set draft `subpat`; load rows from AST; rewrite `inst` line.
5. **Detach**: Clear `subpat` / `subpatRows` on draft; rewrite `inst` without `subpat=`; leave block in source.
6. **UI**: Replace read-only-only presentation with controls + list when local GB; keep reveal button; show shared-use note when count of other local `subpat=` refs > 0.
7. **099**: Route `subpat` body commits through the same Live / Apply / Revert / dirty navigation path as field edits.

Web-lite: out of scope.

### Export changes

N/A (082 path unchanged once source is correct)

### Documentation updates

- `docs/grammar/instruments.md` — one paragraph under Instrument programs / Instrument Editor intro
- Amend 021 Future Enhancements bullet for tracker-row editor → “single-column shipped as 101; multi-column still future”

## Testing strategy

### Unit tests

- `replaceSubpatBlock` / `insertSubpatBlock` preserve surrounding source
- Create uniqueness when name already exists
- Attach sets `subpat=` only; Detach clears without deleting block
- Invalid row text → no write helper result / error
- `parseSubPatternRow` ↔ `formatSubPatternRow` round-trip for representative atoms
- Dirty fingerprint includes rows (099 interaction)

### Integration tests

Optional: none required beyond app-core unit tests (matches 021/099).

### Manual / QA

- `songs/gameboy/instruments/gb_subpattern_macro_demo.bax`: edit existing `subpat`, Create on a second inst, Attach, Detach, preview Trigger
- Confirm macros lock/unlock
- Confirm go-to-source highlights `subpat` line

## Migration and compatibility

No song migration. Existing files keep working; panel gains capability only.

## Open implementation questions

None blocking. Create naming scheme (`<inst>_sub` vs `subpat_N`) is an implementation detail under FR-004.
