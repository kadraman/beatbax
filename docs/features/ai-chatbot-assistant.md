---
title: "Web UI: AI Chatbot Assistant (BeatBax Copilot)"
status: proposed
authors: ["kadraman"]
created: 2026-03-21
issue: "https://github.com/kadraman/beatbax/issues/61"
---

## Summary

Add an on-device AI chat assistant to the BeatBax Web UI that helps users write, edit, and debug `.bax` song scripts. The assistant is powered by **WebLLM** (runs entirely in-browser via WebGPU — no server required), understands the BeatBax language syntax, and has access to the current editor content and any active parse/validation errors. The feature is gated behind a **feature flag** that can be toggled from app configuration (localStorage) and from the **View** menu.

---

## Problem Statement

The BeatBax language has a non-trivial surface area: instruments, patterns, sequences, transforms, channel routing, and effect syntax. New users — and experienced ones working on complex songs — have no in-editor assistance when they get stuck. Error messages are surfaced as Monaco markers, but they don't explain root causes or suggest fixes. There is no way to ask "generate a bass pattern in C minor" or "why is my channel 3 playing the wrong notes?"

---

## Proposed Solution

### Overview

A **Chat Panel** appears as a collapsible right-side panel (or as a tab in the existing right-pane area alongside the Channel Mixer). When opened, it renders a conversation thread with a text input. The user can ask questions or request code generation. The assistant responds in plain text and/or fenced `.bax` code blocks with an "Insert at cursor" or "Replace selection" action button.

The assistant is given three pieces of context on every inference call:

1. **System prompt** — describes the BeatBax language syntax, grammar, and idioms.
2. **Current editor content** — the full `.bax` source from the Monaco model (truncated to a safe token budget if very large).
3. **Active diagnostics** — the list of current errors and warnings from the `DiagnosticsManager` (message, severity, line/column), serialised as a short text block prepended to the user message.

### WebLLM Model Choice

| Model | Size (Q4) | Capability | Recommendation |
|---|---|---|---|
| `Phi-3.5-mini-instruct-q4f16_1-MLC` | ~2 GB | General + code | ✅ Default |
| `Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC` | ~1 GB | Code-specialist | ✅ Lightweight option |
| `Llama-3.2-3B-Instruct-q4f16_1-MLC` | ~2 GB | General | Alternative |

The model is configurable via app config. The default is `Phi-3.5-mini-instruct-q4f16_1-MLC`.

### Feature Flag

The feature is **disabled by default**. It can be enabled via:

1. **View menu** — a `View → AI Assistant` toggle menu item (checkmark indicates state), which writes the flag to localStorage and shows/hides the panel immediately.
2. **URL parameter** — `?ai=1` enables the flag on load (useful for demos/testing), `?ai=0` disables it, overriding localStorage.
3. **localStorage key** — `beatbax:feature.aiAssistant` (boolean string `"true"` / `"false"`), persisted across sessions. Added to the central `StorageKey` registry in `local-storage.ts`.

When the flag is disabled, no WebLLM code is loaded (dynamic import), and no WebGPU resources are allocated.

### Context Injection

On every user message send, the panel assembles the system context as follows:

```
[SYSTEM]
You are BeatBax Copilot, an assistant for the BeatBax live-coding chiptune language.
<language reference — injected from a static markdown string in chat-panel.ts>

[EDITOR CONTENT]
```bax
<current Monaco model value, truncated to 3000 characters if longer>
```

[DIAGNOSTICS]
<if errors/warnings exist>
  error   line 5, col 3: Unknown instrument 'fuzz'
  warning line 9, col 1: Channel 3 has no instrument assigned
<else>
  No current errors or warnings.
</if>
```

The diagnostics are retrieved from the `DiagnosticsManager` instance (already available in `main.ts`) and passed into the `ChatPanel` constructor.

### Insert / Replace Actions

When the assistant's response contains a fenced code block (` ```bax ... ``` `), the panel renders an action bar below it with two buttons:

- **Insert at cursor** — calls `editor.executeEdits()` to insert the code block text at the current cursor position.
- **Replace selection** — replaces the current Monaco selection with the code block text (disabled if nothing is selected).

---

## Implementation Plan

### New Files

| File | Purpose |
|---|---|
| `apps/web-ui/src/panels/chat-panel.ts` | Chat panel UI, WebLLM integration, context assembly |
| `apps/web-ui/src/utils/feature-flags.ts` | Feature flag read/write helpers (URL params + localStorage) |

### Changed Files

| File | Change |
|---|---|
| `apps/web-ui/src/utils/local-storage.ts` | Add `StorageKey.AI_ASSISTANT` key; add `WEBLLM_MODEL` key |
| `apps/web-ui/src/ui/menu-bar.ts` | Add `View → AI Assistant` toggle item; add `onToggleAI` callback to `MenuBarOptions` |
| `apps/web-ui/src/ui/layout.ts` | Expose chat panel slot (or reuse right pane as a tab container) |
| `apps/web-ui/src/main.ts` | Instantiate `ChatPanel`; pass editor, diagnosticsManager, eventBus; wire feature flag toggle |
| `apps/web-ui/package.json` | Add `@mlc-ai/web-llm` dependency |

### Engine Changes

**None.** The engine's existing `parse()` and `DiagnosticsManager` outputs are consumed read-only by the chat panel via `main.ts`. No engine API changes are needed.

### `feature-flags.ts` (new)

```typescript
// Reads/writes feature flags from localStorage + URL overrides
export const FeatureFlag = {
  AI_ASSISTANT: 'feature.aiAssistant',
  // future flags here
} as const;

export function isFeatureEnabled(flag: string): boolean { ... }
export function setFeatureEnabled(flag: string, enabled: boolean): void { ... }
```

### `ChatPanel` public API

```typescript
export interface ChatPanelOptions {
  container: HTMLElement;
  eventBus: EventBus;
  /** Returns current editor source for context injection. */
  getEditorContent: () => string;
  /** Returns current diagnostics for context injection. */
  getDiagnostics: () => Diagnostic[];
  /** Called with snippet text when user clicks "Insert at cursor". */
  onInsertSnippet: (text: string) => void;
  /** Called with snippet text when user clicks "Replace selection". */
  onReplaceSelection: (text: string) => void;
  /** WebLLM model ID, defaults to Phi-3.5-mini. */
  modelId?: string;
}

export class ChatPanel {
  constructor(options: ChatPanelOptions);
  show(): void;
  hide(): void;
  toggle(): void;
  isVisible(): boolean;
  dispose(): void;
}
```

### Menu Bar

A new `View → AI Assistant` menu item with a checkmark is added to the existing `MenuBar`. It fires `onToggleAI?: () => void`. `main.ts` handles the callback by calling `setFeatureEnabled(FeatureFlag.AI_ASSISTANT, ...)` and calling `chatPanel.toggle()`.

---

## Testing Strategy

### Unit Tests (`apps/web-ui/tests/`)

- `chat-panel.test.ts`
  - Panel renders correctly when feature flag is enabled
  - Panel is absent from DOM when feature flag is disabled
  - Context assembly produces expected system prompt shape (mock editor content + mock diagnostics)
  - Insert/replace buttons invoke the correct callbacks with the extracted code block text
  - Long editor content is truncated to ≤ 3000 characters in the context payload

- `feature-flags.test.ts`
  - `isFeatureEnabled` returns `false` by default
  - `setFeatureEnabled(true)` persists value; subsequent `isFeatureEnabled` returns `true`
  - URL param `?ai=1` overrides storage to enabled; `?ai=0` overrides to disabled

### Integration / Manual Tests

- Confirm no WebLLM JavaScript is loaded (via Network tab) when the flag is disabled
- Confirm "Insert at cursor" correctly inserts a generated `pat` definition at current cursor
- Confirm diagnostics (parse errors) appear verbatim in the assembled context sent to the model
- Test with `Qwen2.5-Coder-1.5B` and `Phi-3.5-mini` model IDs

---

## UX Notes

- **First-load warning** — when the panel is opened for the first time, a banner explains that the model (~1–2 GB) will be downloaded and cached by the browser. A progress bar (WebLLM provides an `onProgress` callback) is shown during download/initialisation.
- **WebGPU fallback** — if `navigator.gpu` is undefined, the panel shows a clear "WebGPU is not supported in this browser. Try Chrome 113+" message and disables the input rather than throwing an error.
- **Privacy note** — a small footer note clarifies that all inference runs locally; no data is sent to any server.
- **Loading state** — while the model is generating, the send button shows a spinner and the input is disabled to prevent duplicate sends.
- **Clear conversation** — a "Clear chat" button resets the message history (but not the model).

---

## Security Considerations

- No user data or editor content leaves the browser; all inference is local.
- The `onInsertSnippet` / `onReplaceSelection` callbacks pass through `editor.executeEdits()` which is the standard Monaco safe path. Generated text is treated as plain text, not HTML — no `innerHTML` injection risk.
- The system prompt is a static string defined in source; it is not user-controlled.
- The `@mlc-ai/web-llm` package must be pinned to a specific version and reviewed before upgrading to avoid supply-chain risk.

---

## Migration Path

This is a purely additive feature behind a feature flag. No existing behaviour changes. Users who never enable the flag see no difference. The `StorageKey` additions are backward-compatible; unknown keys are simply absent.

---

## Implementation Checklist

- [ ] Add `@mlc-ai/web-llm` to `apps/web-ui/package.json`
- [ ] Create `apps/web-ui/src/utils/feature-flags.ts`
- [ ] Add `AI_ASSISTANT` and `WEBLLM_MODEL` to `StorageKey` in `local-storage.ts`
- [ ] Create `apps/web-ui/src/panels/chat-panel.ts` with full UI and WebLLM integration
- [ ] Add `View → AI Assistant` toggle to `MenuBar` (`menu-bar.ts`)
- [ ] Wire feature flag check, panel instantiation, and menu toggle in `main.ts`
- [ ] Write unit tests: `chat-panel.test.ts`, `feature-flags.test.ts`
- [ ] Manual test with Phi-3.5-mini and Qwen2.5-Coder models
- [ ] Verify no WebLLM load when flag is off (Network tab)
- [ ] Update docs: move this file to `docs/features/complete/` when implemented

---

## Future Enhancements

- **Prompt templates** — quick-action buttons ("Generate bass line", "Explain this error", "Add a noise fill") that pre-fill the input.
- **Streaming responses** — WebLLM supports token streaming; render tokens as they arrive instead of waiting for the full response.
- **Model selector** — a dropdown in the chat panel header to switch between available models.
- **Conversation export** — "Copy conversation" button to clipboard.
- **ONNX/Transformers.js fallback** — for browsers without WebGPU, offer a smaller ONNX model via `@xenova/transformers` (lower quality, no WebGPU required).

---

## Open Questions

1. Should the chat panel be a floating overlay, a fixed right-side panel, or a tab within the existing right pane (alongside Channel Mixer)?
2. Should the full editor content always be included, or only the content visible in the viewport? (Token budget concern for very large songs.)
3. Should conversation history be persisted across page reloads, or always start fresh?
4. Is a model update/cache-busting mechanism needed, or does the browser cache suffice?

---

## References

- [WebLLM — MLC-AI](https://github.com/mlc-ai/web-llm)
- [WebLLM npm package: `@mlc-ai/web-llm`](https://www.npmjs.com/package/@mlc-ai/web-llm)
- [Monaco `executeEdits` API](https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor.ICodeEditor.html#executeEdits)
- [Existing HelpPanel implementation](../../apps/web-ui/src/panels/help-panel.ts)
- [Existing OutputPanel implementation](../../apps/web-ui/src/panels/output-panel.ts)
- [DiagnosticsManager](../../apps/web-ui/src/editor/diagnostics.ts)
- [StorageKey registry](../../apps/web-ui/src/utils/local-storage.ts)
- [MenuBar options](../../apps/web-ui/src/ui/menu-bar.ts)
