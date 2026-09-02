---
title: Enhanced Command Palette Commands
status: complete
authors: ["kadraman", "GitHub Copilot"]
created: 2026-04-26
issue: "https://github.com/kadraman/beatbax/issues/96"
---

## Summary

Extend the BeatBax command palette with navigation, editing, audition, analysis, and refactoring commands to improve authoring workflows and discoverability. These commands provide keyboard-driven access to common song-authoring tasks without requiring mouse interaction.

**Labeling (Desktop / Web UI):** high-frequency / context-menu actions use flat names (`Go to Definition`, `Quick Export`); other F1 actions use a light category (`Export: MIDI`, `Arrange: Split Monolithic Channel Sequences`). VS Code can prepend `BeatBax: ` via `formatCommandLabel({ context: 'vscode' })`. Labels, keybindings, preconditions, and right-click membership live in `packages/app-core/src/editor/command-labels.ts`.

**Shortcuts (Monaco):** only three BeatBax chords remain — `Ctrl/Cmd+Shift+D` (Go to Pattern), `Ctrl/Cmd+Shift+E` (Extract to Pattern), `Ctrl/Cmd+E` (Quick Export). Verify uses the app catalog shortcut (`Alt+V` / `Alt+Shift+V`). Conflicting chords with Channel Mixer, Transport Bar, and Replace were removed. Pattern audition uses CodeLens ▶ Preview or Pattern Grid — Play Selection and under-cursor Alt+P were demoted (unreliable selection heuristics). Irrelevant Monaco builtins (Developer: Force Retokenize / Inspect Tokens, case transforms, Organize Imports, etc.) are filtered from F1 via `hideIrrelevantMonacoActions` in `packages/app-core/src/editor/hide-monaco-actions.ts`.

**Context-sensitive F1 / right-click:** `packages/app-core/src/editor/command-context.ts` sets `beatbax.*` Monaco context keys from cursor position, selection, and feature flags (Pattern Grid, Copilot, MIDI). Commands with preconditions hide when irrelevant. The right-click menu always shows at least five items (Format Document, Quick Export, List Definitions, Insert Transform, Syntax Reference) and adds context-sensitive entries when applicable (Go to Definition, Find References, Rename, Extract to Pattern, Duplicate, Copilot, Arrangement Slice).

## Problem Statement

Current command palette coverage is limited to exports, basic generation, transforms, mute/solo, and validation. Composers lack keyboard-accessible commands for:

- **Navigation**: Jumping to pattern/sequence/instrument definitions or finding all usages
- **Audition**: Previewing individual patterns without manual source editing
- **Discovery**: Listing all available definitions (patterns, sequences, instruments)
- **Refactoring**: Renaming, duplicating, or extracting patterns
- **Analysis**: Identifying unused definitions or checking sequence timing
- **Output**: Quick clipboard export or resuming from editor cursor position

## Proposed Solution

### Command Categories

#### 1. Navigation Commands

**1.1 Go to Pattern Definition**
- **ID**: `beatbax.gotoPatternDef`
- **Label**: `Go to Pattern Definition`
- **Trigger**: Cursor on a pattern reference (e.g., in a sequence body or channel transform)
- **Behavior**: Jump to the `pat NAME =` line for that pattern
- **Implementation**:
  - Extract identifier under cursor using Monaco `getWordAtPosition`
  - Search editor source for `^pat <identifier> =` regex
  - Call `editor.revealLineInCenter()` and position cursor at match
- **Keybinding**: Optional (suggest `Ctrl+Shift+D` for definition)

**1.2 Go to Sequence Definition**
- **ID**: `beatbax.gotoSeqDef`
- **Label**: `Go to Sequence Definition`
- **Trigger**: Cursor on a sequence reference
- **Behavior**: Jump to the `seq NAME =` line
- **Implementation**: Same pattern as Go to Pattern, but search for `^seq`
- **Keybinding**: Optional

**1.3 Find All References**
- **ID**: `beatbax.findReferences`
- **Label**: `Find All References`
- **Trigger**: Cursor on any definition name (pat, seq, inst)
- **Behavior**: Populate VS Code's Find widget with all usages of that identifier
- **Implementation**:
  - Extract identifier under cursor
  - Use Monaco's `find.action.changeSearchString` to populate the search box
  - Allow user to navigate results with existing find UI
- **Keybinding**: Optional (suggest `Ctrl+Shift+F`)

**1.4 List All Patterns / Sequences / Instruments**
- **ID**: `beatbax.listDefinitions`
- **Label**: `List All Definitions…`
- **Trigger**: Command palette
- **Behavior**: Quick-pick menu to jump to any pattern, sequence, or instrument definition
- **Implementation**:
  - Parse editor source for all `pat`, `seq`, `inst` definitions
  - Build quick-pick array: `[{ label: 'pat melody', value: 'melody' }, ...]`
  - On selection, call `gotoPatternDef` / `gotoSeqDef` / `gotoInstDef` internally
- **Keybinding**: Optional

#### 2. Editing & Organization Commands

**2.1 Duplicate Pattern**
- **ID**: `beatbax.duplicatePattern`
- **Label**: `Duplicate Pattern`
- **Trigger**: Cursor on a `pat NAME = ...` line
- **Behavior**: Clone pattern with auto-generated name (e.g., `melody` → `melody_2`)
- **Implementation**:
  - Extract pattern name and full definition from cursor line
  - Generate unique name by checking for existing `NAME_N` patterns
  - Insert new definition after the original
  - Prompt user to confirm or edit the new name
- **Keybinding**: Optional

**2.2 Duplicate Sequence**
- **ID**: `beatbax.duplicateSeq`
- **Label**: `Duplicate Sequence`
- **Trigger**: Cursor on a `seq NAME = ...` line
- **Behavior**: Clone sequence with auto-generated name
- **Implementation**: Same pattern as Duplicate Pattern, but for sequences
- **Keybinding**: Optional

**2.3 Rename Pattern / Sequence / Instrument**
- **ID**: `beatbax.renameDefinition`
- **Label**: `Rename Definition…`
- **Trigger**: Cursor on any definition name
- **Behavior**: Prompt for new name and update all references throughout the song
- **Implementation**:
  - Extract old identifier under cursor
  - Show quick-pick or input dialog for new name
  - Use regex replace to update:
    - `pat/seq/inst OLD_NAME` in all definitions
    - References in channel assignments, sequence bodies, transforms
  - Show confirmation of replacements
- **Keybinding**: Optional (suggest `Ctrl+Shift+R` for rename)
- **Safety**: Validate new name is a valid identifier; show if name already exists

**2.4 Extract Selection to Pattern**
- **ID**: `beatbax.extractToPattern`
- **Label**: `Extract to Pattern`
- **Trigger**: User has selected note tokens (e.g., `C4 E4 G4`)
- **Behavior**: Create a new `pat` definition from selection and replace original with reference
- **Implementation**:
  - Extract selected text
  - Generate unique pattern name (e.g., `extracted_1`)
  - Insert new pattern definition after current block
  - Replace selection with new pattern name
- **Keybinding**: Optional (suggest `Ctrl+Shift+E`)

**2.5 Sort Definitions Alphabetically**
- **ID**: `beatbax.sortDefinitions`
- **Label**: `Refactor: Sort Definitions…`
- **Trigger**: Command palette; optionally show for selected text block
- **Behavior**: Sort a consecutive block of pattern/sequence/instrument definitions
- **Implementation**:
  - Detect the current definition block (consecutive `pat` or `seq` lines)
  - Sort alphabetically by name
  - Preserve instrument types, bpm, time, chip directives (not sorted)
- **Keybinding**: Optional
- **Notes**: Respect existing blank-line groupings where possible

#### 3. Audition & Playback Commands

**3.1 Preview Pattern** (internal / CodeLens)
- **ID**: `beatbax.previewPattern`
- **Label**: `Preview Pattern` (hidden from F1 / right-click via `precondition: false`)
- **Trigger**: Explicit pattern name from CodeLens ▶ Preview or `playFromCursor` — not under-cursor inference
- **Behavior**: Play only that pattern (one-shot synthetic source)
- **Implementation**:
  - Require an explicit `patternName` argument
  - Generate minimal synthetic BeatBax source with channel instrument resolution
  - Call `onPlayRaw()` with synthetic source
- **Keybinding**: None (discoverable via CodeLens)

**3.2 Preview Sequence** (internal / CodeLens)
- **ID**: `beatbax.previewSeq`
- **Label**: `Preview Sequence` (hidden from F1 / right-click via `precondition: false`)
- **Trigger**: Explicit sequence name from CodeLens ▶ Preview
- **Behavior**: Play that sequence using resolved channel instrument
- **Implementation**: Same as Preview Pattern, but build synthetic source from sequence body
- **Keybinding**: None

**3.3 Play from Cursor Position**
- **ID**: `beatbax.playFromCursor`
- **Label**: `Play: From Cursor Position`
- **Trigger**: Command palette; editor has focus
- **Behavior**: Resume main playback from the channel/sequence containing the cursor line
- **Implementation**:
  - Identify which channel and sequence the cursor is referencing
  - Calculate elapsed time into that sequence (note count)
  - Seek playback to that position and resume
  - If main song not playing, start from that position
- **Keybinding**: Optional (suggest `Alt+Shift+P`)

#### 4. Analysis & Diagnostics Commands

**4.1 Show Unused Definitions**
- **ID**: `beatbax.showUnused`
- **Label**: `Analyze: Show Unused Definitions`
- **Trigger**: Command palette
- **Behavior**: List all patterns, sequences, and instruments that are never referenced
- **Implementation**:
  - Parse all definitions (pat, seq, inst)
  - For each, search source for any reference (channel assignments, sequence bodies, transforms)
  - Return list of unreferenced names in a quick-pick
  - On selection, jump to that definition
- **Output**: Dialog or quick-pick showing unused count per type (e.g., "4 unused patterns, 1 unused instrument")

**4.2 Show Pattern Duration / Timing Info**
- **ID**: `beatbax.showPatternInfo`
- **Label**: `Analyze: Show Pattern Duration`
- **Trigger**: Cursor on a pattern definition
- **Behavior**: Display note count, playback time (ms), and tick count
- **Implementation**:
  - Extract pattern body from cursor line
  - Count note tokens (excluding rests)
  - Calculate duration: `(noteCount / currentBPM) * 60000 ms`
  - Show in hover or quick-info tooltip
  - Format: `Pattern: 8 notes | ≈ 1.5s @ 120BPM | 120 ticks`
- **Keybinding**: Optional

**4.3 Audit Song for Common Issues**
- **ID**: `beatbax.auditSong`
- **Label**: `Validate: Audit Song for Issues`
- **Trigger**: Command palette
- **Behavior**: Check for:
  - Unmatched instrument references (used but not defined)
  - Unmatched pattern/sequence references
  - Circular sequence definitions (seq A → seq B → seq A)
  - Mismatched bpm/time settings across channel directives
  - Sequences that exceed known device limits (Game Boy: ~2000 patterns per channel)
- **Output**: Numbered list of issues with line numbers and auto-jump on selection
- **Implementation**: Leverage existing `onVerify()` callback; add more granular checks
- **Format**:
  ```
  ✗ Unmatched instrument: 'bass_drum' on line 42
  ✗ Circular sequence: drum → arp → drum on lines 18, 25, 31
  ✓ No issues found
  ```

#### 5. Channel Operations

**5.1 Copy Channel Configuration**
- **ID**: `beatbax.copyChannelConfig`
- **Label**: `Channel: Copy Configuration`
- **Trigger**: Cursor on a `channel N =>` line
- **Behavior**: Copy the full channel assignment to clipboard (e.g., `inst lead seq chorus`)
- **Implementation**:
  - Extract the channel line (everything after `=>`)
  - Copy to clipboard using Monaco's clipboard API
  - Show toast notification: "Copied: inst lead seq chorus"
- **Keybinding**: Optional

**5.2 Swap Channel Assignments**
- **ID**: `beatbax.swapChannels`
- **Label**: `Channel: Swap Assignments…`
- **Trigger**: Command palette
- **Behavior**: Interactive swap of two channel definitions
- **Implementation**:
  - Show quick-pick listing current channels (e.g., "Channel 1: inst lead seq mel")
  - User selects two channels
  - Swap their `channel N =>` lines in the editor
- **Keybinding**: Optional

#### 6. Export & Output Convenience Commands

**6.1 Export to Clipboard**
- **ID**: `beatbax.exportToClipboard`
- **Label**: `Export: Clipboard…`
- **Trigger**: Command palette
- **Behavior**: Quick-pick text-based export format (JSON/MIDI/FamiTracker Text) and copy result to clipboard
- **Implementation**:
  - Show quick-pick: `['JSON', 'MIDI', 'FamiTracker Text']`
  - On selection, export using existing `onExport()` callback
  - Intercept the export result and copy to clipboard
  - Show toast: "Exported JSON (1200 bytes) — copied to clipboard"
- **Keybinding**: Optional

**6.2 Quick Export (Last Format)**
- **ID**: `beatbax.quickExport`
- **Label**: `Quick Export`
- **Trigger**: Command palette or keybinding
- **Behavior**: Re-export with the most recently used format without prompting
- **Implementation**:
  - Track `lastExportFormat` in `window` or IndexedDB
  - On invocation, call `onExport(lastExportFormat)` directly
  - Show toast confirming format used
  - Fallback to JSON if no history
- **Keybinding**: Optional (suggest `Ctrl+E` for quick export)

#### 7. Reference & Help

**7.1 Show Effect Presets**
- **ID**: `beatbax.showEffectPresets`
- **Label**: `Help: Effect Presets`
- **Trigger**: Command palette or when user types effect name
- **Behavior**: Quick-pick of common effect presets (vol_slide, trem, arp, etc.) with descriptions
- **Implementation**:
  - Build preset list from BeatBax language docs (effects schema)
  - Show quick-pick with format: `label: "vol_slide(12, down) — volume decrease over 12 ticks"`
  - On selection, insert at cursor
- **Keybinding**: Optional

**7.2 Show Syntax Help**
- **ID**: `beatbax.showSyntaxHelp`
- **Label**: `Syntax Reference…`
- **Trigger**: Command palette or context-sensitive (cursor on keyword)
- **Behavior**: Show in-editor documentation for pat/seq/inst/channel/effect syntax
- **Implementation**:
  - Detect keyword under cursor (pat, seq, inst, etc.)
  - Show quick-pick of help topics
  - Display formatted markdown in a webview panel or hover
  - Include examples for each syntax form
- **Keybinding**: Optional (suggest `Ctrl+H`)

## Implementation Plan

### Phase 1: Core Navigation (High Priority)
- Go to Pattern / Sequence / Instrument Definition
- Find All References
- List All Definitions

### Phase 2: Audition & Quick Preview (High Priority)
- Preview Pattern / Sequence (CodeLens; palette actions hidden)
- Play from Cursor Position

### Phase 3: Editing & Organization (Medium Priority)
- Duplicate Pattern / Sequence
- Rename Definition (with reference updates)
- Extract Selection to Pattern
- Sort Definitions

### Phase 4: Analysis & Diagnostics (Medium Priority)
- Show Unused Definitions
- Show Pattern Duration
- Audit Song for Common Issues

### Phase 5: Channel Operations & Export (Lower Priority)
- Copy Channel Configuration
- Swap Channel Assignments
- Export to Clipboard
- Quick Export (Last Format)
- Show Effect Presets
- Show Syntax Help

### Web UI Changes
- **command-palette.ts**: Add command registrations and implementations
- **main.ts**: Wire new commands to playback, editor, and store callbacks
- **Types**: Define interfaces for command metadata (command group, priority, keybinding)

### Parser / Core Changes
- **None required** — all commands operate on editor source, not core engine

### Testing Strategy

#### Unit Tests
- Pattern/sequence detection under cursor
- Definition extraction and parsing
- Reference counting (unused definitions)
- Channel configuration copying

#### Integration Tests
- Navigation to definitions and back
- Duplicate with name collision handling
- Rename with reference update verification
- Audition playback generation

#### Manual Tests
- Keybinding conflicts with Monaco / system
- Quick-pick dismiss on Escape
- Toast notifications appear/disappear
- Clipboard operations on all browsers

## Command Registration Reference

All commands follow the Monaco pattern:
```typescript
reg({
  id: 'beatbax.commandId',
  label: 'Category: Human-Readable Label',
  keybindings: [/* optional keycodes */],
  contextMenuGroupId: '9_beatbax', // optional: show in right-click
  contextMenuOrder: N,             // optional: display order
  run: () => { /* implementation */ },
});
```

### Proposed Keybindings

| Command | Binding | Status |
|---------|---------|--------|
| Go to Pattern Def | `Ctrl/Cmd+Shift+D` | Kept |
| Extract to Pattern | `Ctrl/Cmd+Shift+E` | Kept |
| Quick Export | `Ctrl/Cmd+E` | Kept |
| Play Selection | — | Removed from F1 / right-click / `Ctrl+Shift+Space` (unreliable heuristics; use CodeLens / Pattern Grid) |
| Preview Pattern / Sequence | — | Removed from F1 / right-click / Alt+P (CodeLens only) |
| Verify Song | App catalog `Alt+V` / `Alt+Shift+V` | Prefer catalog over Monaco |
| Find All References / Rename / Play from Cursor / Syntax Help / Export MIDI/JSON | — | Removed (conflicts or redundant) |

Verify via toolbar or `tools.verifySyntax`. Export via toolbar / File → Export.

## Migration Path

- **No breaking changes**: All commands are additive
- **Backward compatible**: Existing exports, validate, and channel commands unchanged
- **Phased rollout**: Deploy by priority group to gather feedback

## Implementation Checklist

- [ ] Phase 1 navigation commands implemented and tested
- [ ] Phase 2 audition commands implemented and tested
- [ ] Phase 3 editing commands implemented and tested
- [ ] Phase 4 diagnostics commands implemented and tested
- [ ] Phase 5 convenience commands implemented and tested
- [ ] Keybinding conflicts resolved
- [ ] Toast notifications added for user feedback
- [ ] All commands appear in command palette (F1) and context menu (right-click)
- [ ] Documentation updated with new commands
- [ ] Tutorial/quickstart updated with common command workflows

## Future Enhancements

1. **Command Aliases**: Support alternative names for commands (e.g., "Jump to Pattern" → Go to Pattern Def)
2. **Custom Keybindings**: Allow users to override keybindings in editor settings
3. **Macro Recording**: Record and replay a sequence of commands for repeated workflows
4. **Command Palette Grouping**: Collapse/expand command categories in the palette
5. **Breadcrumb Navigation**: Show full path when jumping between definitions (file → section → definition)
6. **Multi-file Support**: Extend navigation to imported/included BeatBax files (future feature)

## Open Questions

1. Should "Rename Definition" prompt in-place (Monaco input box) or via quick-pick?
2. Should "Duplicate Pattern" auto-generate a name or prompt the user?
3. Should "Play from Cursor" preserve playback state (mute/solo/loop) or restart fresh?
4. Should "Show Pattern Duration" include tick count and other metadata, or just visual estimate?
5. Should effect presets be context-sensitive (show only valid effects for current instrument type)?

## References

- [Monaco Editor Action API](https://microsoft.github.io/monaco-editor/docs.html)
- [BeatBax Language Spec](/docs/language/syntax.md)
- [BeatBax Command Palette Source](/apps/web-ui/src/editor/command-palette.ts)

## Additional Notes

- Commands are designed to be **keyboard-first** to minimize context-switching during composition
- All commands should **fail gracefully** (show toast, not throw) if cursor is in invalid context
- Commands should **preserve undo/redo history** for user-initiated edits (use `editor.executeEdits`)
- Test with large song files (1000+ patterns) to ensure perf is acceptable
