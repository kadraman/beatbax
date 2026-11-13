---
title: "Instrument Editor workspace (modal, subpat rows, DMC Browse/Check)"
id: 103
slug: "instrument-editor-workspace"
status: "specified"
authors:
  - "kadraman"
created: "2026-11-01"
updated: "2026-11-01"
issue: "https://github.com/kadraman/beatbax/issues/236"
area: "desktop"
related:
  - "specs/complete/021-instrument-editor-panel/spec.md"
  - "specs/complete/057-settings-panel/spec.md"
  - "specs/complete/082-gameboy-uge-instrument-subpatterns/spec.md"
  - "specs/complete/019-desktop-dmc-main-process-ipc/spec.md"
  - "specs/complete/093-desktop-remote-imports-ipc/spec.md"
  - "specs/complete/098-instrument-editor-preview-pitch/spec.md"
  - "specs/complete/099-instrument-editor-live-edit/spec.md"
  - "https://github.com/kadraman/beatbax/issues/233"
  - "https://github.com/kadraman/beatbax/issues/234"
---

# Feature Specification: Instrument Editor workspace

## Summary

The Desktop Instrument Editor leaves the right-pane **Instruments** tab and becomes a **Settings-style modal** with left section navigation, so waveform, macros, and future chip pages have room without shrinking the `.bax` editor. A **toolbar icon** opens the editor while coding. Instrument choice stays in the modal. The same workspace absorbs the unfinished Game Boy **`subpat` row editor** ([#233](https://github.com/kadraman/beatbax/issues/233)) and NES DMC **Browse… / Check** ([#234](https://github.com/kadraman/beatbax/issues/234)). Plugins still supply `ChipInstrumentEditor` data only. No new `.bax` syntax. Shipped preview pitch ([098](../../complete/098-instrument-editor-preview-pitch/spec.md)) and Live edit / Apply ([099](../../complete/099-instrument-editor-live-edit/spec.md)) remain as specified.

This feature **supersedes** planned folders 101 (`instrument-editor-subpat-rows`) and 102 (`instrument-editor-sample-browse-verify`); those ids are not recreated.

## Problem

1. The Instrument Editor is a right-pane tab that stacks every section in one narrow scrolling column ([021](../../complete/021-instrument-editor-panel/spec.md)). Authors scroll heavily; FM / SID / SNES schemas will need more room. Settings already uses a modal with section nav ([057](../../complete/057-settings-panel/spec.md)).
2. Opening the tab steals width from the code editor. Authors need a compact way to pick an instrument and jump to its `inst` line without opening the full editor.
3. Game Boy `subpat=` is still read-only in the panel (021 Phase 2 deferred); authors must hand-edit native programs even though language/runtime shipped in [082](../../complete/082-gameboy-uge-instrument-subpatterns/spec.md).
4. NES `dmc_sample` has no filesystem Browse and no in-panel load Check; missing files and blocked hosts only appear at preload/playback.

## User scenarios

### User Story 1 — Modal Instrument Editor (Priority: P1)

**Why this priority**: Layout change that unblocks denser chip UIs and removes right-pane scrolling friction.

**Independent test**: With the Instrument Editor feature flag on, open the editor from View / shortcut / CodeLens; confirm a Settings-like modal (backdrop, left nav, one content pane) and that the Instruments right-pane tab is gone.

**Acceptance scenarios**:

1. **Given** `feature.instrumentEditor` and `advancedEditor`, **When** the user opens the Instrument Editor (View → Instrument Editor, Ctrl/Cmd+Alt+I, CodeLens **Edit**, or the toolbar **Instruments** button), **Then** a viewport modal opens over the workspace (dimmed backdrop; Escape and backdrop click close; no focus trap required, matching Desktop Settings).
2. **Given** the modal is open, **When** the user inspects chrome, **Then** a header always shows the instrument select, Name, Type, and New / Duplicate / Rename / Delete / Show in editor / Live / Apply / Revert; a left nav lists applicable sections; one content pane scrolls; Preview stays docked at the bottom of the modal on every section.
3. **Given** schema + `whenType`, **When** a section has no applicable content, **Then** that nav item is omitted. Built-in section ids: Properties, Hardware, Waveform, Macros, Subpattern (US4). Preview is not a nav item. Templates are not a nav item: **New** shows plugin presets and copy-from only until an instrument is created.
4. **Given** optional `nav` on a field or macro def, **When** that id is present, **Then** the host adds a nav page of the same generic widgets for that id (for later FM/SID pages). Unset `nav` keeps today’s Voice/Defaults / Hardware / Macros grouping.
5. **Given** **Show in editor**, **When** activated, **Then** the modal closes and Monaco focuses the selected `inst` (or `subpat`) line as today.
6. **Given** Live off and a dirty draft, **When** the user closes the modal, **Then** Apply / Discard / Cancel is offered before dismiss (same rules as 099 instrument switch).
7. **Given** the Instruments right-pane tab, **When** this feature ships, **Then** the tab is removed; `panel.instrument-editor` is no longer a side-pane visibility toggle; a stored `ui.activeRightTab` of `instruments` falls back to the first remaining tab.
8. **Given** Settings → Features, **When** the Instrument Editor flag description is shown, **Then** it no longer says the editor lives “in the right pane.”
9. **Given** preview keys (A–J / Z/X) and MIDI audition for the editor, **When** the modal is open and focus is not in a typing field, **Then** they work; when the modal is closed, they do not (gate on open modal, not `.bb-right-tab-content--active`).
10. **Given** dialog size, **When** the modal opens, **Then** it is larger than Settings so waveform and macro graphs fit (e.g. about `min(1040px, 94vw)` × `min(760px, 88vh)`).
11. **Given** app restart, **When** the feature flag is on, **Then** the modal does **not** reopen automatically (toolbar / menus / CodeLens open it on demand). Song playback continues under the backdrop.

### User Story 2 — Toolbar icon (Priority: P1)

**Why this priority**: The editor has to be reachable while coding, without a second instrument list on the toolbar.

**Independent test**: Toolbar shows one Instrument Editor icon and no instrument dropdown. The icon opens the modal. Ctrl/Cmd+Alt+I does the same while the caret is in the `.bax` editor and does not insert a character.

**Acceptance scenarios**:

1. **Given** the feature flag and `advancedEditor`, **When** the main toolbar is visible, **Then** one labeled **Instruments** button appears with Verify, before the status message. Theme and Settings stay in the right-hand group. There is no toolbar instrument `<select>`.
2. **Given** that icon, **When** clicked, **Then** the modal opens on the current instrument (or empty, ready for New) with focus on the modal.
3. **Given** the caret is in the `.bax` editor, **When** the user presses Ctrl/Cmd+Alt+I, **Then** the modal toggles and the key does not insert a character. On Windows, Ctrl+Alt is AltGr, so the editor must swallow that chord.
4. **Given** the toolbar is hidden, **When** the user still needs the editor, **Then** View → Instrument Editor, Ctrl/Cmd+Alt+I, and CodeLens **Edit** remain available. In View, Instrument Editor is grouped with Command Palette, above the window panels. Ctrl/Cmd+Alt+I from the `.bax` editor uses the physical I key so Windows AltGr does not insert a character.
5. **Given** the modal’s own instrument select, **When** the user changes instruments while the modal is open, **Then** behaviour matches 021 (reveal without focusing Monaco; dirty prompt when Live off).

### User Story 3 — Preserve 021 / 098 / 099 behaviour (Priority: P1)

**Why this priority**: Layout must not regress writeback, preview, or Live edit.

**Independent test**: Live on/off, write-valid-only, imported copy-into-song, preview modes, CodeLens Edit still open the workspace.

**Acceptance scenarios**:

1. **Given** a local instrument, **When** fields/macros change with Live on, **Then** write-valid-only undoable `inst` replace still applies (021 / 099).
2. **Given** Live off, **When** the user edits, **Then** draft audition + Apply / Revert + dirty navigation still match 099, including before modal close.
3. **Given** imported instruments, **When** selected, **Then** they stay read-only with Copy into song.
4. **Given** preview modes from 098 (`melodic` / `oneshot` / `uge_note`, `tone_mix` oneshot), **When** the modal is open, **Then** the same controls stay in the bottom Preview dock on every section.
5. **Given** Monaco cursor motion, **When** the caret moves in the editor, **Then** Instrument Editor selection does not change (021).

### User Story 4 — Game Boy subpat row editor (Priority: P1)

**Why this priority**: Primary remaining GB instrument UX gap (from #233 / former 101).

**Independent test**: Local GB instrument: Create → edit rows → Detach; source and macros lock/unlock; preview/UGE still match 082.

**Acceptance scenarios**:

1. **Given** a local Game Boy instrument with resolved `subpat=`, **When** the Subpattern section is shown, **Then** a single-column row list appears (row index + editable text cell + remove), plus Add; go-to-source for the `subpat` definition remains available.
2. **Given** Live on and a row edited to valid SubPatRow text (e.g. `+0 vol:15`, `.`, `halt`, `jump:5`), **When** the edit commits, **Then** the named `subpat` block is rewritten.
3. **Given** invalid row text, **When** the edit finishes, **Then** source is not written and a panel error is shown (write-valid-only).
4. **Given** Create on a local GB instrument without `subpat=`, **When** chosen, **Then** a uniquely named `subpat` block is inserted, the `inst` line gains `subpat=<name>`, macros lock, and the row editor appears.
5. **Given** Create on a local GB instrument that already has `subpat=`, **When** chosen, **Then** a new uniquely named `subpat` block is inserted, this instrument's `subpat=` points at that new block, and the previous block stays in the song.
6. **Given** Attach, **When** the user picks an existing song-local `subpat` name, **Then** `subpat=` is set and rows load from that table. Attach stays available while one is already attached and lists the other names. If no other names exist, Attach is unavailable or empty.
7. **Given** Detach, **When** chosen, **Then** `subpat=` is cleared from the `inst` line, macros unlock, and the `subpat` block is **not** deleted.
8. **Given** other local instruments share the same `subpat=` name, **When** the row editor is visible, **Then** a non-blocking note indicates shared use; edits rewrite the shared definition (no copy-on-write).
9. **Given** Live off, **When** rows or Create/Attach/Detach change the draft, **Then** 099 Apply / Revert / dirty rules apply to both the `inst` line and the `subpat` block.
10. **Given** imported or non–Game Boy instruments, **When** selected, **Then** there is no writable row editor (imported may keep read-only name + reveal if applicable).

### User Story 5 — DMC sample Browse + Check (Priority: P1)

**Why this priority**: Primary NES custom-kit authoring friction (from #234 / former 102).

**Independent test**: Saved NES song; Local Browse → relative `local:`; Check OK/fail without full-song play.

**Acceptance scenarios**:

1. **Given** scheme Local on a writable sample field (NES `dmc_sample`), **When** the Properties section shows the field, **Then** **Browse…** is available (disabled for imported read-only).
2. **Given** Browse…, **When** the user picks a `.dmc` that can be expressed as a relative path under the song directory without `..`, **Then** the field commits a relative `local:` remainder via existing format helpers.
3. **Given** unsaved song or a path that cannot be relativized safely, **When** Browse completes, **Then** the field is unchanged and the panel shows a clear error.
4. **Given** a non-empty sample ref (Local / HTTPS / GitHub / Bundled), **When** **Check** runs, **Then** resolution uses existing Desktop IPC + engine paths (`resolveSampleAsset` / `fetchRemoteAsset` as appropriate)—not renderer `fetch`. Success shows byte length; blocked hosts include Settings → Advanced allowlist remediation.
5. **Given** unknown `@nes/<name>` not in `plugin.bundledSamples`, **When** validating or Checking, **Then** soft validation / Check fails.
6. **Given** Live on/off, **When** Browse updates the sample, **Then** writeback matches other fields (099).
7. **Given** NES hover / wizard / docs kit lists, **When** this ships, **Then** listed bundled names match `BUNDLED_SAMPLES` keys.
8. **Given** CSP / allowlist / size / timeout from 019/093, **When** Check runs, **Then** those policies are unchanged. No new schemes or language syntax.

### Edge cases

- Empty instrument list: the modal select shows “No instruments”; structural New remains available once the modal is open (or New from an empty modal). The toolbar icon still opens the modal.
- Unresolved / missing `subpat=` name: no writable empty table; keep today’s diagnostics / reveal behaviour.
- Empty subpat row list after removals: do not leave a zero-row `subpat` the parser rejects; keep at least one valid row or refuse writeback.
- Rename / dirty dialogs: center on the modal (not the old panel rect).
- Non-NES chips later using `widget: 'sample'`: Browse/Check SHOULD work when Desktop can resolve the same way; NES DMC is the shipping target.
- Web-lite Instrument Editor: out of scope.

## Requirements

### Functional requirements

- **FR-001**: Desktop MUST present the Instrument Editor as a Settings-style modal (backdrop, header, left section nav, one content pane, Close) when opened via View → Instrument Editor, the shortcut, CodeLens Edit, or the toolbar icon.
- **FR-002**: The Instruments right-pane tab MUST be removed; panel restore MUST NOT reopen a right-tab Instruments surface.
- **FR-003**: The main toolbar MUST offer one labeled Instruments button next to Verify when the feature flag and `advancedEditor` are on, and MUST NOT offer an instrument `<select>`. The button MUST open the modal. Theme and Settings stay in the right-hand group.
- **FR-004**: Ctrl/Cmd+Alt+I MUST toggle the modal while the `.bax` editor has focus and MUST NOT insert a character. Instrument choice stays on the modal’s own select.
- **FR-005**: Section nav MUST omit inapplicable sections; MUST support built-in sections Properties, Hardware, Waveform, Macros, Subpattern; MUST honour optional schema `nav` ids for additional generic pages. Preview MUST NOT be a nav item. Templates MUST NOT be a nav item; **New** MUST offer plugin presets and copy-from only while creating an instrument.
- **FR-006**: Live edit / Apply / Revert / dirty navigation from 099 MUST continue to apply, including before modal close.
- **FR-007**: Preview pitch modes and CodeLens alignment from 098 MUST continue to apply in a Preview dock fixed to the bottom of the modal, visible on every section.
- **FR-008**: Preview keys and MIDI audition MUST gate on the open modal (not right-pane tab active).
- **FR-009**: For local Game Boy instruments, the Subpattern section MUST provide single-column row edit plus Create / Attach / Detach as in US4; no new language atoms; 082 lowering unchanged.
- **FR-010**: The sample widget MUST provide Local **Browse…** (relative `local:` only) and **Check** for Bundled/Local/HTTPS/GitHub via existing IPC; unknown bundled names MUST fail validation; docs/hover kit lists MUST match the real kit.
- **FR-011**: No new `.bax` syntax, no plugin-shipped React, no Web-lite Instrument Editor in this feature.
- **FR-012**: Feature flag `INSTRUMENT_EDITOR` remains Experimental and default off.

### Non-goals

- Multi-column hUGE-style `subpat` tracker UI.
- Convert macros → native `subpat`.
- In-place editing of `.ins` libraries.
- In-panel WAV→DMC conversion.
- GitHub sample branch picker; sample-cache redesign; SNES BRR bank browser.
- Changing remote allowlist defaults or CSP.
- FM / SID / SNES instrument parameters (only the optional `nav` hook for later schemas).
- Movable modeless window (modal like Settings is required).
- Closing or re-implementing 098 / 099 behaviour beyond re-hosting in the modal.

## Success criteria

- **SC-001**: Authors open a full Instrument Editor modal without a right-pane Instruments tab; code editor stays full width until the toolbar button, View menu, CodeLens, or shortcut opens it.
- **SC-002**: The toolbar icon opens the modal. Ctrl/Cmd+Alt+I toggles it from the `.bax` editor without inserting a character.
- **SC-003**: Local GB Create / row edit / Attach / Detach round-trip without leaving the Instrument Editor; macros lock/unlock correctly; preview/UGE still match 082.
- **SC-004**: Authors Browse a `.dmc` beside a saved song to a validating relative `local:` ref; Check reports OK or failure (including allowlist remediation) without full-song play.
- **SC-005**: Unit tests cover nav visibility, subpat writeback helpers, sample relative-path Browse outcomes, and preview-key modal gating; manual QA on GB subpat and NES DMC demo songs passes.

## Assumptions

- Desktop Settings modal ([`DesktopSettingsModal.tsx`](../../../apps/desktop/src/renderer/src/components/panels/DesktopSettingsModal.tsx)) is the chrome reference.
- 098 and 099 remain complete and cited; Live / preview code already on `main`.
- `formatSubPatternRow` / `formatSubPatternSource` and sample format helpers in app-core remain the composition APIs.
- Issues [#233](https://github.com/kadraman/beatbax/issues/233) and [#234](https://github.com/kadraman/beatbax/issues/234) stay open as related until this feature ships; features 101/102 are not recreated.

## Open questions

None blocking (modal + toolbar + absorbed 101/102 scope locked).

## References

- Issue: https://github.com/kadraman/beatbax/issues/236
- Related: [#233](https://github.com/kadraman/beatbax/issues/233), [#234](https://github.com/kadraman/beatbax/issues/234)
- [021 instrument-editor-panel](../../complete/021-instrument-editor-panel/spec.md)
- [057 settings-panel](../../complete/057-settings-panel/spec.md)
- [082 gameboy-uge-instrument-subpatterns](../../complete/082-gameboy-uge-instrument-subpatterns/spec.md)
- [019 desktop-dmc-main-process-ipc](../../complete/019-desktop-dmc-main-process-ipc/spec.md)
- [093 desktop-remote-imports-ipc](../../complete/093-desktop-remote-imports-ipc/spec.md)
- [098 instrument-editor-preview-pitch](../../complete/098-instrument-editor-preview-pitch/spec.md)
- [099 instrument-editor-live-edit](../../complete/099-instrument-editor-live-edit/spec.md)
- [docs/grammar/instruments.md](../../../docs/grammar/instruments.md)
