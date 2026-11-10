---
title: "Instrument editor Live edit vs Apply"
id: 99
slug: "instrument-editor-live-edit"
status: "complete"
authors:
  - "kadraman"
created: "2026-10-22"
updated: "2026-11-10"
issue: "https://github.com/kadraman/beatbax/issues/230"
area: "desktop"
related:
  - "specs/complete/021-instrument-editor-panel/spec.md"
  - "https://github.com/kadraman/beatbax/issues/258"
---

# Feature Specification: Instrument editor Live edit vs Apply

## Summary

The Instrument Editor gains a **Live edit** toggle (default on, matching [021](../../complete/021-instrument-editor-panel/spec.md) writeback). When Live is off, field and macro edits stay in a panel draft for audition; **Apply** writes the `inst` line and **Revert** reloads from source. Dirty navigation prompts Apply / Discard / Cancel. Instrument Editor buffer writes do not arm transport Live playback ([#258](https://github.com/kadraman/beatbax/issues/258)).

## Problem

Every valid panel edit rewrites the `.bax` `inst` line immediately. Auditioning envelope or volume tweaks pollutes source and undo history even when the user only wanted to test a sound.

## User scenarios

### User Story 1 — Live edit on (Priority: P1)

**Why this priority**: Preserves current muscle memory and 021 behaviour.

**Independent test**: With Live on, change `vol`; source `inst` line updates immediately when valid.

**Acceptance scenarios**:

1. **Given** Live edit is on and a local instrument is selected, **When** a valid field changes, **Then** the `inst` line is rewritten (write-valid-only).
2. **Given** Live edit is on, **When** the draft is invalid, **Then** source is not written and panel errors show (unchanged from 021).

### User Story 2 — Draft audition and Apply (Priority: P1)

**Why this priority**: Core fix for non-destructive testing.

**Independent test**: Turn Live off, change `vol_env`, preview with Trigger/keyboard, confirm source unchanged; Apply updates the line once.

**Acceptance scenarios**:

1. **Given** Live edit is off, **When** the user edits fields/macros, **Then** the panel draft updates and source does not change.
2. **Given** a dirty draft, **When** the user auditions (keyboard, Trigger, MIDI), **Then** playback uses the draft props (same as if applied).
3. **Given** a dirty valid draft, **When** Apply is pressed, **Then** one undoable `inst` rewrite occurs and dirty clears.
4. **Given** a dirty draft, **When** Revert is pressed, **Then** the draft reloads from the current source/`inst` AST and dirty clears.
5. **Given** Live is off and the draft is clean, **Then** Apply and Revert are disabled (or no-ops).

### User Story 3 — Dirty navigation (Priority: P1)

**Why this priority**: Prevents silent loss of draft work.

**Independent test**: Dirty draft, select another instrument → dialog with Apply / Discard / Cancel.

**Acceptance scenarios**:

1. **Given** a dirty draft, **When** the user selects another instrument, creates New/Duplicate, Deletes, Renames, or copies imported, **Then** a prompt offers Apply, Discard, or Cancel.
2. **Given** Cancel, **Then** selection and draft stay as they were.
3. **Given** Discard, **Then** the pending navigation proceeds without writing the discarded draft.
4. **Given** Apply and the draft is valid, **Then** source is written then navigation proceeds; if invalid, stay and show errors.

### User Story 4 — Preference persistence (Priority: P2)

**Independent test**: Turn Live off, reload Desktop; Live remains off.

**Acceptance scenarios**:

1. **Given** the user toggles Live edit, **When** the app restarts, **Then** the last Live edit preference is restored (default true when unset).

### User Story 5 — Instrument writes do not start transport Live (Priority: P1)

**Why this priority**: Transport Live and Instrument Editor Live edit are different controls. An `inst` write must not start the song.

**Independent test**: With transport Live on and playback stopped, change a field while panel Live edit is on. After the transport debounce the song is still stopped. A pattern edit in the code editor still starts playback.

**Acceptance scenarios**:

1. **Given** transport Live is on and playback is stopped, **When** the Instrument Editor writes source (Live edit, Apply, or New / Rename / Delete / Duplicate / preset), **Then** parse and diagnostics run and playback does not start.
2. **Given** transport Live is on, **When** the user edits the song in the code editor, **Then** transport Live still arms playback.
3. **Given** transport Live is on, **When** an Instrument Editor write occurs, **Then** the Live control stays in the state the user set.

### Edge cases

- Imported read-only instruments: no writeback (as today); Live/Apply do not enable writing imported lines.
- Enabling Live while dirty: if draft is valid, Apply then enable Live; if invalid, keep Live off and show errors.
- External source change (`parse:success`) while Live off and dirty: do not clobber the draft.
- Structural ops (New / Delete / Rename / Duplicate) still write source when confirmed; they are not draft-only tweaks. Those writes follow User Story 5: they do not arm transport Live.
- A Monaco edit that already armed transport Live is left alone if an Instrument Editor write arrives before that timer fires.

## Requirements

### Functional requirements

- **FR-001**: The Instrument Editor MUST provide a Live edit control defaulting to on.
- **FR-002**: When Live is off, valid field/macro edits MUST update panel draft only until Apply.
- **FR-003**: Audition MUST use draft instrument props when the draft differs from source (via preview patch or equivalent).
- **FR-004**: Apply MUST validate then rewrite the selected local `inst` line once; Revert MUST reload draft from source AST.
- **FR-005**: Dirty navigation MUST offer Apply / Discard / Cancel before leaving the current draft.
- **FR-006**: Live edit preference MUST persist across sessions (default on).
- **FR-007**: Write-valid-only remains: invalid drafts never write source.
- **FR-008**: Instrument Editor buffer writes MUST NOT arm transport Live playback. Parse and diagnostics MUST still run. The transport Live toggle MUST stay as the user left it. Code-editor edits MUST still arm transport Live when it is on.

### Non-goals

- Multi-instrument batch Apply
- Visual diff of draft vs source
- Auto-Apply on blur or timer
- Language / AST syntax changes

## Success criteria

- **SC-001**: With Live off, field edits do not change the editor buffer until Apply.
- **SC-002**: Draft audition matches applied sound for the same props.
- **SC-003**: Dirty switch does not lose work without an explicit Discard or Apply.
- **SC-004**: Unit tests cover dirty detection, preview patch stripping, and live-off no-write helpers.

## Assumptions

- Preference storage uses the existing Desktop local-storage keys pattern.
- Monaco undo continues to cover Apply (and Live-on) writebacks.

## Open questions

None.

## References

- [021 instrument-editor-panel](../../complete/021-instrument-editor-panel/spec.md)
- Issue: https://github.com/kadraman/beatbax/issues/230
