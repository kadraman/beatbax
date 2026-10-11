---
title: "Desktop MIDI import"
id: 96
slug: "desktop-midi-import"
status: "specified"
authors:
  - "kadraman"
created: "2026-10-08"
updated: "2026-10-11"
issue: "https://github.com/kadraman/beatbax/issues/210"
area: "desktop"
related:
  - "specs/complete/006-midi-importer/spec.md"
  - "specs/complete/089-midi-import-arrangement/spec.md"
  - "specs/complete/090-midi-import-naming/spec.md"
  - "specs/features/094-midi-import-sms-spectrum/spec.md"
  - "specs/features/095-midi-import-chord-arp/spec.md"
---

# Feature Specification: Desktop MIDI import

## Summary

Add **File → Import MIDI…** to BeatBax Desktop. The user picks a `.mid` / `.midi` file, chooses a chip and (optionally) an importer config, and gets the converted song as a new unsaved document. The conversion calls the same engine API as `beatbax import midi` (`parseImportConfig`, `resolveConvertOptions`, `convertMidiToBax`), so identical inputs give identical output. A companion config named `<song>.import.json` next to the MIDI file is found and preselected automatically, and the user can change or clear it before converting.

## Problem

- MIDI import is CLI-only (spec 006: "No Desktop/Web UI in v1"; 089 non-goal "A Desktop / Web import UI"). Desktop users have to leave the app and use a terminal.
- Real imports usually need a config (track mappings, bar ranges, chord policy, timing). The repo convention is a sibling `<song>.import.json` (for example `songs/midi/*.import.json`, `packages/engine/tests/fixtures/midi/*.import.json`), but nothing finds it automatically.
- The renderer cannot list or read arbitrary files, so finding a sibling config needs the main process.

## User scenarios

### User Story 1 — Import a MIDI without a config (Priority: P1)

**Why this priority**: The minimum useful flow.

**Independent test**: File → Import MIDI…, choose `f02-gb-kit.mid`, keep chip Game Boy, click Import; the editor shows the converted song, and its text equals `beatbax import midi f02-gb-kit.mid --chip gameboy` output.

**Acceptance scenarios**:

1. **Given** the user chooses File → Import MIDI…, **When** the file dialog opens, **Then** it filters for `.mid` and `.midi` files (with an "All files" option) and starts in the last-used dialog folder.
2. **Given** a chosen MIDI with no sibling config, **When** the import dialog opens, **Then** it shows the file name, a chip selector (required; preselected from the last import's chip when there is one, otherwise empty until the user picks one), the config field set to "None (automatic mapping)", and the basic options from FR-020 with the values FR-022 gives them.
3. **Given** the user clicks Import, **When** the conversion succeeds, **Then** the song opens as a new unsaved document named `<midi basename>.bax` (the same way the New Song Wizard opens a song) and a summary (notes imported, dropped, patterns, channels, bpm, chip) is shown in the Output panel with every warning.
4. **Given** the conversion throws (invalid MIDI, strict quantize failure), **When** Import is clicked, **Then** the dialog stays open and shows the error message; the current document is not changed.

### User Story 2 — Use a companion config (Priority: P1)

**Why this priority**: Most real imports need a config; auto-detection removes a manual step.

**Acceptance scenarios**:

1. **Given** `Song.mid` and `Song.import.json` in the same folder, **When** the user chooses `Song.mid`, **Then** the dialog shows the config field set to `Song.import.json` with the label "found next to the MIDI file", and Import uses it.
2. **Given** a detected config, **When** the user clicks Clear, **Then** the field shows "None (automatic mapping)" and Import runs without a config.
3. **Given** any state, **When** the user clicks Browse…, **Then** a JSON file dialog opens in the MIDI file's folder and the chosen file replaces the config.
4. **Given** a config that fails `parseImportConfig` (bad JSON or schema error), **When** it is selected, **Then** the dialog shows the parser's message (same text as the CLI's `Failed to parse config: …`) and Import is disabled until the config is fixed, cleared or replaced.
5. **Given** a config with `"chip": "nes"`, **When** it is selected and the user has not picked a chip in this dialog, **Then** the chip selector shows `nes` labelled "from config", even if Game Boy was remembered from the last import, and Import uses `nes`. A chip the user picks in this dialog overrides the config (CLI `--chip` precedence).
6. **Given** `Song.json` (no `.import`) next to `Song.mid`, **When** the MIDI is chosen, **Then** it is **not** auto-detected; the user can still choose it with Browse….
7. **Given** the previous import used quantize `floor` and the auto-detected config sets `"quantize": { "mode": "nearest" }`, **When** the dialog opens, **Then** quantize shows `nearest` labelled "from config", and Import uses `nearest`. **Given** instead a config that sets no quantize mode, **Then** quantize shows `floor` labelled "last used", and Import uses `floor`.
8. **Given** a detected config that sets the chip or an option, **When** the user clicks Clear, **Then** every field the user has not set in this dialog changes to its remembered value or, failing that, the default (FR-022).

### User Story 3 — Inspect before importing (Priority: P3)

**Why this priority**: Helps users write configs, but the CLI `--inspect` already covers it.

**Acceptance scenarios**:

1. **Given** a chosen MIDI, **When** the user expands "Tracks", **Then** the dialog shows the 089 inspect report (track, channel, program, name, notes, range, bars, duplicates, tempos) from `inspectMidiBytes`.

### Edge cases

- The chip list comes from the engine's supported import chips, not a hard-coded Desktop list, so SMS and Spectrum 128 appear once spec 094 ships.
- Options the config also sets (quantize, title, section bars, annotate, chords from spec 095) follow CLI precedence: a value the user sets in the dialog overrides the config, and the config overrides a value remembered from an earlier import (FR-022).
- The imported document is unsaved; Save As suggests `<midi basename>.bax` in the MIDI file's folder.
- Importing while a song plays stops playback first, as Open does.
- The current document is replaced the same way File → New / Open replace it today (no new unsaved-changes behaviour is introduced here).
- Conversion runs synchronously in the renderer. The dialog shows a busy state while it runs; moving conversion to a worker is out of scope unless real files prove slow.
- A MIDI chosen by drag-and-drop or Open… is out of scope; only File → Import MIDI… starts the flow.

## Requirements

### Functional requirements

Entry point and files

- **FR-001**: Desktop MUST add **File → Import MIDI…** to the native menu (all platforms) and to the renderer menu bar, after Open Recent.
- **FR-002**: The main process MUST provide a MIDI open dialog (filters `.mid`, `.midi`, All files) that returns the file bytes, path and name, plus the bytes and path of `<basename>.import.json` in the same folder when that file exists. `<basename>` is the file name without its last extension (`Song.mid` → `Song.import.json`; `Song.midi` → `Song.import.json`).
- **FR-003**: The main process MUST provide a JSON open dialog for Browse… that starts in the MIDI file's folder and returns bytes, path and name.
- **FR-004**: The renderer MUST NOT read files by path itself; both dialogs return contents over IPC, as File → Open does today.

Conversion

- **FR-010**: Conversion MUST use `parseImportConfig`, `resolveConvertOptions` and `convertMidiToBax` from `@beatbax/engine/import` with the same argument precedence as `packages/cli/src/import-midi.ts`. The Desktop MUST NOT reimplement mapping, quantize or emit logic.
- **FR-011**: For the same MIDI bytes, config and options, Desktop output MUST be byte-identical to the CLI output.
- **FR-012**: The chip selector MUST list the chips the engine import accepts (exported from the engine), so profiles added later (spec 094) appear without Desktop changes.

Dialog options

- **FR-020**: The dialog MUST offer: chip (required), config (auto-detected / Browse… / Clear), quantize mode (`nearest` | `floor` | `ceil` | `strict`), grid (`1/4` | `1/8` | `1/16` | `1/32`), section bars, title, strict, annotate, and (once spec 095 ships) chords (`flatten` | `arp`). Which value each field shows, and which values are passed to `resolveConvertOptions`, is defined in FR-022.
- **FR-021**: When an import succeeds, the dialog MUST remember, for the rest of the app session (not per file), the chip and option values the user set in that dialog. Values that came from a config are not remembered. The config choice and the title are never remembered across files. Remembered values are fallbacks, not overrides: they apply only where neither the user nor the selected config sets the field (FR-022).
- **FR-022**: Each field's value comes from the first of these sources that has one. The dialog shows the value and its source, and recomputes it whenever the config is detected, browsed or cleared:
  1. **Set in this dialog**: the user chose a value since the dialog opened. Passed, and overrides the config.
  2. **From config**: the selected config sets this field (`chip`, `quantize.mode`, `quantize.grid`, `sectionBars`, `title`, `annotate`, `chords`). Not passed, so the config applies as in the CLI.
  3. **Last used**: a value remembered under FR-021. Passed. The config does not set this field, so passing it does not override the config.
  4. **Default**: the engine default. Not passed. For the chip there is no default: the selector stays empty and Import is disabled.

  `strict` cannot be set by a config, so only sources 1, 3 and 4 apply to it. Under this rule, the value the dialog shows for a field is always the value the import uses.

Results and diagnostics

- **FR-030**: On success the generated source MUST open as an unsaved document named `<midi basename>.bax` through the same path the New Song Wizard uses.
- **FR-031**: The conversion summary and every diagnostic (`info` included) MUST be written to the Output panel, prefixed with the MIDI file name. Warnings count toward the existing Output badge.
- **FR-032**: Conversion and config errors MUST be shown in the dialog without changing the current document.

### Non-goals

- Live MIDI input or step entry (spec 065).
- A visual track-to-channel mapping editor (follow-up).
- Writing or editing import configs from the dialog.
- Web (`web-lite`) MIDI import (follow-up; the engine API is browser-safe, but file pickers and sibling detection differ).
- New conversion behaviour; anything the CLI cannot do is out of scope.
- Round-trip with `export midi`.

## Success criteria

- **SC-001**: Acceptance tests cover import without a config, with an explicit config, with an auto-detected sibling config, and with the auto-detected config cleared or replaced (issue #210 checklist).
- **SC-002**: For `packages/engine/tests/fixtures/midi/f03-nes-kit.mid` with `f03-nes-kit.import.json`, the Desktop output equals the CLI output byte for byte.
- **SC-003**: `docs/features/midi-importer.md` gains a Desktop section (menu, sibling config rule, precedence), and Desktop help lists the menu item.

## Assumptions

- `@beatbax/engine/import` stays browser-safe (`@tonejs/midi` reader, no Node APIs), so conversion can run in the renderer.
- MIDI files of interest convert in well under a second.

## Open questions

- **OQ-1**: Should the dialog also offer "Save .bax next to the MIDI" (write immediately) in addition to opening an unsaved document? Proposed: no; Save As already suggests that location.
- **OQ-2**: Web parity. Proposed: a separate spec once Desktop ships.

## References

- [#210](https://github.com/kadraman/beatbax/issues/210)
- [Spec 006 — MIDI importer](../../complete/006-midi-importer/spec.md), [Spec 089](../../complete/089-midi-import-arrangement/spec.md), [Spec 090](../../complete/090-midi-import-naming/spec.md)
- [Spec 094 — SMS / Spectrum profiles](../094-midi-import-sms-spectrum/spec.md), [Spec 095 — chords as arpeggios](../095-midi-import-chord-arp/spec.md)
- `packages/cli/src/import-midi.ts` (option precedence), `apps/desktop/src/main/ipc-handlers.ts` (`chooseOpenFile`), `apps/desktop/src/renderer/src/App.tsx` (`handleCreateFromWizard`)
- [MIDI importer docs](../../../docs/features/midi-importer.md)
