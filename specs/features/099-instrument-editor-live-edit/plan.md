# Implementation Plan: Instrument editor Live edit vs Apply

**Spec**: [spec.md](spec.md) | **Date**: 2026-10-22 | **Branch**: `feat/099-instrument-editor-live-edit`

## Summary

Gate `writeDraft` behind a persisted Live edit flag; when off, keep draft + dirty state, audition via `instPatch`, and commit only on Apply. Prompt on dirty navigation.

## Technical context

- **Packages / surfaces**: `packages/app-core`, `apps/desktop`
- **Language**: TypeScript (strict), ESM
- **Testing**: Jest via `npm test`
- **Client profile**: desktop-full (Instrument Editor)

## Constitution Check

GATE: must pass before implementation. Re-check after design changes.

- [x] No invented syntax or undocumented language behavior
- [x] AST / ISM / scheduler / expansion impact identified (or N/A) — N/A (preview merge only)
- [x] Plugins remain isolated; core does not gain plugin dependencies
- [x] Determinism and compatibility preserved (or migration documented)
- [x] Tests planned for new behavior

**Exceptions**: none

## Project structure

- `packages/app-core/src/utils/local-storage.ts` — `INSTRUMENT_EDITOR_LIVE_EDIT` key
- `packages/app-core/src/editor/instrument-editor-draft.ts` — dirty compare + preview patch helpers
- `packages/app-core/src/editor/codelens-preview.ts` — hit timing from patched inst
- `apps/desktop/.../DesktopInstrumentEditor.tsx` + `styles.css` — toggle, Apply/Revert, dirty dialog
- Tests under `packages/app-core/tests/`

## Implementation

1. Helpers: strip `__loc` / compare drafts; build `instPatch` for audition.
2. Panel state: `liveEdit`, `baseline`, `dirty`; gate writeback; parse:success skips clobber when dirty.
3. Toolbar UI + dirty dialog; persist Live preference.
4. `playNote` / MIDI audition merge draft patch when dirty or Live off with draft ≠ baseline.

## Testing strategy

- Unit: dirty equality, patch strip, commit decision helpers
- Manual: Live off tweak → preview → Apply / Revert / dirty switch
