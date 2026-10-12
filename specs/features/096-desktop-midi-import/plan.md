# Implementation Plan: Desktop MIDI import

**Spec**: [spec.md](spec.md) | **Date**: 2026-10-08 | **Branch**: `feat/096-desktop-midi-import`

## Summary

Two new main-process dialogs (MIDI with sibling-config lookup, and JSON for Browse…), one renderer dialog component, and a small app-core helper that turns dialog state into the CLI's `resolveConvertOptions` arguments. The helper is shared by the dialog and by a parity test against the CLI, so the precedence rules exist in one place on the Desktop side.

## Technical context

- **Packages / surfaces**: `apps/desktop` (main, preload, renderer), `packages/app-core` (option builder), `packages/engine` (export the supported-chip list)
- **Language**: TypeScript (strict), React renderer
- **Testing**: Jest (`apps/desktop/tests`, `packages/app-core/tests`); Playwright e2e in `apps/desktop/tests/e2e/`
- **Client profile**: desktop-full only
- **Constraints**: renderer never reads paths directly (FR-004); output byte-identical to CLI (FR-011)

## Constitution Check

- [x] No invented syntax or undocumented language behavior: UI over the existing importer
- [x] AST / ISM / scheduler / expansion impact: none
- [x] Plugins remain isolated; core does not gain plugin dependencies
- [x] Determinism and compatibility preserved: same engine call and precedence as the CLI
- [x] Tests planned for new behavior

## Project structure

| Path | Change |
| ---- | ------ |
| `packages/engine/src/import/midi/config.ts`, `index.ts` | Export `SUPPORTED_MIDI_IMPORT_CHIPS` (readonly list) used by `parseChipId` |
| `packages/app-core/src/import/midi-import-options.ts` (new) | `resolveMidiDialogFields({ userSet, remembered, config })` → per-field `{ value, source }` (FR-022); `buildMidiConvertArgs(fields, config)` → `resolveConvertOptions` input; `nextRememberedValues(remembered, userSet)` (FR-021); `companionConfigName(midiName)` |
| `apps/desktop/src/shared/electron-api.ts` | `DesktopMidiImportPayload { midi: DesktopFilePayload; companionConfig?: DesktopFilePayload }`; `openMidiFile()`, `openImportConfig(defaultDir)` |
| `apps/desktop/src/main/ipc-handlers.ts` | `chooseMidiFile` (filters, sibling `.import.json` read), `chooseImportConfigFile` (JSON filter, starts in MIDI folder) |
| `apps/desktop/src/preload/index.ts` | Bridge methods |
| `apps/desktop/src/main/menu.ts`, `apps/desktop/src/renderer/src/components/shell/menu-bar.ts`, `apps/desktop/src/renderer/src/lib/desktop-menu-bar.ts`, `apps/desktop/src/renderer/src/lib/desktop-startup.ts` | `file:import-midi` action after Open Recent (native and renderer menus, startup action list) |
| `apps/desktop/src/renderer/src/components/dialogs/MidiImportDialog.tsx` (new) | Dialog: file, chip, config (detected / Browse / Clear), options, Tracks (inspect), Import / Cancel |
| `apps/desktop/src/renderer/src/App.tsx` | `file:import-midi` handler: stop playback, open dialog, on success `loadDocument('<base>.bax', source, null)`, write summary to Output |
| `apps/desktop/tests/midi-import-options.test.ts`, `packages/app-core/tests/midi-import-options.test.ts` | Precedence, companion name, CLI parity |
| `apps/desktop/tests/e2e/midi-import.spec.ts` (new) | SC-001 flows with stubbed dialogs |
| `docs/features/midi-importer.md`, Desktop help | Desktop section |

## Implementation

### AST changes

None.

### Parser / grammar changes

None.

### CLI changes

None. (Optionally refactor `packages/cli/src/import-midi.ts` to use `buildMidiConvertArgs` if it fits without changing CLI behaviour; not required.)

### Desktop / web UI changes

- **Main process.** `chooseMidiFile` reuses `resolveOpenDialogDefaultPath` and `rememberLastFileDialogDirectory`. After a file is chosen it checks `path.join(dir, companionConfigName(name))` with `fs.stat`; if it is a regular file under 1 MiB it is read and returned. `chooseImportConfigFile` opens in the MIDI folder with a JSON filter.
- **Dialog.** Parses the config with `parseImportConfig` whenever it changes (error shown inline, Import disabled). On Import: `resolveConvertOptions(buildMidiConvertArgs(fields, config))`, then `convertMidiToBax(bytes, resolved, midiName)`. The "Tracks" section calls `inspectMidiBytes` lazily when expanded.
- **Field state (FR-021, FR-022).** The dialog keeps three inputs and derives everything else from them, so precedence is defined in one place:
  - `userSet`: values the user chose since the dialog opened.
  - `remembered`: session memory, held in App state and not persisted.
  - the parsed `config`, or none.

  `resolveMidiDialogFields` returns `{ value, source }` per field, with `source` one of `user`, `config`, `remembered`, `default`. The dialog renders the value with a label for `config` ("from config") and `remembered` ("last used"). `buildMidiConvertArgs` passes exactly the fields whose source is `user` or `remembered`, and omits `config` and `default` fields. A field counts as "set by the config" when the parsed config has it (`chip`, `quantize.mode`, `quantize.grid`, `sectionBars`, `title`, `annotate`, `chords`). Changing or clearing the config re-runs `resolveMidiDialogFields`; `userSet` is kept. On success, App replaces `remembered` with `nextRememberedValues(remembered, userSet)`, which merges `userSet` over the old memory and leaves out `title`. Config-sourced values never enter the memory.
- **Output.** Summary line matches the CLI's `MIDI import: …` text; diagnostics as `Warning: [code] message`, prefixed with the MIDI name.
- **Chip list.** From `SUPPORTED_MIDI_IMPORT_CHIPS`; display names from the chip registry when available, else the id.

### Export changes

None.

### Documentation updates

`docs/features/midi-importer.md` Desktop section; Desktop help / keyboard reference lists File → Import MIDI….

## Testing strategy

### Unit tests

- `companionConfigName`: `Song.mid`, `Song.MIDI`, `my.song.mid`, no extension.
- `resolveMidiDialogFields` / `buildMidiConvertArgs` (FR-022):
  - User-set fields are passed and override the config.
  - A config field beats a remembered value: remembered chip `gameboy` with config chip `nes` gives `nes` (source `config`, not passed); remembered quantize `floor` with config `quantize.mode: "nearest"` gives `nearest` (not passed).
  - A remembered value for a field the config does not set is shown as `remembered` and passed (quantize `floor` with a config that has no `quantize`).
  - With no user value, config value or remembered value, the field is `default` and is not passed; for the chip, the value is empty.
  - Clearing the config turns its fields back into `remembered` or `default`, and user-set values survive the change.
  - `strict` never has source `config`.
- `nextRememberedValues`: merges the values the user set; drops `title`; never stores config values. Two imports in a row (first with a config, then without) carry only the user's choices.
- CLI parity: for `f03-nes-kit` with its config, the args built by the Desktop helper produce the same `convertMidiToBax` source as the CLI path (SC-002).

### Integration tests

- e2e with dialog stubs (E2E env hook as used by other Desktop e2e tests): no config; explicit config via Browse; auto-detected sibling; detected then cleared; bad config shows the parse error (SC-001).

### Manual / QA

- Packaged build: import `songs/midi` examples with and without their `.import.json`; add rows to `docs/qa/desktop-release-qa.md`.

## Migration and compatibility

Additive; no existing Desktop flow changes.

## Open implementation questions

- Where the dialog component lives (`components/dialogs/` vs next to the New Song Wizard): follow whichever folder holds the wizard.
