# Implementation Plan: Instrument Editor workspace

**Spec**: [spec.md](spec.md) | **Date**: 2026-11-01 | **Branch**: `feat/103-instrument-editor-workspace`

## Summary

Re-host [`DesktopInstrumentEditor.tsx`](../../../apps/desktop/src/renderer/src/components/panels/DesktopInstrumentEditor.tsx) in a Settings-style body-mounted modal with section nav; remove the Instruments right-pane tab; add a toolbar instrument select + Edit; extend writeback for Game Boy `subpat` blocks; add sample Browse/Check on the existing `sample` widget. No grammar or remote-policy changes. Specs 098/099 behaviour is preserved, not reimplemented.

## Technical context

- **Packages / surfaces**: `apps/desktop`, `packages/app-core`, `packages/engine` (NES validate + kit list sync; optional `nav` on schema types)
- **Language**: TypeScript (strict), ESM
- **Testing**: Jest via `npm test`
- **Client profile**: desktop-full (Instrument Editor)
- **Performance / constraints**: Modal larger than Settings; Check on-demand with existing 019 fetch limits

## Constitution Check

GATE: must pass before implementation. Re-check after design changes.

- [x] No invented syntax or undocumented language behavior — `subpat` / SubPatRow and `dmc_sample` schemes unchanged
- [x] AST / ISM / scheduler / expansion impact identified (or N/A) — N/A (source rewrite → re-parse; 082 lowering unchanged)
- [x] Plugins remain isolated; core does not gain plugin dependencies — host widgets only; optional `nav` on schema fields
- [x] Determinism and compatibility preserved (or migration documented) — unknown `@nes/` validation may newly reject invalid names (stricter, documented)
- [x] Tests planned for new behavior

**Exceptions**: none

## Project structure

### Modal / chrome

- `apps/desktop/src/renderer/src/components/panels/DesktopInstrumentEditor.tsx` — section-nav layout; modal host/handle (`open` / `close` / `open({ name })`); remove right-pane-only assumptions
- New or sibling mount helper mirroring `createDesktopSettingsModal` (body host, open state)
- `apps/desktop/src/renderer/src/lib/desktop-workspace.ts` — stop mounting into `rightTabs.tabContents.instruments`; wire `instrument-editor:open` / `panel:toggled` / feature flag to modal; MIDI audition when modal open
- `apps/desktop/src/renderer/src/components/shell/tabs.ts` — drop `instruments` from `RightTabId` / order / labels
- `apps/desktop/src/renderer/src/components/shell/panels-menu.ts`, `menu-bar.ts`, `register-shortcuts.ts`, `setup-desktop-monaco-shortcuts.ts` — open modal instead of side-pane toggle; checked state = modal open (or command without sticky pane)
- `apps/desktop/src/renderer/src/lib/instrument-editor-keys.ts` — gate on open modal class / data attribute
- `apps/desktop/src/renderer/src/styles.css` — modal backdrop/dialog (reuse settings patterns); drop or retire right-tab Instruments rules as needed
- `packages/app-core/src/utils/local-storage.ts` / `settings.store.ts` / `instrument-editor-panel.ts` — `panel.instrument-editor` no longer means right-pane open; feature flag unchanged
- `apps/desktop/src/renderer/src/components/settings/features.tsx` — copy update

### Toolbar picker

- `apps/desktop/src/renderer/src/components/workspace/DesktopToolbar.tsx` — instrument select + Edit; subscribe to parse AST / event bus for names and selection sync

### Schema hook

- `packages/engine/src/chips/types.ts` — optional `nav?: string` on field/macro defs
- `packages/app-core/src/editor/instrument-editor-schema.ts` — nav visibility helper (unit-tested)

### Subpat rows (former 101)

- `packages/app-core/src/editor/instrument-editor-writeback.ts` — `replaceSubpatBlock`, `insertSubpatBlock`, set/clear `subpat=`
- `packages/app-core/src/editor/subpat-format.ts` (or sibling) — `parseSubPatternRow`
- `packages/app-core/src/editor/instrument-editor-draft.ts` — dirty fingerprint includes `subpat` name + rows
- Panel Subpattern section UI + styles

### Sample Browse / Check (former 102)

- Sample field UI in `DesktopInstrumentEditor.tsx` — Browse… + Check + status
- `packages/app-core/src/editor/` — absolute → relative `local:` helper
- `apps/desktop/src/main/ipc-handlers.ts` (+ preload / `electron-api`) — DMC open-dialog filters if needed
- `packages/engine/src/chips/nes/validate.ts` — unknown `@nes/<name>` reject
- `packages/engine/src/chips/nes/ui-contributions.ts` / `songWizard.ts` — kit list sync with `dmcSamples.ts`

### Docs / specs

- `docs/grammar/instruments.md`, `docs/chips/nes/composition_guide.md`
- `specs/complete/021-instrument-editor-panel/spec.md` — Future Enhancements: note modal workspace 103; single-column subpat + Browse/Check absorbed; multi-column tracker still future
- `specs/STATUS.md` — move 103 to complete when shipped

## Implementation

### AST changes

N/A

### Parser / grammar changes

N/A

### CLI changes

N/A

### Desktop / web UI changes

1. **Modal shell**: Mount editor React root on `document.body` like Settings. `open(name?)` selects instrument, shows backdrop, focuses panel. Escape / backdrop / Close dismiss with dirty guard.
2. **Section nav**: Pure helper maps schema + type + draft → visible section ids; render one section body at a time. Header retains picker and structural actions.
3. **Remove right tab**: Delete Instruments from tab chrome; migrate any `ui.activeRightTab === 'instruments'` restore to first available tab; stop `settingShowInstrumentEditor` from ensuring a right tab open (flag still gates toolbar + open commands).
4. **Toolbar**: Populate from `parse:success` / `resolvedAst`; selection state shared with modal (event bus or small store). Select → `instrument-editor-nav` reveal without focus; Edit → `instrument-editor:open`.
5. **Preview keys / MIDI**: Replace `.bb-right-tab-content--active` check with modal-open marker.
6. **Subpat**: Writeback helpers + Subpattern section (Create / Attach / Detach / rows) gated on local GB.
7. **Sample**: Browse Local via main-process dialog → relative helper → format ref; Check via `resolveSampleAsset`.

Web-lite: out of scope.

### Export changes

N/A (082 / sample load paths unchanged once source is correct)

### Documentation updates

- Instruments grammar intro: modal + toolbar + subpat editing
- NES composition guide: Browse + Check
- 021 Future Enhancements cross-links
- Features settings blurb

## Testing strategy

### Unit tests

- Nav visibility helper (schema + type + optional `nav`)
- Subpat insert/replace/set-clear / parse-format round-trip
- Sample relative-path Browse outcomes; NES unknown bundled name validation
- `shouldHandleInstrumentPreviewKey` modal gate
- Menu / panels checked state for Instruments open command

### Integration tests

- Existing writeback / undoable-replace / draft tests remain green

### Manual / QA

- `songs/gameboy/instruments/gb_subpattern_macro_demo.bax` — Create / edit / Detach
- `songs/nes/instruments/nes_dmc_demo.bax` — Browse, Check, Trigger, blocked host
- Toolbar select while typing in Monaco; Edit / CodeLens / Escape

## Migration and compatibility

- Stored `ui.activeRightTab=instruments` → fall back
- `panel.instrument-editor` semantics change (no side pane); feature flag unchanged
- Stricter NES `@nes/` validation may newly fail invalid names that previously only warned at preload

## Open implementation questions

- Exact modal class names vs sharing `.bb-settings-*` shells — prefer dedicated `.bb-inst-editor-modal*` to avoid Settings CSS coupling, reusing button classes where already shared.
- Whether View → Instruments is a toggle (open/close) or always “open” — prefer toggle when modal open, matching Settings’ open command pattern as closely as UX allows.
