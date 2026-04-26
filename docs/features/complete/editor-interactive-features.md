---
title: "Editor: Interactive / Musical Editing Features"
status: complete
authors: ["kadraman", "GitHub Copilot"]
created: 2026-03-10
issue: "issue: "https://github.com/kadraman/beatbax/issues/56"
---

## Summary

This feature document proposes a set of editor enhancements to make the BeatBax Web IDE feel and behave more like a music tool than a generic source code editor. It prioritises quick wins that deliver high value for low implementation effort, then describes richer interactive features and implementation notes that map directly to Monaco APIs and the existing `playbackManager` / `eventBus`.

## Problem Statement

The current Monaco-based editor is powerful as a text editor, but lacks visual and musical affordances that make composing and arranging intuitive: inline previews, beat-aware visuals, pattern-level actions, and live-playback synchronization are missing.

These gaps make it harder for users to iterate quickly and understand musical structure at a glance.

## Proposed Solution

Deliver a focused set of interactive editor features grouped by priority:

- Quick wins (low effort, high impact)
- Medium-effort interactive features (in-editor widgets, live sync)
- High-effort prototypes (piano-roll, drag-to-reorder, inline editors)

Each item below lists the recommended Monaco APIs, integration notes, and an estimated effort rating.

### Quick Wins (Priority: High)

- Hover info (Low): show instrument definitions (e.g., type, env, duty) when hovering over `inst` references in patterns or channels.
  - Monaco API: `monaco.languages.registerHoverProvider`
  - Integration: resolve token under cursor via existing parser; lookup instrument state from `ast`.

- Instrument preview on hover (Low): short 200–500ms preview of the named instrument when hovering an `inst` token.
  - Monaco API: hover provider + small `setTimeout` playback; cancel on mouseout.
  - Integration: use `eventBus` or `playbackManager.playPreview(instName)` (add lightweight preview API if needed).
  - **CodeLens instrument preview implemented** (2026-03-11): per-`inst` line CodeLens buttons (`C3` `C4` `C5` `C6` `C7`) trigger single-note playback via `beatbax.previewInstNote`. Notes play on the correct APU channel (pulse1/2/wave/noise) derived from the instrument's `type` field. Only one note plays at a time; auto-stops after 2 s or `onComplete`. Hover-triggered audio on the hover provider itself (without a user gesture) is still pending — CodeLens serves as the primary interaction point.

- Effect preview (High): preview the audio result of inline effect tokens (`<vib:3,6>`, `<arp:0,3,7>`, `<port:8>`) and named `effect` preset blocks by playing a short representative pattern with the effect applied.
  - Monaco API: CodeLens above `effect` definition lines + hover docs for inline effect tokens (already syntax-highlighted).
  - Integration: build a minimal one-pattern AST with the effect applied; play via the shared `AudioContext` using the existing `startInstNotePreview`/`startPatternPreview` path.
  - Each `effect` definition line should get `▶ Preview` / `↺ Loop` / `⬛ Stop` lenses (same pattern as `pat`/`seq`).
  - Inline `<effect>` tokens inside patterns should get hover docs showing effect name, parameters, and a "click CodeLens to hear" hint (since hover itself cannot launch audio without a gesture).

- Completions & snippets (Low): provide completions for `inst` names, `pat`/`seq` identifiers, transforms, and transforms parameters.
  - Monaco API: `monaco.languages.registerCompletionItemProvider`

- Signature help / parameter hints (Low): `inst(name,N)` parameter hints while typing.
  - Monaco API: `monaco.languages.registerSignatureHelpProvider`

- CodeLens actions for patterns (Low → Medium): inline lenses above `pat` / `seq` offering "Play pattern", "Stop", "Preview".
  - Monaco API: `monaco.languages.registerCodeLensProvider`
  - Integration: trigger `playbackManager` to play only the selected pattern range.

- Gutter glyphs / clickable play icons (Medium): enable `glyphMargin` and render a play icon that starts a pattern preview.
  - Monaco API: `glyphMargin` + `editor.onMouseDown` handler
  - Implementation notes (2026-03-12): the glyph margin now hosts two related feature sets:
  - **Problems panel, validation UI, and error state (implemented 2026-03-14):**
    - The output panel's Problems tab renders `ast.diagnostics` entries with severity icons. Rows that carry source location data (`d.loc`) are clickable: a `navigate:to` event is emitted on the `eventBus` carrying `{ line, column }`. `main.ts` handles `navigate:to` by calling `editor.setPosition()` + `editor.revealLineInCenter()` + `editor.focus()`, providing click-to-navigate from the Problems panel.
    - The Problems tab label shows a blue badge (`.bb-tab-badge`) with the total error + warning count; the badge is updated by `updateProblemsTabBadge()` on every `validation:errors` / `validation:warnings` event.
    - Play and Live buttons are disabled when the last parse produced errors. `setErrorState(true/false)` in `main.ts` calls `transportControls.setHasErrors()` and disables/re-enables the Live toggle; Live mode is automatically exited on error.
    - Monaco squiggle markers (errors = red, warnings = yellow) are set in `diagnostics.ts` from `ast.diagnostics` and are no longer cleared on `parse:success` so they persist during playback.
    - The status bar shows a live cursor position (line:col) driven by `editor.onDidChangeCursorPosition`. Error/warning counts in the status bar are driven exclusively by `validation:errors` / `validation:warnings` events — not by `parse:success`.
    - Playback position cursors: a pulsing inline-SVG triangle is rendered on both the active `pat` line and the enclosing `seq` line. The `pat` triangle is teal and the `seq` triangle is amber; both pulse using a CSS `@keyframes` animation. The triangles are rendered as base64-embedded SVG data URIs to avoid encoding issues inside CSS.
    - Channel state glyphs: per-`channel N =>` lines a glyph shows channel state — live (green speaker), muted (speaker+slash), and soloed (gold star). These are inline SVGs embedded as base64 URIs for compatibility. Clicking a channel glyph toggles mute via the existing `ChannelState.toggleMute()` API.
    - The glyph column is narrowed to keep the editor compact while preserving line numbers. CSS targets `.monaco-editor .margin .glyph-margin` rather than the entire margin to avoid clipping line numbers.
    - Decorations are diffed via `editor.deltaDecorations(oldIds, newDecors)` for efficiency; the implementation keeps separate decoration sets for position cursors and channel glyphs so updates are independent and low-cost.

- Semantic tokens / colorization (Low): color instruments, channels, transforms for immediate visual parsing.
  - Monaco API: `monaco.languages.registerDocumentSemanticTokensProvider`

- ❌ Beat / step decorations (Medium): decorate note/rest tokens with CSS classes for downbeats and subdivisions.
  - *Cancelled*: Deemed too visually noisy and unnecessary given duration tokens like `:4` already distinguish spacing.

### Medium-effort Interactive Features (Priority: Medium)

- ✅ Live playback cursor (Medium): sync a moving editor decoration to the scheduler so users see the exact tick/step while playing.
  - Monaco API: `editor.deltaDecorations` (fast), update at scheduler tick rate (throttle to 60fps).
  - Integration: subscribe to `playbackManager` tick events on `eventBus` and update decoration to current token position.
  - Implementation notes (2026-03-12): the current implementation subscribes to `playback:position-changed` events on the `eventBus`. Each event carries `{ channelId, position }` where `position` contains both `currentPattern` and `sourceSequence` fields. The expansion logic maps `currentPattern` to a `pat` line and `sourceSequence` to a `seq` line and draws the corresponding pulsing triangle decorations. When both a pattern and its sequence are active, the pat triangle takes visual priority and the seq triangle is shown on its own line (if different).
  - Performance: position cursors are updated only when `position.currentPattern` or `position.sourceSequence` values change; decorations for channels are updated on channel events (`channel:muted`, `channel:unmuted`, `channel:soloed`, `channel:unsoloed`) and on `parse:success` when line maps are rebuilt.

- Metronome overlay / transport LED (Medium): `IOverlayWidget` that pulses on the downbeat and shows BPM/state.
  - Monaco API: `editor.addOverlayWidget` + CSS animation; driven by `playbackManager`.

- Inline parameter sliders (Medium): small slider widgets for `env`, `duty`, `wave` amplitude near instrument declarations.
  - Monaco API: `IContentWidget` (DOM) positioned next to token; forward changes live to `playbackManager` for immediate audio feedback.

- Pattern preview popover (Medium): on code lens or hover open a small DOM popover showing a mini piano roll + play controls.
  - Monaco API: content widget or external floating DOM positioning with editor coordinates (`editor.getScrolledVisiblePosition`).

### High-effort / Rich Prototypes (Priority: Low → Medium)

- Embedded piano-roll / step sequencer (High): `IContentWidget` or side panel that renders a full piano-roll for the selected `pat` and allows drag-and-drop editing.
  - Integration: editing should modify text tokens (apply transforms or replace note tokens) and keep AST stable.

- Drag-to-reorder patterns inside `seq` (Medium → High): allow reordering sequence entries by drag; convert gestures into local text edits.
  - Monaco API: `editor.onMouseDown`, `onMouseMove`, `executeEdits`.

- Waveform thumbnails + spectrograms (Medium): pre-rendered canvas thumbnails attached as decoration backgrounds for `wave` instrument declarations.

### UX Principles

- Non-destructive by default: previews and overlays should not edit the document. Provide explicit quick-fixes or code actions for destructive transforms.
- Toggleable: make interactive features opt-in via the `ThemeManager`/preferences so power users can disable them.
- Low-latency audio feedback: reuse `playbackManager` and a lightweight preview API to avoid spinning new audio contexts.

## Implementation Plan

The plan below focuses on delivering quick wins first (hover, preview, completions, code lenses, decorations), then medium-effort sync features.

### Phase 1 — Quick wins (1–2 days)

1. ✅ Implement a hover provider that shows keyword/directive docs. (`beatbax-language.ts`, 2026-03-11)
2. ✅ Add completion provider for `inst`, `pat`, `seq`, transforms and directives. (`beatbax-language.ts`, 2026-03-11)
3. ✅ Add CodeLens provider for `pat` / `seq` with `▶ Preview`, `↺ Loop`, `⬛ Stop` actions and per-note instrument preview buttons (`C3`–`C7`). (`codelens-preview.ts`, 2026-03-11)
4. Add effect preview via CodeLens for `effect` definition lines; add hover docs for inline `<effect:…>` tokens. (High)
5. Add play-selected-sequence from the editor context menu and command palette — see **Play Selected Sequence** section below. (Medium)
6. Expand the Monaco command palette with BeatBax-specific commands — see **Command Palette Expansion** section below. (Medium)
7. Wire instrument preview on hover using `playbackManager.playPreview(instName)` (gesture-safe path). (Low)
8. Add semantic tokens provider and basic CSS token classes for colorization. (Low)

### Phase 2 — Medium features (2–4 days)

1. Implement decorations for beats and step alignment; map parser tokens to editor ranges. (Medium)
2. Implement live playback cursor: subscribe to `playbackManager` ticks and update a decoration. (Medium)
3. Implement glyphMargin play icons for quick previews. (Medium)
4. Add overlay widget metronome and transport LED. (Medium)

### Phase 3 — Rich interactivity (4+ days / experimental)

1. Inline parameter sliders content widgets (Medium → High).
2. Pattern preview popover with mini piano-roll (High).
3. Embedded piano-roll editor (High) — treat as separate experimental plugin.

### Play Selected Sequence

Allow the user to select text in the editor, right-click and choose "Play Selection as Sequence", or invoke the same action from the command palette.

- **Trigger**: text selection (minimum: a `seq` or `pat` identifier) → right-click context menu item "▶ Play Selected Sequence" or command palette "BeatBax: Play Selected Sequence".
- **Resolution**: read the current selection text; if it is a known `seq` or `pat` name, invoke the existing `beatbax.previewSeq` / `beatbax.previewPattern` command directly. If the selection is raw note tokens (e.g. `C4 E4 G4`), synthesize a temporary `pat __selection__` and preview that.
- **Monaco API**: `editor.addAction` to register the context-menu entry and command palette entry in one call (each `IActionDescriptor` with a `keybindings` array, a `contextMenuGroupId`, and a `run` callback).
- **Stop**: a paired "⬛ Stop Preview" action/command calls `beatbax.stopPreview`.
- **Keyboard shortcut**: `Ctrl+Shift+Space` (or configurable) to play the current selection, `Escape` to stop (already wired in `KeyboardShortcuts`).

### Command Palette Expansion

Surface BeatBax-specific actions in the Monaco command palette by registering them as `editor.addAction` entries (these appear in `F1` / `Ctrl+Shift+P` automatically) or as `KeyboardShortcuts` entries in the app-level shortcut registry.

Suggested commands to add:

| Command ID | Title | Category | Notes |
|---|---|---|---|
| `beatbax.exportJson` | Export to JSON | BeatBax: Export | Triggers existing export-manager JSON export |
| `beatbax.exportMidi` | Export to MIDI | BeatBax: Export | Triggers MIDI export |
| `beatbax.exportUge` | Export to UGE (hUGETracker) | BeatBax: Export | Triggers UGE export |
| `beatbax.exportWav` | Export to WAV | BeatBax: Export | Triggers WAV render export |
| `beatbax.playSelection` | Play Selected Sequence / Pattern | BeatBax: Playback | See **Play Selected Sequence** above |
| `beatbax.stopPreview` | Stop Preview | BeatBax: Playback | Already registered; needs palette title |
| `beatbax.generateSampleInst` | Generate Sample Instruments | BeatBax: Edit | Inserts a commented block of starter `inst` definitions for all four GB channel types at the cursor |
| `beatbax.generateSamplePat` | Generate Sample Pattern | BeatBax: Edit | Inserts a starter 4/4 `pat` with placeholder notes |
| `beatbax.insertTransform` | Insert Transform… | BeatBax: Edit | Quick-pick of transforms (`oct`, `rev`, `slow`, `fast`, `transpose`, `arp`) to insert at cursor |
| `beatbax.formatDocument` | Format BeatBax Document | BeatBax: Edit | Normalises whitespace, aligns `=` signs in `pat`/`seq`, no semantic changes |
| `beatbax.verifySong` | Verify / Validate Song | BeatBax: Validate | Re-runs the parser + resolver and shows the Problems panel |
| `beatbax.toggleMuteChannel` | Toggle Mute Channel… | BeatBax: Channels | Quick-pick of channels 1–4; toggles mute via `ChannelState` |
| `beatbax.soloChannel` | Solo Channel… | BeatBax: Channels | Quick-pick; solos the chosen channel |
| `beatbax.openDocs` | Open BeatBax Docs | BeatBax: Help | Opens the help panel or links to docs |

- **Implementation**: each entry is registered via `editor.addAction(descriptor)` or `editor.addCommand(keybinding, handler)`. Export commands delegate to the existing `ExportManager`.
- **`generateSampleInst`**: insert a snippet block like:
  ```
  inst lead  type=pulse1 duty=50 env=12,down
  inst bass  type=pulse2 duty=25 env=10,down
  inst wave1 type=wave   wave=[0,2,3,5,6,8,9,11,12,11,9,8,6,5,3,2,0,2,3,5,6,8,9,11,12,11,9,8,6,5,3,2]
  inst sn    type=noise  env=12,down
  ```
  at the cursor position using `editor.executeEdits`.
- **`insertTransform`**: uses `monaco.editor.showQuickPick` (or a lightweight DOM select) to let the user pick a transform, then inserts it at the cursor.
- **Keybindings** to surface (optional, document them):
  - `Ctrl+Shift+E` → Export submenu / `beatbax.exportJson`
  - `Ctrl+Shift+Space` → Play Selection
  - `Ctrl+Shift+V` → Verify Song

### Web UI Changes

- Add a new `editor/integrations` submodule that registers Monaco providers on editor init.
- ✅ Expose a small `playbackManager.preview` API for short previews with cancellation.
- Add user prefs toggles (ThemeManager / EditorState) for enabling interactive features.
- Register all command palette commands in a new `editor/command-palette.ts` module, called from `main.ts` after editor init.
- `generateSampleInst` and `generateSamplePat` should use Monaco's `editor.executeEdits` so they are undoable.

### CLI / Parser / AST Changes

Minimal: mostly read-only features. Ensure parser exposes token ranges and AST node locations for `pat`, `seq`, `inst` so providers can map ranges to semantic events.

### Export Changes

None required for initial features. If rich editors (piano-roll) are added, ensure transforms emit valid AST edits.

## Testing Strategy

### Unit Tests

- Providers: test hover, completion and code lens outputs given sample text models.
- Decorations: ensure beat mapping yields expected ranges for given patterns.

### Integration Tests

- Playback cursor sync: mock `playbackManager` ticks and assert decoration moves.
- Preview playback: integration test that `playbackManager.preview` is invoked with correct note set on hover.

## Migration Path

- All features should be opt-in. Start hidden behind a `enableInteractiveEditor` flag in `EditorState` settings so users upgrade safely.

## Implementation Checklist

- [x] Implement `hoverProvider` for keyword/directive docs — **done** (`editor/beatbax-language.ts`, 2026-03-11).
- [x] Extend `hoverProvider` to show instrument definitions (type, env, duty) when hovering over `inst` names in patterns/sequences. — **done** (`editor/beatbax-language.ts`, 2026-03-23).
- [x] Add instrument preview audio on hover (gesture-safe; requires `playbackManager.playPreview` or CodeLens workaround). - **done** via CodeLens instrument preview keys (`C3`–`C7`) above `inst` lines (2026-03-11).
- [x] Implement `completionProvider` for domain tokens — **done** (`editor/beatbax-language.ts`, 2026-03-11). Covers directives, `inst`/`pat`/`seq` definitions, transforms, and note snippets.
- [x] Implement `codeLensProvider` for `pat` / `seq` — **done** (`editor/codelens-preview.ts`, 2026-03-11). Provides `▶ Preview`, `↺ Loop`, `⬛ Stop` lenses for patterns and sequences; per-note buttons (`C3`–`C7`) for instruments; live re-parse on each loop iteration; shared `AudioContext` for first-click reliability.
- [x] Implement `codeLensProvider` per-note instrument preview (`C3`–`C7` buttons above `inst` lines) — **done** (`editor/codelens-preview.ts`, 2026-03-11). Plays single notes on the correct APU channel; auto-stops after 2 s.
- [x] Add effect preview via CodeLens for `effect` definition lines and hover docs for inline `<effect:…>` tokens. (Phase 1, High) - **done** (2026-03-21): `codelens-preview.ts` — `▶ Preview` / `↺ Loop` / `⬛ Stop` lenses above every `effect Name = …` line. Plays 4 ascending notes (C4 E4 G4 C5) with the preset applied inline, using the best available instrument (pulse1 > pulse2 > wave > noise). `beatbax-language.ts` — added hover docs for all 8 built-in inline effects (`vib`, `port`, `volSlide`, `trem`, `pan`, `echo`, `retrig`, `sweep`) and for the `effect` keyword itself. Commands registered: `beatbax.previewEffect`, `beatbax.loopEffect`.
- [x] Add play-selected-sequence context menu + command palette action (`beatbax.playSelection`). (Phase 1, Medium) — **done** (`editor/command-palette.ts`, 2026-03-24). Select one or more `pat`/`seq` definition lines and press `Ctrl+Shift+Space`, right-click → **▶ Play Selected Sequence / Pattern**, or use `F1` → *BeatBax: Play Selected Sequence / Pattern*. Single items play directly via the existing CodeLens preview path. Multiple items are distributed round-robin across available channels (chip-aware via `detectMaxChannels`); overflow seqs are merged per channel. Glyph margin tracks which original seq is playing using `sourcePattern` events (`patNames` lookup) with a `noteCount`-boundary fallback — accurate for any pattern format including percussion.
- [x] Expand command palette with BeatBax-specific commands — export, generate, validate, channel controls. (Phase 1, Medium) — **done** (`editor/command-palette.ts`, 2026-03-24). Registers `BeatBax: Export → JSON/MIDI/UGE/WAV`, `BeatBax: Verify / Validate Song`, `BeatBax: Generate Sample Instruments`, `BeatBax: Generate Sample Pattern`, `BeatBax: Insert Transform…` (quick-pick), `BeatBax: Format BeatBax Document`, `BeatBax: Play Selected Sequence / Pattern`, `BeatBax: Toggle Mute Channel…`, `BeatBax: Solo Channel…`, and per-channel variants for channels 1–4. All appear in the Monaco Command Palette (F1 / Ctrl+Alt+P) and context menu; exported instruments/patterns are UndoRedo-safe via `editor.executeEdits`.
- [x] Implement `semanticTokensProvider` and CSS rules — **done** (`editor/beatbax-language.ts`, 2026-03-23).
- [x] Add `playbackManager.preview` lightweight API - **done** via CodeLens isolated Player instance and shared Context (`editor/codelens-preview.ts`, 2026-03-11).
- [x] Wire live playback cursor — **done** via glyph-margin play head tracking (`editor/glyph-margin.ts`, 2026-03-23). Note-by-note token tracking is pushed to Future Enhancements.
- [x] Expose EditorState toggle and ThemeManager preference — **done** (available via menu bar Dark/Light theme selection and Play/Live mode buttons; can revisit later if needed).
- [x] Glyph-margin playback cursor + channel glyphs implemented (`apps/web-ui/src/editor/glyph-margin.ts`, 2026-03-12). Features:
   - pulsing SVG play-triangle on `pat` and `seq` lines (`bb-glyph--playing`, `bb-glyph--seq-playing`)
   - base64-embedded SVGs for channel live/muted/solo glyphs
   - click-to-toggle mute via `ChannelState.toggleMute()`
   - CSS targets only the glyph column to avoid hiding line numbers
   - Unit tests added: `apps/web-ui/tests/glyph-margin.test.ts` (18 tests covering parse, position updates, channel state, clicks, teardown)

## Future Enhancements

- Inline note-by-note playback position tracking (tracking the playback cursor character-by-character over notes: `C4` -> `E4` etc.)
- Collaborative live-editing visualizer
- Full embedded piano-roll with quantize/snapping
- Channel-specific minimap and activity heatmap

## Open Questions

- Should previews use the same audio context as full playback or a separate lightweight path? (latency vs safety)
- What is the desired tick update rate for the live cursor (every scheduler tick or throttled to 60fps)?
- Do we want destructive quick-actions (apply transform) to require explicit confirmation?

## References

- Monaco docs: hover, code lens, content widgets, overlay widgets, semantic tokens.
- `apps/web-ui/src/main.ts` — existing `playbackManager` and `eventBus` integration points.

## Additional Notes

Start with the hover/preview/completions/code-lens trio — they provide immediate value to composers with minimal UI surface area changes.
