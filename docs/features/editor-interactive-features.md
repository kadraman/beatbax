---
title: "Editor: Interactive / Musical Editing Features"
status: proposed
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

- Hover info (Low): show note metadata (frequency, MIDI number, step length) and instrument params.
  - Monaco API: `monaco.languages.registerHoverProvider`
  - Integration: resolve token under cursor via existing parser; use `playbackManager` for quick audio preview on demand.

- Instrument preview on hover (Low): short 200–500ms preview of the named instrument when hovering an `inst` token.
  - Monaco API: hover provider + small `setTimeout` playback; cancel on mouseout.
  - Integration: use `eventBus` or `playbackManager.playPreview(instName)` (add lightweight preview API if needed).

- Completions & snippets (Low): provide completions for `inst` names, `pat`/`seq` identifiers, transforms, and transforms parameters.
  - Monaco API: `monaco.languages.registerCompletionItemProvider`

- Signature help / parameter hints (Low): `inst(name,N)` parameter hints while typing.
  - Monaco API: `monaco.languages.registerSignatureHelpProvider`

- CodeLens actions for patterns (Low → Medium): inline lenses above `pat` / `seq` offering "Play pattern", "Stop", "Preview".
  - Monaco API: `monaco.languages.registerCodeLensProvider`
  - Integration: trigger `playbackManager` to play only the selected pattern range.

- Gutter glyphs / clickable play icons (Medium): enable `glyphMargin` and render a play icon that starts a pattern preview.
  - Monaco API: `glyphMargin` + `editor.onMouseDown` handler

- Semantic tokens / colorization (Low): color instruments, channels, transforms for immediate visual parsing.
  - Monaco API: `monaco.languages.registerDocumentSemanticTokensProvider`

- Beat / step decorations (Medium): decorate note/rest tokens with CSS classes for downbeats and subdivisions.
  - Monaco API: `editor.deltaDecorations`
  - Integration: map token positions during parse/expansion; update decorations on edits.

### Medium-effort Interactive Features (Priority: Medium)

- Live playback cursor (Medium): sync a moving editor decoration to the scheduler so users see the exact tick/step while playing.
  - Monaco API: `editor.deltaDecorations` (fast), update at scheduler tick rate (throttle to 60fps).
  - Integration: subscribe to `playbackManager` tick events on `eventBus` and update decoration to current token position.

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

1. Implement a hover provider that shows note info and instrument params. (Low)
2. Wire instrument preview on hover using `playbackManager.playPreview(instName)`. Add a `playPreview` method if none exists. (Low)
3. Add completion provider for `inst`, `pat`, `seq`, `seq` transforms. (Low)
4. Add CodeLens provider for `pat` / `seq` with Play/Stop actions. (Low → Medium)
5. Add semantic tokens provider and basic CSS token classes for colorization. (Low)

### Phase 2 — Medium features (2–4 days)

1. Implement decorations for beats and step alignment; map parser tokens to editor ranges. (Medium)
2. Implement live playback cursor: subscribe to `playbackManager` ticks and update a decoration. (Medium)
3. Implement glyphMargin play icons for quick previews. (Medium)
4. Add overlay widget metronome and transport LED. (Medium)

### Phase 3 — Rich interactivity (4+ days / experimental)

1. Inline parameter sliders content widgets (Medium → High).
2. Pattern preview popover with mini piano-roll (High).
3. Embedded piano-roll editor (High) — treat as separate experimental plugin.

### Web UI Changes

- Add a new `editor/integrations` submodule that registers Monaco providers on editor init.
- Expose a small `playbackManager.preview` API for short previews with cancellation.
- Add user prefs toggles (ThemeManager / EditorState) for enabling interactive features.

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

- [ ] Add `editor/integrations/interactive-providers.ts`
- [ ] Implement `hoverProvider` + preview cancelation
- [ ] Implement `completionProvider` for domain tokens
- [ ] Implement `codeLensProvider` for `pat` / `seq`
- [ ] Implement `semanticTokensProvider` and CSS rules
- [ ] Add `playbackManager.preview` lightweight API
- [ ] Wire beat decorations and live playback cursor
- [ ] Expose EditorState toggle and ThemeManager preference

## Future Enhancements

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
