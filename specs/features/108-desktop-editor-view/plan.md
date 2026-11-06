# Implementation Plan: Desktop Monaco editor view settings

**Spec**: [spec.md](spec.md) | **Date**: 2026-11-06 | **Branch**: `feat/108-desktop-editor-view`

## Summary

Wire new Desktop-only Monaco view preferences into the existing Settings → Editor section and the shared preference store. Persist under `beatbax:*`, live-apply via Monaco `updateOptions`, unify font size with View → Zoom (and optional mouse-wheel zoom), and leave web-lite without Settings UI for these controls. No language, AST, or theme-engine work.

## Technical context

- **Packages / surfaces**: `packages/app-core` (storage keys, settings atoms, optional apply helper), `apps/desktop` (Settings Editor section, editor setup, zoom handlers)
- **Language**: TypeScript (strict), ESM
- **Testing**: Jest via `npm test` (store defaults, option mapping, font-size clamp / Zoom sync)
- **Client profile**: desktop-full (Settings UI); shared defaults may live in app-core; web-lite is not extended
- **Performance / constraints**: Live-apply must not remount Monaco; avoid persisting session-only state outside the listed keys

## Constitution Check

GATE: must pass before implementation. Re-check after design changes.

- [x] No invented syntax or undocumented language behavior — UI preferences only
- [x] AST / ISM / scheduler / expansion impact identified (or N/A) — N/A; tab size does not change parse rules
- [x] Plugins remain isolated; core does not gain plugin dependencies — N/A
- [x] Determinism and compatibility preserved (or migration documented) — song output unchanged; missing keys fall back to current factory look
- [x] Tests planned for new behavior — store defaults / SECTION_KEYS, font-size clamp 8–32, Zoom writes the same atom, option mapping for new keys

**Exceptions**: none

## Project structure

Likely touch points (implementation PR; this pass is specs only):

- `packages/app-core/src/utils/local-storage.ts` — new `StorageKey` entries for font family, tab size, minimap, line numbers, whitespace, indent guides, cursor, mouse-wheel zoom
- `packages/app-core/src/stores/settings.store.ts` — atoms + `SECTION_KEYS.editor`
- `packages/app-core/src/editor/monaco-setup.ts` — optional: accept / document factory defaults; callers may still `updateOptions` after create
- `apps/desktop/src/renderer/src/components/settings/editor.tsx` — new rows; font size max/min 8–32; fold-comments row
- `apps/desktop/src/renderer/src/lib/desktop-editor-setup.ts` (or equivalent setup path) — apply stored view options on editor ready
- `apps/desktop/src/renderer/src/lib/desktop-workspace.ts` (and menu paths that zoom) — Zoom In/Out/Reset write `settingFontSize` and clamp 8–32
- Do **not** extend `apps/web-ui/src/panels/settings-sections/editor.ts` for these controls

## Implementation

### AST changes

None.

### Parser / grammar changes

None.

### CLI changes

None.

### Desktop / web UI changes

1. Add storage keys and atoms with defaults matching today’s hardcoded Monaco look.
2. On Desktop editor ready, apply stored font family, font size, tab size, minimap, line numbers, whitespace, indent guides, cursor style, and mouse-wheel zoom.
3. Add Settings → Editor controls that set atoms and call `updateOptions` (and toolbar sync for fold comments if that path already exists).
4. Point View → Zoom In/Out/Reset at the same font-size atom (clamp 8–32; Reset → 14).
5. When mouse-wheel zoom is on, enable Monaco’s modifier+wheel zoom path and keep the atom in sync when size changes.
6. Include new keys in Editor section reset.
7. Leave web-lite Settings modal unmounted; do not add chrome controls there.

### Export changes

None.

### Documentation updates

- Amend [spec 057](../../complete/057-settings-panel/spec.md) with a pointer that font-size bounds and the new view rows are specified in 108 (done in the same intake PR as this folder).
- User-facing Desktop docs only when the implementation PR ships (tasks T900).

## Testing strategy

### Unit tests

- New atoms default correctly; `SECTION_KEYS.editor` lists new keys.
- Font size clamp / Zoom helper writes the shared atom within 8–32.
- Mapping from preference values to Monaco option shapes (minimap, renderWhitespace, cursorStyle, lineNumbers, tabSize).

### Integration tests

- Optional: Settings section render smoke if desktop settings tests already cover Editor rows.

### Manual / QA

- Desktop: change each control, reload, Reset section.
- Desktop: Settings size ↔ Zoom ↔ wheel zoom (on/off).
- Web-lite: confirm no Settings modal for these rows; factory editor look.

## Migration and compatibility

- Absent keys → factory defaults (current look). No song-file migration.
- Existing `beatbax:editor.fontSize` values outside the old 10–24 UI range but inside 8–32 remain valid; values outside 8–32 clamp on apply.
- Spec 057 font-size row is amended by reference to this feature; do not duplicate the full new table in 057.

## Open implementation questions

- Exact CSS stacks for each font-family select label (must cover FR-002’s set).
- Whether wheel-zoom size changes are observed via Monaco events or by updating the atom only from a dedicated handler — either is fine if Settings and Zoom stay synchronized.
