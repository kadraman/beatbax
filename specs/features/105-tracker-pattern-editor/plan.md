# Implementation Plan: Tracker pattern and sequence editor

**Spec**: [spec.md](spec.md) | **Date**: 2026-11-05 | **Branch**: `feat/105-tracker-pattern-editor`

## Summary

Project parsed `patternEvents` / classic `sequenceItems` (and channel top-level refs) into a step and arrangement edit model in `app-core`, rewrite `pat` / `seq` / `channel` statement spans through `applyUndoableReplace`, then host a Desktop tracker panel and Pattern Grid arrangement grips. Viewing never rewrites source; the first mutating edit of a compact RHS confirms flatten-to-flat-tokens. No grammar, AST-meaning, ISM, or scheduler changes.

## Technical context

- **Packages / surfaces**: `packages/app-core`, `packages/engine` (read-only statement-span helper), `apps/desktop`, `docs/`
- **Language**: TypeScript (strict), ESM
- **Testing**: Jest via `npm test` (model/writeback first; Desktop panel tests as practical)
- **Client profile**: desktop-full for UI; model in app-core for later reuse
- **Performance / constraints**: Statement-span rewrite preferred over full-buffer `setValue`; one undo step per gesture

## Constitution Check

GATE: must pass before implementation. Re-check after design changes.

- [x] No invented syntax or undocumented language behavior — only existing note/rest/sustain/hit/effect/`inst` forms and classic `seq` / `channel` lists
- [x] AST / ISM / scheduler / expansion impact identified (or N/A) — N/A for meanings; optional read-only export of Peggy statement `loc` beside `listTopLevelDefinitions` (no node-shape change). Flatten is an explicit **source** rewrite after user confirm, not a change to expansion semantics
- [x] Plugins remain isolated; core does not gain plugin dependencies — tracker columns stay channel-agnostic; chip plugins unchanged
- [x] Determinism and compatibility preserved (or migration documented) — round-trip tests; composition sugar remains authoring text (read-only visually)
- [x] Tests planned for new behavior — projection, flatten serialize, seq/channel rewrite, shared-seq detection before UI merge

**Exceptions**: none

## Project structure

### Edit model (blocks UI)

- `packages/engine/src/parser/peggy/index.ts` — read-only helper listing `pat` / `seq` / `channel` statement spans (`loc`), sibling to `listTopLevelDefinitions`
- `packages/app-core/src/editor/pattern-editor-model.ts` (new) — project `patternEvents` → steps; detect compact RHS; serialize flat RHS; command types (`setStep`, `setEffect`, …)
- `packages/app-core/src/editor/sequence-editor-writeback.ts` (new) — rewrite classic `seq` items and channel top-level `seq`/`pat` clauses; preserve item modifiers; shared-seq detection; flatten confirm metadata
- `packages/app-core/src/editor/undoable-replace.ts` — reuse as-is (`pattern-editor` / `sequence-editor` edit sources)
- `packages/app-core/tests/pattern-editor-model.test.ts`, `sequence-editor-writeback.test.ts` (new)

### Desktop tracker

- `apps/desktop/src/renderer/src/components/panels/` — new tracker panel (or sibling under Pattern Grid host)
- `apps/desktop/src/renderer/src/lib/desktop-workspace.ts` — wire `parse:success`, selection from Pattern Grid / Monaco, `applyUndoableReplace`
- Shortcuts / View menu / feature flag as needed (follow existing pattern-grid / instrument-editor flag patterns)
- Styles: pointer targets, `touch-action`, zoom for cell size

### Arrangement grips

- `apps/desktop/src/renderer/src/components/panels/DesktopPatternGrid.tsx` — grip affordance + Move / Duplicate / Delete; keep ruler seek/loop from 014
- Reuse `packages/app-core/src/editor/arrangement-slice.ts` timelines for block identity; writeback via sequence-editor module

### Docs

- `docs/features/` (or composer UI doc) — flatten-on-edit, read-only composition / declaration-modifier cases, tracker vs Pattern Grid roles

## Implementation

### AST changes

None to node meanings. Optional tooling helper returns statement spans already present on Peggy stmts.

### Parser / grammar changes

None.

### CLI changes

N/A.

### Desktop / web UI changes

Desktop only for v1 UI. Web-lite out of scope; do not assume desktop-only APIs inside `app-core` model modules.

### Export changes

N/A.

### Documentation updates

User-facing flatten-on-edit note; link from Desktop troubleshooting or features index if present. No `specs/global/language.md` change unless a contract gap is found (unexpected).

## Testing strategy

### Unit tests

- Flat `pat` project → edit cell → serialize → re-parse equals intended tokens
- Compact `(C4 E4)*2` / quoted lists: view expands; mutate requires flatten flag; cancel path leaves string unchanged when host respects confirm
- `:N` preserved on serialize when span untouched
- Classic `seq` reorder / duplicate / delete; modifiers preserved; `pat*4` flatten
- Channel clause rewrite keeps `inst` / `speed` / `lock`
- Shared `seq` detection
- Composition / `pat name:mod` marked read-only

### Integration tests

- Desktop smoke or component tests for writeback wiring if practical; otherwise manual QA checklist in tasks

### Manual / QA

- Undo/redo after tracker paint and after seq move
- Focus retention when parse refreshes with tracker focused
- Seek/loop regression on Pattern Grid
- Tracker keyboard inactive while Monaco focused

## Migration and compatibility

Existing songs remain valid. First visual edit of compact statements may expand them (user-confirmed). No silent migration on open.

## Open implementation questions

- Tracker host chrome: dedicated panel vs split under Pattern Grid (does not change FR set).
- Session-only memory of “already confirmed flatten for this statement” vs prompt every compact edit after reload (spec default: session only).
