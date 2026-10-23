# Implementation Plan: Instrument editor DMC sample Browse + Check

**Spec**: [spec.md](spec.md) | **Date**: 2026-10-23 | **Branch**: `feat/102-instrument-editor-sample-browse-verify`

## Summary

Extend the Desktop Instrument Editor `sample` widget with Local **Browse…** (relative `local:` only) and **Check** (resolve via existing `resolveSampleAsset` / Desktop IPC). Soft-validate unknown `@nes/` names against `bundledSamples`. Align NES hover/wizard kit lists with `BUNDLED_SAMPLES`. No grammar, CSP, or remote-policy changes.

## Technical context

- **Packages / surfaces**: `apps/desktop`, `packages/app-core`, `packages/engine` (NES validate + docs strings)
- **Language**: TypeScript (strict), ESM
- **Testing**: Jest via `npm test`; optional desktop unit tests for path helper
- **Client profile**: desktop-full (Instrument Editor)
- **Performance / constraints**: Check is on-demand; reuse 019 fetch limits (timeout / 1 MiB / redirects)

## Constitution Check

GATE: must pass before implementation. Re-check after design changes.

- [x] No invented syntax or undocumented language behavior — existing `dmc_sample` schemes only
- [x] AST / ISM / scheduler / expansion impact identified (or N/A) — N/A (source rewrite of existing prop)
- [x] Plugins remain isolated; core does not gain plugin dependencies — generic `sample` widget; resolve via chip `resolveSampleAsset`
- [x] Determinism and compatibility preserved (or migration documented) — load policy unchanged; validation may newly reject unknown `@nes/` names (stricter, documented)
- [x] Tests planned for new behavior

**Exceptions**: none

## Project structure

- `apps/desktop/src/renderer/src/components/panels/DesktopInstrumentEditor.tsx` — `InstrumentSampleField`: Browse… + Check + status line
- `apps/desktop/src/renderer/src/styles.css` — sample-row control styles if needed
- `apps/desktop/src/main/ipc-handlers.ts` (+ preload / `electron-api` types) — open-dialog options for `.dmc` filters / title if `chooseOpenFile` is too song-oriented; optional dedicated helper
- `packages/app-core/src/editor/` — relative-path helper from absolute file + song dir → `local:` remainder (or desktop util calling into app-core)
- `packages/app-core/src/editor/instrument-editor-schema.ts` — reuse `formatInstrumentSampleRef` / parse; no scheme changes
- `packages/engine/src/chips/nes/validate.ts` — reject unknown `@nes/<name>` against bundled kit keys
- `packages/engine/src/chips/nes/ui-contributions.ts` / `songWizard.ts` — kit list sync with `dmcSamples.ts`
- `docs/chips/nes/composition_guide.md` — Browse + Check note
- `specs/complete/021-instrument-editor-panel/spec.md` — Future Enhancements: Browse + Check → feature 102

## Implementation

### AST changes

N/A

### Parser / grammar changes

N/A

### CLI changes

N/A (CLI `wav2dmc` remains the conversion path; not wired into the panel)

### Desktop / web UI changes

1. **Browse…** (Local only): Invoke Electron open dialog with DMC-oriented filters; default directory = song dir when known. Convert absolute selection → relative path under song dir (posix-style remainder for `local:`). Commit via `formatInstrumentSampleRef('local', remainder, chip)`. Gate through 099 Live / Apply.
2. **Check**: Compose current ref string; call `chipRegistry.get(chip)?.resolveSampleAsset?.(ref)` (NES implements this). On success, show byte length; on failure, show `Error.message` (ensure allowlist remediation from main process still reaches the renderer).
3. **Status UI**: Non-blocking line under the sample row; clear on scheme/value change or next Check.
4. **Read-only imports**: Keep Browse/value disabled; Check may remain enabled for probe consistency with audition.
5. **Web-lite**: out of scope (do not ship Browse/Check controls there).

### Engine / validation

- In `validateNesInstrument`, when `dmc_sample` starts with `@nes/`, require the name to exist in the bundled kit map (same keys as `bundledSamples` / `BUNDLED_SAMPLES`). Keep existing scheme / `local:` path-segment rules.

### Export changes

N/A

### Documentation updates

- Fix stale bundled-sample enumerations in `ui-contributions.ts` / `songWizard.ts`
- Short Browse + Check note in `docs/chips/nes/composition_guide.md`
- Amend 021 Future Enhancements to point at 102

## Testing strategy

### Unit tests

- Relative-path helper: happy path under song dir; reject `..` / outside roots / unsaved song
- `validateNesInstrument`: unknown `@nes/foo` fails; known kit name passes
- Sample format helpers unchanged for Browse-produced remainders (spaces encoding)

### Integration / desktop tests

- Optional: mock open dialog + Check resolve success/failure messaging in desktop tests
- Reuse existing remote allowlist tests; do not weaken them

### Manual / QA

- `songs/nes/instruments/nes_dmc_demo.bax` (or equivalent): Browse a sibling `.dmc`, Check Local, Check `@nes/kick`, Check a blocked host (expect allowlist hint), Trigger audition still works

## Migration and compatibility

No song migration. Songs with invalid `@nes/` names that previously only failed at load will now fail instrument validation earlier (intentional tighten).

## Open implementation questions

None blocking. Whether Browse reuses `chooseOpenFile` with extended filters vs a thin dedicated IPC is an implementation detail under FR-001.
