---
title: "Tracker pattern and sequence editor"
id: 105
slug: "tracker-pattern-editor"
status: "planned"
authors:
  - "kadraman"
created: "2026-11-05"
updated: "2026-11-05"
issue: "https://github.com/kadraman/beatbax/issues/239"
area: "desktop"
related:
  - "specs/global/language.md"
  - "specs/complete/014-pattern-grid-seek-and-loop/spec.md"
  - "specs/complete/100-pattern-grid-zoom/spec.md"
  - "specs/complete/008-song-composition-abstractions/spec.md"
  - "specs/complete/065-web-midi-step-entry/spec.md"
  - "specs/features/015-song-timing-pattern-grid-inspector/spec.md"
  - "specs/features/103-instrument-editor-workspace/spec.md"
  - "https://github.com/kadraman/beatbax/issues/240"
  - "https://github.com/kadraman/beatbax/issues/241"
  - "https://github.com/kadraman/beatbax/issues/242"
  - "https://github.com/kadraman/beatbax/issues/243"
---

# Feature Specification: Tracker pattern and sequence editor

## Summary

Desktop gains a **tracker** that edits one `pat` definition as steps (note, rest, sustain, hit, effect) and **arrangement grips** on the existing Pattern Grid that reorder classic `seq` / `channel` pattern references. Both surfaces keep the `.bax` text as the source of truth and write through Monaco’s undo stack. Compact repeats stay visible until the first mutating edit of that statement, which expands the RHS to a flat token list after confirmation. No new language syntax. Web-lite UI is out of scope; shared edit logic is specified for `app-core` so a later client can reuse it.

## Problem

1. Authors can only enter and change pattern notes by typing BeatBax text in Monaco.
2. The Pattern Grid ([014](../../complete/014-pattern-grid-seek-and-loop/spec.md), [100](../../complete/100-pattern-grid-zoom/spec.md)) visualizes arrangement blocks and supports seek/loop and click-to-navigate, but does not edit structure or notes.
3. A tracker-style grid must round-trip with the existing channel-agnostic pattern language ([language.md](../../global/language.md)). Repeats, groups, and sequence transforms do not map 1:1 onto cells; the product needs an explicit flatten-on-edit policy instead of silent lossy rewrites or a parallel song model.

## User scenarios

### User Story 1 — Tracker edits one pattern (Priority: P1)

**Why this priority**: Note entry is the core ask; arrangement editing builds on the same writeback model.

**Independent test**: Open a song with a flat `pat melody = C4 D4 E4 .`, select that pattern, change one step in the tracker, confirm Monaco shows the new token and Undo restores the previous text.

**Acceptance scenarios**:

1. **Given** a parseable song and a selected `pat` without declaration modifiers, **When** the tracker is shown, **Then** each step is one sixteenth (duration-1 token or expanded sustain) and cells show note, rest (`.`), sustain (`_`), hit tokens, and effect suffixes already legal on that atom.
2. **Given** an `inst name` or `inst(name,N)` in the pattern, **When** the tracker renders, **Then** those appear as row markers that do not consume a step.
3. **Given** a focused tracker cell, **When** the user sets a note, rest, sustain, hit, or effect via keyboard (tracker focused only) or the visible note palette, **Then** the `pat` statement in the editor buffer is rewritten as one Monaco undo step and a subsequent successful parse refreshes the tracker.
4. **Given** a pattern declared with a name modifier (`pat bass:oct(-1) = …`), **When** the tracker opens it, **Then** the surface is read-only and points the author to Monaco so the declaration modifier is not dropped.
5. **Given** pitches that would only appear after a `seq` transform (`:oct`, `:rev`, …), **When** the tracker shows a pattern, **Then** it shows the pattern definition tokens, not the transformed pitches.
6. **Given** invalid song text after a Monaco edit, **When** parse fails, **Then** the tracker keeps the last good model, existing diagnostics remain visible, and the UI does not invent a fallback song.

### User Story 2 — Flatten compact patterns on first edit (Priority: P1)

**Why this priority**: Without an explicit policy, visual edits would silently destroy repeats and in-RHS comments.

**Independent test**: Open `pat hook = (C4 E4)*2`, edit one cell, confirm a prompt; accept and see `C4 E4 C4 E4` (or equivalent flat form); cancel and see source unchanged.

**Acceptance scenarios**:

1. **Given** a `pat` RHS that contains `*`, parentheses, or a quoted token list, **When** the tracker displays it, **Then** steps show the expanded timeline and the file is not rewritten by viewing alone.
2. **Given** such a pattern, **When** the user makes the first mutating edit, **Then** a confirmation explains that repeats/quotes expand and comments inside that pattern RHS are dropped; Cancel leaves source unchanged.
3. **Given** confirmation accepted, **When** the rewrite applies, **Then** the whole `pat` statement body becomes the current flat steps; durations stay as `:N` unless the user edited inside that span; comments outside the statement, other statements, and `pat name =` vs shorthand `name =` are preserved.
4. **Given** an already-flat `pat`, **When** a cell is edited, **Then** no flatten confirmation is required; the statement span is patched as one undo step.

### User Story 3 — Arrangement grips rewrite classic seq/channel (Priority: P1)

**Why this priority**: Completes the chosen scope (tracker plus visual sequence editing) without replacing seek/loop.

**Independent test**: On a song with `seq lead = a b c` used by one channel, move block `b` before `a` via grip or Move controls; confirm the `seq` line updates and Undo restores it; seek/loop still work on the ruler.

**Acceptance scenarios**:

1. **Given** the Pattern Grid, **When** the user clicks a pattern block (not a grip), **Then** selection and Monaco jump-to-`pat` behave as today ([014](../../complete/014-pattern-grid-seek-and-loop/spec.md)).
2. **Given** a block that comes from a classic `seq name = …` item, **When** the user reorders, duplicates, or deletes via grip or Move / Duplicate / Delete controls, **Then** that `seq` statement is rewritten and item modifiers (`bass_pat:oct(-1)`) are kept on the item.
3. **Given** a block that is a top-level `seq` / `pat` token on `channel N => …`, **When** arrangement mutates that reference, **Then** the channel clause is rewritten while `inst`, `speed`, and `lock` stay.
4. **Given** `pat*4` or `(a b)*2` on a classic `seq` RHS, **When** displayed, **Then** blocks show the expanded list; the first reorder or repeat-count edit confirms flatten and rewrites an explicit list (`a a a a` or `a b a b`).
5. **Given** several channels that share one `seq` definition, **When** the user mutates that sequence, **Then** the definition changes for all consumers and the UI states that shared impact.
6. **Given** blocks driven by `cat()`, `alias`, `section`, `form`, or `channel auto`, **When** shown, **Then** they are read-only in the visual surface and point at the text ([008](../../complete/008-song-composition-abstractions/spec.md)).
7. **Given** the timeline ruler, **When** the user seeks or sets a loop without using a grip, **Then** behaviour matches [014](../../complete/014-pattern-grid-seek-and-loop/spec.md).

### User Story 4 — Bidirectional sync and undo (Priority: P1)

**Why this priority**: The product promise is visual ↔ text without a second song model.

**Independent test**: Edit a cell, Undo in Monaco, confirm the tracker reverts; type a note in Monaco for that `pat`, confirm the tracker updates after parse.

**Acceptance scenarios**:

1. **Given** a successful parse, **When** `parse:success` fires, **Then** the step/sequence model rebuilds; selection is remembered as pattern name + step index (not a source offset).
2. **Given** a visual writeback, **When** it applies, **Then** it uses undoable Monaco replace with a distinct edit source (`pattern-editor` or `sequence-editor`) and does not call `setValue` on the whole buffer.
3. **Given** the tracker or arranger has focus, **When** parse refreshes the view, **Then** focus and caret are not stolen by Monaco.
4. **Given** one pointer gesture that paints several cells, **When** it completes, **Then** it is a single undo step.

### User Story 5 — Pointer-first input (Priority: P2)

**Why this priority**: Future-proofs touch without shipping a tablet layout in v1.

**Independent test**: With the tracker focused, enter a note from the palette with pointer only; move a sequence block with Move buttons without dragging; confirm no action requires hover alone.

**Acceptance scenarios**:

1. **Given** tracker and arrangement controls, **When** interacting, **Then** input uses Pointer Events; no hover-only actions.
2. **Given** cell and grip targets, **When** the author uses the zoom control, **Then** targets grow; at the largest step size, primary targets are at least about 44 CSS pixels on the short edge.
3. **Given** tracker keyboard entry, **When** focus is in Monaco or elsewhere, **Then** tracker note keys are inactive so they do not fight Monaco or MIDI step entry ([065](../../complete/065-web-midi-step-entry/spec.md)).
4. **Given** every drag gesture (cell paint, block reorder), **When** the surface is used without drag, **Then** an equivalent button or palette control exists.
5. **Given** the tracker or arrangement grip area, **When** rendered, **Then** `touch-action` is set so the browser does not claim the gesture for scroll/zoom.

### Edge cases

- Empty `pat` RHS: tracker shows an empty editable step list (or a single rest row) without inventing tokens until the author adds one.
- Pattern used only via composition sugar: arranger read-only; tracker may still edit the underlying `pat` definition when selected from text or a navigable block.
- Shared `seq` rename of item order while playback is active: writeback still applies; playback follows existing hot-reload / parse rules (no special tracker playback contract beyond current Desktop behaviour).
- Quoted pattern token blobs: treated as compact RHS (flatten on first edit).
- Duration `:N` displayed as a multi-step span: editing inside the span may rewrite that atom’s duration form; viewing alone does not expand `:N` into a pile of `_` in source.

## Requirements

### Functional requirements

- **FR-001**: System MUST treat the `.bax` editor buffer as the sole durable song source; visual editors MUST NOT maintain a parallel persisted song model.
- **FR-002**: System MUST project parsed `patternEvents` into a step model for the tracker without changing language semantics.
- **FR-003**: System MUST write pattern and sequence mutations through undoable Monaco edits that re-parse via the existing Desktop pipeline.
- **FR-004**: System MUST confirm before the first mutating rewrite that expands `*`, parentheses, or quoted lists on a given `pat` or `seq` statement; Cancel MUST leave source unchanged.
- **FR-005**: System MUST preserve statement keyword form (`pat` vs shorthand), comments outside the rewritten statement, and sequence item modifiers when rewriting.
- **FR-006**: System MUST keep composition constructs (`cat`, `alias`, `section`, `form`, `channel auto`) and declaration-modified patterns read-only in the visual surfaces.
- **FR-007**: System MUST preserve Pattern Grid seek/loop and click-to-navigate when arrangement grips are unused.
- **FR-008**: System MUST expose visual mutations as named commands (`setStep`, `setEffect`, `moveItem`, `duplicateItem`, `deleteItem`, and equivalents) so input devices share one write path.
- **FR-009**: System MUST NOT invent new directives, effects, note syntax, or chip-specific pattern columns.
- **FR-010**: Shared projection and serialization logic MUST live in platform-agnostic `app-core` (or engine read-only helpers); Desktop hosts the v1 UI.

### Non-goals

- Piano roll or pitch-vs-time editing surface.
- Per-cell volume column or FamiTracker-style instrument column (language has no such columns).
- Game Boy `subpat` multi-column tracker rows (still future under [103](../103-instrument-editor-workspace/spec.md)).
- Automatic scale-lock snapping of notes in the grid ([007](../../complete/007-scale-awareness/spec.md) diagnostics on written text still apply).
- Web-lite tracker or arranger UI in this feature.
- Replacing Monaco as the primary text editor.
- Dragging arrangement blocks as a substitute for seek/loop (014 remains authoritative for ruler behaviour).

## Success criteria

- **SC-001**: A flat pattern can be fully note-edited in the tracker with round-trip to text and Undo.
- **SC-002**: A compact pattern’s first edit either flattens after confirm or leaves source unchanged on cancel.
- **SC-003**: Classic `seq` reorder/duplicate/delete updates source; shared-seq impact is visible; composition lanes stay read-only.
- **SC-004**: Seek/loop and click-to-navigate regressions are absent relative to 014/100.
- **SC-005**: Unit tests cover projection, flatten serialization, and seq/channel rewrite before Desktop UI is considered complete.
- **SC-006**: User-facing docs state flatten-on-edit and the read-only cases.

## Assumptions

- Feature id **105**; Desktop is the primary IDE ([constitution](../../constitution.md) §VIII).
- Instrument editor writeback (`applyUndoableReplace`) is the precedent for Monaco mutations.
- Statement spans come from Peggy statement locations; event-level locs alone are insufficient for repeats.
- Implementation issues for the four work slices are filed under the parent feature issue.

## Open questions

- Exact chrome for hosting the tracker (dedicated panel vs modal vs split under the Pattern Grid) can be resolved in `plan.md` without changing FR-001–FR-010.
- Whether flatten confirmation is remembered per statement for the session only, or also across file reload, defaults to **session only** unless product review chooses otherwise.

## References

- Parent issue: https://github.com/kadraman/beatbax/issues/239
- Implementation: [edit model (#240)](https://github.com/kadraman/beatbax/issues/240), [tracker panel (#241)](https://github.com/kadraman/beatbax/issues/241), [arrangement handles (#242)](https://github.com/kadraman/beatbax/issues/242), [docs (#243)](https://github.com/kadraman/beatbax/issues/243)
- [specs/global/language.md](../../global/language.md)
- [specs/complete/014-pattern-grid-seek-and-loop/spec.md](../../complete/014-pattern-grid-seek-and-loop/spec.md)
- [specs/complete/100-pattern-grid-zoom/spec.md](../../complete/100-pattern-grid-zoom/spec.md)
- [specs/complete/008-song-composition-abstractions/spec.md](../../complete/008-song-composition-abstractions/spec.md)
