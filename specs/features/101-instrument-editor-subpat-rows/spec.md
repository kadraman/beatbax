---
title: "Instrument editor Game Boy subpat row editor"
id: 101
slug: "instrument-editor-subpat-rows"
status: "planned"
authors:
  - "kadraman"
created: "2026-10-23"
updated: "2026-10-23"
issue: "https://github.com/kadraman/beatbax/issues/233"
area: "desktop"
related:
  - "specs/complete/021-instrument-editor-panel/spec.md"
  - "specs/complete/082-gameboy-uge-instrument-subpatterns/spec.md"
  - "specs/features/099-instrument-editor-live-edit/spec.md"
---

# Feature Specification: Instrument editor Game Boy subpat row editor

## Summary

The Desktop Instrument Editor gains a **single-column** Game Boy `subpat` row editor for **local** instruments: Add/Remove editable text cells per row, plus **Create**, **Attach**, and **Detach**. No language changes — native `subpat` syntax and tick lowering stay as in [082](../../complete/082-gameboy-uge-instrument-subpatterns/spec.md). Live edit / Apply from [099](../099-instrument-editor-live-edit/spec.md) apply to both the `inst` line and the `subpat` block.

## Problem

The panel shows a Game Boy instrument’s `subpat=` name and can jump to the definition ([021](../../complete/021-instrument-editor-panel/spec.md) v1), but authors cannot create, attach, detach, or edit `subpat` tables from the panel. They must hand-edit `.bax` source even though the Instrument Editor is the primary instrument UX. Spec 021 deferred a tracker-style editor to Phase 2; this feature ships the simpler single-column lifecycle instead.

## User scenarios

### User Story 1 — Edit attached subpat rows (Priority: P1)

**Why this priority**: Core authoring gap once a table is linked.

**Independent test**: Open a local GB instrument with `subpat=`; change a row cell; with Live on, the `subpat` block in source updates; preview still matches 082 lowering.

**Acceptance scenarios**:

1. **Given** a local Game Boy instrument with `subpat=` resolved to rows, **When** the Instrument Editor shows the instrument, **Then** a single-column row list appears (row index + editable text cell + remove), and the existing go-to-source control remains available.
2. **Given** Live edit is on and a row cell is edited to valid SubPatRow text (e.g. `+0 vol:15`, `.`, `halt`, `jump:5`), **When** the edit commits, **Then** the named `subpat` block in source is rewritten and the draft stays valid.
3. **Given** a row cell with invalid text, **When** the user finishes the edit, **Then** source is not written, a panel error is shown (write-valid-only), and other valid rows are unchanged in source until the invalid cell is fixed.
4. **Given** the row list, **When** the user Adds a row, **Then** a new row appears (default text `.`) and writeback follows Live / Apply rules.
5. **Given** the row list with more than one row, **When** the user Removes a row, **Then** that row is dropped from the draft / `subpat` block (writeback per Live / Apply).
6. **Given** Live edit is off, **When** the user edits rows, **Then** the panel draft updates and source does not change until Apply; Revert reloads rows from the current AST / source.

### User Story 2 — Create a new subpat (Priority: P1)

**Why this priority**: Authors should not leave the panel to start a native program.

**Independent test**: Local GB instrument with no `subpat=`; Create; source gains a `subpat` block and `subpat=` on the `inst` line; macros lock.

**Acceptance scenarios**:

1. **Given** a local Game Boy instrument without `subpat=`, **When** the user chooses Create, **Then** a new uniquely named `subpat <name> =` block is inserted (starter rows: at least one usable cell such as `.` and/or `halt`), and the selected `inst` line gains `subpat=<name>`.
2. **Given** Create succeeds, **When** the panel refreshes from parse, **Then** the row editor is shown, macros remain locked with the existing “Software macros are locked while subpat is set.” behaviour, and go-to-source targets the new `subpat` definition.
3. **Given** existing `subpatterns` names in the song, **When** Create chooses a name, **Then** the name does not collide with an existing `subpat` (same uniqueness expectation as the parser’s `subpatterns` map).

### User Story 3 — Attach an existing subpat (Priority: P1)

**Why this priority**: Reuse shared tables without copying.

**Independent test**: Song has `subpat body = …`; local inst without `subpat=`; Attach `body`; `inst` line gains `subpat=body`; row editor shows `body`’s rows.

**Acceptance scenarios**:

1. **Given** one or more song-local `subpat` definitions, **When** the user chooses Attach and picks a name, **Then** the selected local `inst` line gains `subpat=<name>` (writeback of the `inst` line) and the row editor loads that table’s rows.
2. **Given** Attach, **When** no song-local `subpat` names exist, **Then** Attach is unavailable or empty (Create remains available).

### User Story 4 — Detach subpat (Priority: P1)

**Why this priority**: Return to macro editing without destroying shared tables.

**Independent test**: Inst with `subpat=body`; Detach; `subpat=` cleared; macros unlock; `subpat body =` block remains in source.

**Acceptance scenarios**:

1. **Given** a local instrument with `subpat=` set, **When** the user chooses Detach, **Then** `subpat=` is removed from the `inst` line and macros unlock for editing.
2. **Given** Detach, **When** source is inspected, **Then** the `subpat` definition block is **not** deleted (other instruments or later Attach may still need it).
3. **Given** Detach with Live off and a dirty draft, **When** Detach is confirmed through the same dirty-navigation / Apply rules as other structural panel ops in 099, **Then** behaviour stays consistent with 099 (no silent loss).

### User Story 5 — Shared tables (Priority: P2)

**Why this priority**: Prevents surprise when several insts share one name.

**Independent test**: Two local insts with `subpat=kick`; edit a row on one; both resolve to the updated table; panel shows a shared-use note.

**Acceptance scenarios**:

1. **Given** two or more local instruments with the same `subpat=` name, **When** the user edits rows on one, **Then** the named `subpat` definition is rewritten (no copy-on-write in v1).
2. **Given** other local instruments reference the same name, **When** the row editor is visible, **Then** a non-blocking note indicates that N other instruments also use this table.

### Edge cases

- Imported (read-only) instruments: no Create / Attach / Detach / row editing; keep current read-only name + reveal if applicable.
- Non–Game Boy chips: no `subpat` row editor (field absent or unchanged).
- `subpat=` name missing from this file (unresolved / import-pending): do not offer a writable empty table; keep reveal / error behaviour consistent with today’s diagnostics.
- Empty row list after removing all rows: panel MUST not leave a zero-row `subpat` that the parser rejects; either keep at least one row (e.g. `.`) or treat empty as invalid and refuse writeback until valid.
- Jump targets (`jump:N`) are 1-based row indices as in 082 / grammar; the panel does not need to validate jump targets beyond parse success in v1 (invalid/out-of-range targets remain a language/runtime concern as today).

## Requirements

### Functional requirements

- **FR-001**: For local Game Boy instruments with a resolved `subpat`, the Instrument Editor MUST show a single-column editable row list with Add and Remove.
- **FR-002**: Row cell text MUST round-trip through the existing SubPatRow grammar atoms (`.`, signed offset, `vol:`, `jump:`, `halt`, `timbre:`, `fx:`).
- **FR-003**: Invalid row text MUST NOT write source (write-valid-only), matching 021 / 099.
- **FR-004**: The panel MUST support Create (new unique `subpat` block + `subpat=` on inst), Attach (set `subpat=` to an existing song-local name), and Detach (clear `subpat=` without deleting the block).
- **FR-005**: Live edit on MUST rewrite the `subpat` block (and `inst` line when props change) when valid; Live off MUST draft until Apply / Revert per 099.
- **FR-006**: Editing rows MUST rewrite the named `subpat` definition; when other local instruments share the name, the panel MUST show a non-blocking shared-use note (no copy-on-write).
- **FR-007**: Go-to-source for the `subpat` definition MUST continue to reveal and highlight the `subpat` line (not the `inst` line), as in 021.
- **FR-008**: Preview and UGE export MUST continue to use 082 lowering (`subpat` wins over macros); this feature MUST NOT change tick IR semantics.
- **FR-009**: No new `.bax` language syntax or grammar atoms.

### Non-goals

- Multi-column hUGE-style tracker columns (offset | vol | jump | halt | timbre | fx) — remains a future enhancement after this ship.
- Convert macros → native `subpat` (one-shot).
- In-place editing of `.ins` libraries.
- Web-lite Instrument Editor.
- Copy-on-write when detaching or editing a shared table.
- Deleting orphaned `subpat` blocks from the panel.

## Success criteria

- **SC-001**: Local GB instrument can Create → edit rows → Attach/Detach round-trip without leaving the Instrument Editor.
- **SC-002**: After row edits, preview and UGE instrument subpatterns still match 082 behaviour for the same source.
- **SC-003**: Macros unlock after Detach; lock again when Create/Attach sets `subpat=`.
- **SC-004**: Unit tests cover writeback helpers (create / attach / detach / replace block / invalid row) and row text parse/format round-trip.
- **SC-005**: Manual QA on `songs/gameboy/instruments/gb_subpattern_macro_demo.bax` (or equivalent) passes Create/edit/Detach without parser errors.

## Assumptions

- Spec 099 Live edit / Apply is available (or lands) for Instrument Editor writeback; this feature wires `subpat` body writes through the same gate.
- `formatSubPatternRow` / `formatSubPatternSource` in app-core remain the canonical formatters; a parse inverse is added as needed.
- Unique Create names may derive from the instrument name (with suffix if needed) or a generic `subpat_N` scheme — implementation chooses either so long as FR-004 uniqueness holds.

## Open questions

None (UI shape and lifecycle locked: single-column text rows; Create / Attach / Detach).

## References

- Issue: https://github.com/kadraman/beatbax/issues/233
- [021 instrument-editor-panel](../../complete/021-instrument-editor-panel/spec.md) (v1 read-only `subpat`; Phase 2 tracker note)
- [082 gameboy-uge-instrument-subpatterns](../../complete/082-gameboy-uge-instrument-subpatterns/spec.md)
- [099 instrument-editor-live-edit](../099-instrument-editor-live-edit/spec.md)
- [docs/grammar/instruments.md](../../../docs/grammar/instruments.md) (§ Instrument programs)
- [hUGETracker Subpatterns](https://superdisk.github.io/hUGETracker/hUGETracker/subpatterns.html)
