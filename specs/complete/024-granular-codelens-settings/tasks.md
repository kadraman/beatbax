# Tasks: Granular CodeLens preview settings

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn Description` with repo paths.

## Phase 1: Settings model

- [x] T001 Storage keys `CODELENS_PATTERNS`, `CODELENS_SEQUENCES`, `CODELENS_INSTRUMENTS`, `CODELENS_EFFECTS` (`editor.codelens.*`) in `packages/app-core/src/utils/local-storage.ts`
- [x] T002 `boolAtom(..., true)` settings and editor reset keys in `packages/app-core/src/stores/settings.store.ts`

## Phase 2: Provider

- [x] T010 `getCodeLensCategoryFlags()` and per-category filter in `provideCodeLenses` (`packages/app-core/src/editor/codelens-preview.ts`); master toggle still drives Monaco `codeLens`
- [x] T011 Refresh lenses when a category setting changes; unsubscribe on dispose

## Phase 3: Settings UI

- [x] T020 Desktop: indented sub-toggles under the master toggle, disabled while it is off, updated help text, reset (`apps/desktop/src/renderer/src/components/settings/editor.tsx`)
- [x] T021 Web UI: same rows, help text and reset (`apps/web-ui/src/panels/settings-sections/editor.ts`)

## Phase 4: Tests and docs

- [x] T030 Lens counts per category flag combination, refresh and dispose (`packages/app-core/tests/codelens-preview.test.ts`)
- [x] T031 Settings rows, disabled state, persistence and reset (`apps/web-ui/tests/settings-panel.test.ts`)
- [x] T032 Cross-link from `specs/complete/051-editor-interactive-features/spec.md`; `.changeset/granular-codelens-settings.md`
- [x] T033 Move to `specs/complete/024-granular-codelens-settings/` and update `specs/STATUS.md`
