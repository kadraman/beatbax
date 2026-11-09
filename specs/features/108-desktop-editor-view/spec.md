---
title: "Desktop Monaco editor view settings"
id: 108
slug: "desktop-editor-view"
status: "in-progress"
authors:
  - "kadraman"
created: "2026-11-06"
updated: "2026-11-09"
issue: "https://github.com/kadraman/beatbax/issues/248"
area: "desktop"
related:
  - "specs/complete/057-settings-panel/spec.md"
  - "specs/complete/024-granular-codelens-settings/spec.md"
  - "specs/complete/051-editor-interactive-features/spec.md"
  - "specs/complete/076-desktop-first-client-split/spec.md"
  - "https://github.com/kadraman/beatbax/issues/78"
---

# Feature Specification: Desktop Monaco editor view settings

## Summary

Desktop Settings → Editor gains a coherent set of **Monaco view** preferences (font family, tab size, minimap, line numbers, whitespace, indent guides, cursor style, fold-comments row, and a single persisted font size shared with View → Zoom and optional mouse-wheel zoom). Defaults match today’s hardcoded look. Web-lite stays toolbar-limited and does not mount a Settings modal for these controls. No language, parse, or theme-engine changes.

This amends the font-size range in [spec 057](../../complete/057-settings-panel/spec.md) (10–24 → **8–32**). Existing Editor rows in 057 and granular CodeLens in [spec 024](../../complete/024-granular-codelens-settings/spec.md) are unchanged.

## Problem

1. Beyond font size, word wrap, CodeLens, and beat decorations, Desktop Monaco chrome is fixed in the shared editor factory (minimap on, tab size 2, line numbers on, whitespace only in the selection). Authors who prefer a denser or clearer view have no Settings control.
2. Settings font size (10–24) and View → Zoom (session-only 8–32, reset to 14) diverge after reload because Zoom does not persist.
3. Fold comments already persist (`beatbax:editor.foldComments`) but have no Settings row; discovery is limited to the toolbar / View menu.
4. Web-lite correctly omits the Settings modal ([spec 076](../../complete/076-desktop-first-client-split/spec.md)); any new chrome must not expand the web settings surface.

## User scenarios

### User Story 1 — Desktop view chrome in Settings (Priority: P1)

**Why this priority**: Core of the feature — authors change how the editor looks without hunting Monaco defaults or localStorage.

**Independent test**: Open Desktop Settings → Editor; change each new control; close Settings; confirm the editor matches; reload; confirm the same look returns. Reset section restores factory defaults for those keys.

**Acceptance scenarios**:

1. **Given** a fresh Desktop install (or after Reset Editor), **When** the author opens Settings → Editor, **Then** the new controls show factory defaults that match today’s hardcoded look (minimap on, tab size 2, line numbers on, whitespace selection, indent guides on, cursor line, font size 14, default font family).
2. **Given** Settings → Editor, **When** the author changes font family, tab size, minimap, line numbers, whitespace, indent guides, or cursor style, **Then** the open Monaco editor updates immediately and the choice survives reload.
3. **Given** Settings → Editor, **When** the author toggles Fold comments, **Then** behaviour matches the existing toolbar / View menu toggle and the same storage key is used.
4. **Given** Editor section Reset, **When** the author confirms, **Then** the new keys return to factory defaults and the editor reflects them.

### User Story 2 — One persisted font size for Settings and Zoom (Priority: P1)

**Why this priority**: Removes the Settings / Zoom disagreement authors already hit.

**Independent test**: Change font size in Settings; Zoom In/Out/Reset; reload; all paths agree within 8–32.

**Acceptance scenarios**:

1. **Given** Desktop Settings → Editor, **When** the author sets font size to a value in **8–32**, **Then** Monaco uses that size and it persists across reload.
2. **Given** an open editor, **When** the author uses View → Zoom In / Zoom Out / Reset, **Then** the size stays within 8–32, Reset restores **14**, and the persisted setting matches what Monaco shows after each action.
3. **Given** mouse-wheel zoom is **off** (default), **When** the author scrolls with the wheel, **Then** the editor scrolls and font size does not change.
4. **Given** mouse-wheel zoom is **on**, **When** the author uses the platform modifier + wheel (so normal scroll remains available), **Then** font size changes within 8–32 and the persisted setting updates.

### User Story 3 — Web-lite stays limited (Priority: P2)

**Why this priority**: Client boundary from the constitution and spec 076; must not regress web-lite.

**Independent test**: Run web-lite; confirm no Settings modal for these rows and no new editor chrome controls; factory Monaco look remains.

**Acceptance scenarios**:

1. **Given** web-lite, **When** the author uses the app, **Then** there is no Settings modal entry for the new view controls.
2. **Given** web-lite, **When** the editor mounts, **Then** factory defaults apply (same hardcoded look as today unless an existing localStorage key such as `beatbax:editor.fontSize` was already present from another client).

### Edge cases

- Missing or corrupt stored values fall back to factory defaults without breaking editor mount.
- Tab size changes how Tab inserts and how tab characters render; the buffer is not reformatted; parse rules are unchanged; spaces remain the insert mode.
- Turning line numbers off leaves glyph margin, folding, and playback decorations available (those are editor features from [spec 051](../../complete/051-editor-interactive-features/spec.md), not line-number chrome).
- Font family is a fixed select of monospace stacks with a monospace fallback; unavailable OS fonts fall back gracefully.

## Requirements

### Functional requirements

- **FR-001**: Desktop Settings → Editor MUST expose: font family (select), tab size (2 | 4), minimap (toggle), line numbers (on | off), whitespace (selection | all | none), indent guides (toggle), cursor (line | block | underline), fold comments (toggle for existing preference), font size (8–32), mouse-wheel zoom (toggle, default off).
- **FR-002**: Font family options MUST be a fixed list: Default, Consolas, Cascadia Mono, Courier New, system ui-monospace (each with a monospace fallback). Free-text entry and bundled webfonts are forbidden.
- **FR-003**: Changes MUST live-apply to the open Monaco editor and persist under the existing `beatbax:*` preference mechanism; Editor section Reset MUST include the new keys.
- **FR-004**: Defaults MUST match today’s look: font family Default, tab size 2, minimap on, line numbers on, whitespace selection, indent guides on, cursor line, fold comments as today’s stored default, font size 14, mouse-wheel zoom off.
- **FR-005**: Font size MUST be a single persisted value in **8–32** (default 14) shared by Settings, View → Zoom In/Out/Reset, and optional mouse-wheel zoom. This amends the 10–24 range documented in spec 057.
- **FR-006**: Tab size MUST affect Tab key insertion and tab rendering only; MUST NOT reformat the buffer or change language/parse semantics; insert-spaces behaviour stays on.
- **FR-007**: Web-lite MUST NOT gain a Settings modal or new editor chrome controls for these preferences. Toolbar theme / word wrap / fold-comments behaviour from 076 remains.
- **FR-008**: Glyph margin, folding, CodeLens, beat decorations, and bracket-pair colorization stay under existing specs; this feature does not add toggles for them except surfacing fold comments as above.

### Non-goals

- Ligatures, letter spacing, line height, smooth scrolling, sticky scroll, wrap column, bracket-color toggles, high contrast, custom Monaco themes.
- Channel-specific minimap (mentioned as a future idea in spec 051).
- Fixing Desktop light-theme overwrite when the editor is created after theme init (separate defect).
- Rewriting the Settings modal shell or re-specifying existing 057 / 024 Editor rows beyond the font-size range amendment and the new rows listed here.
- Product implementation in this specification pass (issue + specs only).

## Success criteria

- **SC-001**: Every FR-001 control appears in Desktop Settings → Editor, live-applies, and survives reload.
- **SC-002**: Settings font size and View → Zoom stay in sync within 8–32 across a reload.
- **SC-003**: Editor section Reset restores factory view chrome for the new keys.
- **SC-004**: Web-lite builds ship without Settings UI for these controls and keep the factory editor look.
- **SC-005**: Spec 057 documents that font-size bounds and the new view rows are authoritative in this feature (108).

## Assumptions

- Desktop remains the primary IDE; web-lite stays a reduced client ([constitution](../../constitution.md) § VIII, spec 076).
- Preference persistence continues via nanostores + `beatbax:*` localStorage keys (spec 057).
- Fold comments already has a storage key and toolbar path; Settings only needs a row wired to the same preference.

## Open questions

None for specification. Implementation may choose exact CSS font stacks for each select label as long as FR-002’s set is covered.

## References

- [Issue 248](https://github.com/kadraman/beatbax/issues/248)
- [057 Settings panel](../../complete/057-settings-panel/spec.md)
- [024 Granular CodeLens settings](../../complete/024-granular-codelens-settings/spec.md)
- [051 Editor interactive features](../../complete/051-editor-interactive-features/spec.md)
- [076 Desktop-first client split](../../complete/076-desktop-first-client-split/spec.md)
