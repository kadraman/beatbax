# Tasks: Desktop Monaco editor view settings

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn [P?] [USn?] Description` with **exact repo paths**.

- **[P]**: can run in parallel (different files, no shared-write dependency)
- **[USn]**: maps to a user story in spec.md

## Phase 0: Foundation (blocks stories)

- [x] T001 [P] Add storage keys in `packages/app-core/src/utils/local-storage.ts` for font family, tab size, minimap, line numbers, whitespace, indent guides, cursor style, and mouse-wheel zoom
- [x] T002 Add nanostore atoms and include the new keys (plus existing fold-comments / font-size) in `SECTION_KEYS.editor` in `packages/app-core/src/stores/settings.store.ts`
- [x] T003 [P] Add unit tests for defaults, clamps (font size 8–32), and Monaco option mapping under `packages/app-core/tests/` (new or existing settings/editor test file)

**Checkpoint**: foundation complete before user-story work.

## Phase 1: User Story 1 — Desktop view chrome in Settings (P1)

- [x] T010 [US1] Apply stored view options on Desktop editor ready in `apps/desktop/src/renderer/src/lib/desktop-editor-setup.ts` (and/or `packages/app-core/src/editor/monaco-setup.ts` if factory defaults are adjusted carefully)
- [x] T011 [US1] Add Settings → Editor rows in `apps/desktop/src/renderer/src/components/settings/editor.tsx` for font family, tab size, minimap, line numbers, whitespace, indent guides, cursor style, and fold comments; live-apply via Monaco `updateOptions` / existing fold-comments helpers
- [x] T012 [US1] Verify Editor section Reset in `apps/desktop/src/renderer/src/components/panels/DesktopSettingsModal.tsx` (or section `reset` wiring) clears the new keys and reapplies factory look

**Checkpoint**: story independently testable on Desktop Settings → Editor.

## Phase 2: User Story 2 — One persisted font size for Settings and Zoom (P1)

- [x] T020 [US2] Widen Settings font size to 8–32 in `apps/desktop/src/renderer/src/components/settings/editor.tsx` and keep live-apply + atom write
- [x] T021 [US2] Update View → Zoom In/Out/Reset in `apps/desktop/src/renderer/src/lib/desktop-workspace.ts` (and any mirrored menu handlers under `apps/desktop/src/renderer/src/components/` / main menu) to clamp 8–32, Reset → 14, and write `settingFontSize`
- [x] T022 [US2] Wire mouse-wheel zoom toggle (default off) so modifier+wheel changes the same persisted font size when enabled

**Checkpoint**: Settings, Zoom, and optional wheel zoom stay in sync across reload.

## Phase 3: User Story 3 — Web-lite stays limited (P2)

- [x] T030 [US3] Confirm `packages/app-core/src/client-profile.ts` keeps `settingsPanel: false` for web-lite and that `apps/web-ui/src/main.ts` / `apps/web-ui/src/panels/settings-sections/editor.ts` are **not** extended with the new chrome controls
- [x] T031 [US3] Manual smoke: web-lite mounts with factory Monaco look; no Settings modal for view chrome

**Checkpoint**: web-lite boundary unchanged.

## Polish

- [x] T900 Update user-facing Desktop docs under `docs/` if a Settings / editor preferences page lists Editor rows
- [x] T901 Move this folder to `specs/complete/108-desktop-editor-view/` and update `specs/STATUS.md` when shipped
