---
title: "BeatBax Copilot (AI Chatbot Assistant)"
status: implemented
authors: ["kadraman"]
created: 2026-03-21
updated: 2026-07-11
issue: "https://github.com/kadraman/beatbax/issues/61"
---

## Summary

An AI chat assistant (**BeatBax Copilot**, desktop app) that helps users write, edit, and debug `.bax` song scripts. The assistant uses any **OpenAI-compatible REST API endpoint** (OpenAI, Groq, Mistral, Ollama, LM Studio, llama.cpp, etc.) — no on-device model required. It understands the full BeatBax language syntax, has access to the current editor content and active parse/validation errors, and can automatically apply generated code back into the editor with self-correction retry on parse failures.

---

## Architecture Decision: API over On-Device (WebLLM)

The original proposal specified **WebLLM** (in-browser inference via WebGPU). After evaluation, we switched to an **OpenAI-compatible REST API** approach for the following reasons:

| Factor | WebLLM | REST API (implemented) |
|---|---|---|
| Model quality | 1–3 B parameter models (limited code quality) | State-of-the-art models (GPT-4o, Llama 70B, etc.) |
| First-run experience | 1–2 GB download, minutes to initialise | Instant (no local download) |
| Browser requirements | WebGPU required (Chrome 113+, not Safari) | Works in all browsers |
| Privacy | All-local | User controls endpoint — can point to local Ollama/LM Studio |
| Flexibility | Single embedded model | User configures endpoint, model, API key |
| Chiptune code quality | Poor (small models hallucinate syntax) | Excellent with GPT-4o / Llama-70B |

Local privacy is preserved for users who point the endpoint at **Ollama** or **LM Studio** running on their own machine. No data leaves their computer in that case.

### Supported Providers (built-in presets)

Copilot is available in the **desktop app only** (`desktop-full` profile). The hosted web build does not expose Copilot.

| Preset label | Endpoint | Default model | Curated models (dropdown) |
|---|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-5.4-mini` | `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-4.1`, `gpt-4.1-mini`, `o3` |
| Groq (free, fast) | `https://api.groq.com/openai/v1` | `openai/gpt-oss-120b` | `openai/gpt-oss-120b`, `openai/gpt-oss-20b` |
| Ollama (local) | `http://localhost:11434/v1` | `qwen2.5-coder:7b` | Free-text (installed model name); see [Local Ollama guide](../copilot-local-ollama.md) |
| LM Studio (local) | `http://localhost:1234/v1` | `local-model` | Free-text (loaded model name) |

Curated model IDs are verified against each provider's catalog as of July 2026. They change over time — use **Custom...** for any newer model ID.

Settings → AI shows a **Model** dropdown combining curated options with models fetched **live** from the provider's `/models` endpoint, plus **Custom...** for any model ID. A **Refresh** button reloads the list on demand; the list is also loaded automatically when an endpoint has usable credentials (an API key, or any local endpoint). This means local providers (Ollama, LM Studio) show your actually-installed models, and remote providers surface newly released models without waiting for a curated-list update. Fetching goes through the desktop main process to avoid browser CORS restrictions.

Any OpenAI-compatible endpoint can also be entered manually. Provider presets and default models are defined in `packages/app-core/src/stores/ai-models.ts` (shared by desktop and web settings UI).

### Persistence

Copilot connection and chat state use `@beatbax/app-core` (`chat.store.ts`) with the namespaced `BeatBaxStorage` wrapper (`beatbax:` prefix on all keys):

| Storage key | Contents |
|---|---|
| `beatbax:ai.settings` | JSON: `endpoint`, `model`, `maxContextChars` — **API key is not stored here** |
| `beatbax:ai.mode` | Interaction mode: `edit` or `ask` |
| `beatbax:ai.chatHistory` | Persisted conversation (capped) |
| `beatbax:ai.promptHistory` | Submitted-prompt recall list |

On startup, legacy `bb-ai-settings` in `localStorage` is **removed** if present (older builds stored endpoint, model, and API key together under that key).

**API keys (desktop):** stored in the OS user’s **Electron secure credential store** via main-process IPC (`getAIAPIKey` / `setAIAPIKey`). The renderer keeps a session copy in the `chatSettings` store for outbound requests only.

**API keys (web UI settings panel):** when the optional AI settings section is shown in the browser build, keys are kept **in memory for the session** and are not written to `beatbax:ai.settings` or `localStorage`.

### Local Ollama (recommended models and context)

For fully local inference, see **[Copilot — Local models (Ollama)](../copilot-local-ollama.md)**. Summary:

- **Model:** `qwen2.5-coder:7b` (primary on 8 GB GPUs); `qwen2.5-coder:14b` if VRAM allows.
- **Context:** set Ollama `num_ctx` to **16384** minimum for `songs/sample.bax`; **32768** for long sessions or larger files. Default **8192** is often too small and causes snippet-only replies.
- **Edit mode guard:** incomplete responses (missing `play`, `channel`, or most of the file) are **not applied** — the editor stays unchanged and Copilot shows a blocked message.

---

## Problem Statement

The BeatBax language has a non-trivial surface area: instruments, patterns, sequences, transforms, channel routing, and effect syntax. New users — and experienced ones working on complex songs — have no in-editor assistance when they get stuck. Error messages are surfaced as Monaco markers, but they don't explain root causes or suggest fixes. There is no way to ask "generate a bass pattern in C minor" or "why is my channel 3 playing the wrong notes?"

---

## Implemented Solution

### Chat Panel

A **Copilot panel** in the desktop app’s right-side stack (alongside Channel Mixer, Pattern Grid, etc.). It renders a conversation thread with a text input. The user can ask questions or request code generation in two modes:

- **Edit mode** — the AI outputs a complete updated song in a ` ```bax ``` ` block that is automatically applied to the editor. Parse-error self-correction runs up to **2** times; incomplete-song repair runs up to **2** additional times. Replies that would wipe most of the song (snippet-only responses) are blocked by the apply guard.
- **Ask mode** — the AI answers questions and can include code snippets, but does not auto-apply anything.

The mode toggle is persisted under `beatbax:ai.mode` (`chatMode` in app-core).

### Context Injection

On every inference call, `assembleContext()` builds the system prompt as follows:

```
You are BeatBax Copilot, an assistant for the BeatBax live-coding chiptune language.
<BeatBax Language Reference — chip-aware, see below>

<EDIT_SYSTEM_SUFFIX or ASK_SYSTEM_SUFFIX — see below>

[EFFECT GUIDANCE]
Built-in inline effects (use as NOTE<type:args> with no preset): pan, vib, port, arp, ...
Common examples: vibrato C5<vib:3,5>, arpeggio C5<arp:0,4,7>, portamento C5<port:16>.
Named presets: define effect myVib = vib:3,5 once, then use C5<myVib> on any note.

[DEFINED NAMES]
Instruments defined in this song: leadA, leadB, ...
Effects defined in this song: (none) | leadVib, ...
Undefined effect references in this song (will be ignored): leadVib — add an effect definition or switch to a built-in form.

[EDITOR CONTENT]
```bax
<current Monaco model value; not truncated in Edit mode; Ask mode respects maxContextChars>
```

[DIAGNOSTICS]
  error   line 5, col 3: Unknown instrument 'fuzz'
  warning line 9, col 1: Channel 3 has no instrument assigned
  warning line 72, col 20: Pattern 'melody_var': effect 'leadVib' is not defined and will be ignored
  — or —
  No current errors or warnings.
```

The last 10 messages from the conversation history are included before the current user message to maintain coherent multi-turn context.

---

## System Prompt Implementation

### Chip Detection

Before generating the language reference, the panel detects the target chip from the current editor content:

```typescript
function detectChip(source: string): string {
  const m = source.match(/^\s*chip\s+(\w+)/m);
  const raw = m ? m[1].toLowerCase() : 'gameboy';
  return (raw === 'gb' || raw === 'dmg') ? 'gameboy' : raw;
}
```

Aliases `gb` and `dmg` are normalised to `gameboy`. If no `chip` directive is present, `gameboy` is assumed.

### Language Reference (`buildLanguageRef(chip)`)

A `buildLanguageRef(chip: string)` function generates a chip-aware language reference injected into every system prompt. For `gameboy` it includes the full hardware section; for other chips it emits a generic fallback. The reference covers:

**HARDWARE (Game Boy):**
- Fixed 4-channel assignment: pulse1 (lead), pulse2 (harmony), wave (bass), noise (drums)
- Instrument fields: duty values (`12|25|50|75`), GB envelope format, wave array, noise envelopes
- Named noise instruments for percussion (kick, snare, hihat with distinct envelopes)
- Hard rules: each channel number appears at most once; no `inst` definitions inside `pat` bodies

**TOP-LEVEL DIRECTIVES:**
- `chip`, `bpm`, `volume`, `stepsPerBar` with defaults (see [metadata-directives.md](../../language/metadata-directives.md))
- Do **not** emit deprecated `time` or `ticksPerStep` (aliases / no-ops; parser warnings)
- Rule: omit any directive whose value equals the default (never write `volume 1.0`, `stepsPerBar 4`)

**PATTERNS:**
- Note range C3–B8, sharps only (no flats — use enharmonic equivalent)
- Effect-before-duration order: `C4<vib:3,6>:8` ✓, `C4:8<vib:3,6>` ✗
- Inline `inst` switch and temporary `inst(name,N)` override
- Percussion pattern rule: use named instrument tokens, not `C4<cut:N>` hits

**EFFECTS (11 total):**
`pan`, `vib`, `trem`, `port`, `arp`, `volSlide`, `cut`, `bend`, `sweep`, `retrig`, `echo`

**NAMED EFFECT PRESETS:**
- `effect <name> = <type>:<params>` syntax
- Reusable by name on any note

**SEQUENCES:**
- Ordered pattern name lists
- Per-item transforms: `melody:oct(-1):rev`
- Available transforms: `oct(+/-N)`, `inst(name)`, `rev`, `slow`, `fast`
- Section-based structure: 4 sequences per section (one per channel), all listed on channel lines

**CHANNELS:**
- Multi-sequence channel mapping: `channel 1 => inst lead seq intro_mel verse_mel chorus_mel`
- 4-way symmetry rule: every section contributes one sequence to each channel

**GAME BOY CHIPTUNE STYLE GUIDE (8 techniques):**
1. Arpeggio — chord simulation with named presets (`majorArp`, `minorArp`, `dom7Arp`)
2. Vibrato — varied depth/speed per section; `wobble`, `deepVib`, `fastVib`
3. Tremolo — `shimmer` (sine) and `horror` (square) presets
4. Portamento — `slide` and `slowSlide` presets for runs and legato bass
5. Duty-cycle modulation — multiple pulse instruments switched inline for timbral variety
6. Fast 16th-note melodies — short durations `:2` to `:4` for energetic runs
7. Short punchy envelopes — `env=gb:<vol>,down,1` for sharp attack; slower for pads
8. Named presets for all recurring effects — idiomatic BeatBax style

### Edit Mode Suffix (`EDIT_SYSTEM_SUFFIX`)

Additional rules appended in Edit mode:

- Output entire updated song in a single ` ```bax ``` ` block, then 1–3 sentence description only
- **Creating a new song**: triggered by "create", "write", "make", "compose", "generate" — outputs a complete fresh song, discards editor content
- **Editing an existing song**: define separate patterns per channel per section; one sequence per channel per section; never mix channels into one sequence; always append new section sequences to channel lines (BEFORE/AFTER example shown)
- **Longer songs — section-based structure**: named section groups of 4 sequences each, channels referencing all sections in order (graveyard_shift.bax pattern)
- **Comments**: use `#` to annotate instruments, patterns, named effects, structural decisions

### Ask Mode Suffix (`ASK_SYSTEM_SUFFIX`)

Instructs the AI to answer and explain, wrap samples in ` ```bax ``` `, and not modify the editor.

---

## Self-Correction Loop

In Edit mode, after the AI generates a response, the panel validates the extracted `.bax` code using `parseWithPeggy()` and extended `validateBax()` checks. Two repair paths run before apply:

1. **Parse repair** — if the code has parse errors, error messages are fed back to the model (up to **2** attempts, `MAX_PARSE_REPAIR_ATTEMPTS`).
2. **Incomplete-song repair** — if the apply guard detects a snippet-only reply (missing `play`, `channel`, or most of the file), the model is asked for the full song (up to **2** attempts, `MAX_INCOMPLETE_REPAIR_ATTEMPTS`). A snippet-merge fallback may expand partial replies when possible.

```typescript
const MAX_PARSE_REPAIR_ATTEMPTS = 2;
const MAX_INCOMPLETE_REPAIR_ATTEMPTS = 2;

// Parse repair: validate with parseWithPeggy + validateBax; retry with error list in user turn.
// Incomplete repair: assessEditApplyGuard(); retry with buildIncompleteSongRepairPrompt().
// Retry exchanges do not pollute the visible conversation history.
```

If all repair attempts fail, the editor is left unchanged and Copilot shows a clear status message.

### `validateBax(code)` — Extended Validation

`resolveSong()` silently accepts undefined instrument names (both branches of its internal `resolveInstName()` return the name regardless of whether it exists in `ast.insts`). `validateBax()` adds explicit checks after `resolveSong()`:

1. **Channel `inst` references** — catches the most common AI mistake: writing `channel 1 => inst lead` without defining `inst lead ...`
2. **Pattern inline `inst` tokens (structured `patternEvents` form)** — `kind: 'inline-inst'` and `kind: 'temp-inst'` nodes
3. **Pattern inline `inst` tokens (string form)** — raw `"inst <name>"` tokens in `ast.pats`
4. **Sequence `inst` transforms** — `A:inst(bass)` transform where `bass` is not defined

Missing instruments generate actionable error messages, e.g.:
```
instrument "lead" (channel 1) is not defined — add: inst lead type=pulse1 ...
```

---

## `ChatPanel` Public API

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
  /** Called with snippet text when user clicks "Replace editor" — replaces entire editor content. */
  onReplaceEditor?: (text: string) => void;
  /** Called after an auto-apply; provides changed line numbers and the previous content for undo. */
  onHighlightChanges?: (addedLineNums: number[], previousContent: string) => void;
}

export class ChatPanel {
  constructor(options: ChatPanelOptions);
  show(): void;
  hide(): void;
  toggle(): void;
  isVisible(): boolean;
  assembleContext(): string;   // public for testing
  /** Split a response string into alternating text/code segments (```bax blocks). */
  splitContent(content: string): Array<{ type: 'text' | 'code'; value: string }>;
  dispose(): void;
}
```

---

## API Call Implementation

The renderer sends chat requests through the **Electron main process** (`createAIChatCompletion` IPC in `ipc-handlers.ts`) to avoid browser CORS limits and to apply provider-specific timeouts:

| Endpoint type | Timeout |
|---|---|
| Local (Ollama, LM Studio) | 5 minutes |
| Remote, Edit mode (`maxTokens` > 2048) | 2 minutes |
| Remote, Ask mode | 1 minute |

Token limits: **8192** for Edit mode, **2048** for Ask mode. OpenAI endpoints use `max_completion_tokens`; other providers use `max_tokens`. The API key is only included when non-empty (Ollama/LM Studio do not require one). Requests can be cancelled via the abort controller (stop button in the UI).

```typescript
// Renderer (DesktopCopilotPanel.tsx)
const maxTokens = activeMode === 'edit' ? 8192 : 2048;
const response = await window.electronAPI.createAIChatCompletion({
  endpoint: settings.endpoint,
  apiKey: settings.apiKey,
  model: settings.model,
  messages,
  maxTokens,
});

// Main process routes to `${endpoint}/chat/completions` with appropriate timeout.
```

---

## Implemented Files

| File | Status | Notes |
|---|---|---|
| `apps/desktop/src/renderer/src/components/panels/DesktopCopilotPanel.tsx` | ✅ Complete | Copilot UI, apply guard, self-correction, snippet merge |
| `apps/desktop/src/renderer/src/lib/copilot-context.ts` | ✅ Complete | System prompt assembly (Edit / Ask) |
| `apps/desktop/src/renderer/src/lib/copilot-apply-guard.ts` | ✅ Complete | Blocks incomplete Edit-mode replies |
| `apps/desktop/src/renderer/src/components/settings/ai.tsx` | ✅ Complete | Settings → AI (provider, model, mode, context limit) |
| `apps/desktop/src/main/ipc-handlers.ts` | ✅ Complete | Chat completions, secure API key, model list |
| `packages/app-core/src/stores/chat.store.ts` | ✅ Complete | Settings, history, mode persistence (`beatbax:ai.*`) |
| `packages/app-core/src/stores/ai-models.ts` | ✅ Complete | Shared provider presets and curated models |
| `apps/web-ui/src/panels/settings-sections/ai.ts` | ✅ Partial | Settings UI only when AI feature flag enabled; no Copilot panel |

No engine changes are required for Copilot. Desktop validates generated `.bax` via `@beatbax/engine` `parseWithPeggy()` before apply.

---

## UX Notes

- **Settings** — the ⚙ gear icon in the Copilot panel header opens the desktop **Settings** modal directly on the **AI** tab (provider preset, endpoint, API key, model dropdown with **Refresh** and **Custom...**, interaction mode, Ask-mode context limit). Settings are saved on change.
- **Edit / Ask mode toggle** — in Settings → AI and the Copilot panel header; persisted under `beatbax:ai.mode`.
- **Auto-apply with diff highlighting** — in Edit mode, the returned code is applied directly to the editor. Changed lines are highlighted briefly. For fresh song creation (empty editor), highlights are skipped.
- **Keep / Discard review** — after an Edit apply with line highlights, a banner offers **Keep** and **Discard**. Discard restores the pre-edit song; Ctrl+Z does not update the Copilot transcript automatically.
- **Undo** — auto-applied changes can also be undone via the standard editor undo (Ctrl+Z).
- **Loading state** — while the model is generating, the send button shows a spinner and the input is disabled. A stop button cancels the request.
- **Clear conversation** — a "Clear" button resets the message history.
- **Markdown rendering** — assistant responses are rendered as HTML via `marked` + sanitised with `DOMPurify` to prevent XSS.

---

## Security Considerations

- **API key storage (desktop)** — keys are stored in the Electron secure credential store for the current OS user, not in `localStorage`. Users should still avoid high-spend production keys on shared machines.
- **API key storage (web UI settings)** — if the AI settings section is enabled in the browser build, keys exist only in memory for that session.
- **CORS** — desktop Copilot routes chat requests through the Electron main process, avoiding browser CORS limits. The hosted web UI does not expose Copilot; a standalone browser client would still be subject to endpoint CORS policy.
- **Generated code safety** — AI-generated `.bax` code is validated by `validateBax()` before being applied. It is treated as text, not executed as JavaScript.
- **Markdown sanitisation** — all AI response HTML is passed through `DOMPurify.sanitize()` before being set as `innerHTML`, preventing XSS from a malicious or jailbroken model response.
- **No server side** — the panel talks directly to the user-configured endpoint. BeatBax itself operates no proxy or logging server.

---

## Future Enhancement: Retrieval-Augmented Generation (RAG)

### Overview

The current system prompt provides a static language reference and the current editor content. As songs grow complex (and as the language gains new features), the fixed reference may not be sufficient context for high-quality generation. A RAG layer would retrieve the most relevant chunks of documentation and example songs and inject them into the prompt just before sending, without exceeding the model's token budget.

### RAG Document Corpus

The retrieval corpus would be built from:

| Source | Content | Format |
|---|---|---|
| `docs/*.md` | Language spec, scheduler, effects, instruments, export guides | Markdown chunks |
| `docs/features/*.md` | Feature-specific syntax (e.g. metadata, volume, logger) | Markdown chunks |
| `songs/*.bax` | Full annotated example songs (graveyard_shift, heroes_call, etc.) | Raw `.bax` |
| `songs/features/*.bax` | Feature demonstration songs | Raw `.bax` |
| `songs/effects/*.bax` | Effect showcase songs | Raw `.bax` |

### Embedding and Retrieval Strategy

Since BeatBax Copilot runs in the **desktop app** with no BeatBax server backend, RAG must be entirely client-side (bundled index in the Electron app or loaded from static assets). API calls already route through the main process; embedding inference would run in the renderer or a dedicated worker. Two approaches are viable:

**Option A: Pre-built static index (recommended for v1)**

At build time, a script chunks all documents and songs, generates embeddings using a small embedding model (e.g. `all-MiniLM-L6-v2` via ONNX), and serialises the index as a JSON file bundled with the app. At query time, the user's message is embedded in-browser using the same ONNX model and the top-K chunks are retrieved by cosine similarity.

- Pros: no extra runtime dependency beyond a ~20 MB ONNX embedding model; deterministic
- Cons: index is static — does not reflect user's own songs or runtime context

**Option B: Keyword + heuristic retrieval (pragmatic fallback)**

Without embeddings, a simpler BM25-style or keyword-matching retrieval can cover most cases:
- Extract identifiers from the user's query (note names, effect names, instrument types, directives)
- Retrieve `.bax` example songs that contain matching patterns or instruments
- Always include the docs chunk most relevant to the query keyword (e.g. if user mentions `vib`, include the vibrato section)

This is fully synchronous, zero-dependency, and can be implemented in a few hundred lines.

### Injection Format

Retrieved chunks would be inserted between the language reference and the editor content:

```
You are BeatBax Copilot…
<Language Reference>

[RELEVANT EXAMPLES]
--- graveyard_shift.bax (excerpt: drum patterns) ---
pat drums_funk = kick hat snare hat kick hat snare hat …

--- from docs/instruments.md ---
Noise envelope: env=gb:<vol>,<dir>,<period> …

[EDITOR CONTENT]
…
```

Retrieved content is labelled with its source file so the model can cite it if needed.

### Chunk Management and Token Budget

The total context injected by RAG must fit within the model's context window minus reserved space for the response. With Edit mode sending the **full song** and Ask mode defaulting to **12K** characters (`maxContextChars`):

- System prompt (language ref + mode suffix): ~1500 tokens
- Editor content: full song in Edit mode; up to 12K chars (~3000 tokens) in Ask mode
- Conversation history (10 messages): ~500 tokens
- **Available for RAG chunks**: varies by mode and song size; budget manager drops lower-scoring chunks first

A chunk manager would score and rank all retrieved chunks, then greedily add them to the context until the budget is exhausted. Lower-scoring chunks are silently dropped.

### Implementation Plan (RAG)

1. **Build-time indexer** (`scripts/build-rag-index.mjs`):
   - Reads `docs/**/*.md` and `songs/**/*.bax`
   - Splits into overlapping ~512-token chunks with file + section metadata
   - Optionally generates embeddings if the ONNX backend is available
   - Outputs a bundled static index (e.g. under `apps/desktop/` assets)

2. **Client-side retriever** (`apps/desktop/src/renderer/src/lib/rag-retriever.ts` or shared in app-core):
   - Loads the index lazily on first query
   - Implements keyword match and/or cosine similarity scoring
   - Returns top-K chunks with score and source metadata
   - Exposes `retrieve(query: string, budget: number): RagChunk[]`

3. **Integration into `assembleContext()`** (`copilot-context.ts`):
   - Call `ragRetriever.retrieve(userText, RAG_TOKEN_BUDGET)` before building the prompt
   - Inject results in `[RELEVANT EXAMPLES]` block
   - Fall back gracefully if the index is not loaded (first call, slow network)

4. **Settings toggle** — a checkbox in Settings → AI to enable/disable RAG injection (useful for debugging prompt quality with/without retrieval). Persist under `beatbax:ai.ragEnabled` (proposed).

### RAG Checklist (not yet implemented)

- [ ] Design chunk schema: `{ id, source, section, text, tokens, embedding? }`
- [ ] Write `scripts/build-rag-index.mjs` indexer
- [ ] Choose embedding approach: ONNX `all-MiniLM-L6-v2` vs keyword-only BM25
- [ ] Implement retriever under desktop / app-core (not web-ui `chat-panel.ts`)
- [ ] Integrate retrieval into `assembleContext()` in `copilot-context.ts`
- [ ] Add RAG enable/disable toggle to Settings → AI
- [ ] Measure prompt token counts before and after with real songs
- [ ] Evaluate generation quality improvement with 3–5 representative queries

---

## Testing Strategy

### Implemented

- `apps/desktop/tests/copilot-context.test.ts` — system prompt shape, Ask/Edit truncation, song structure summary
- `apps/desktop/tests/copilot-apply-guard.test.ts` — incomplete Edit-mode reply blocking and snippet merge
- `apps/desktop/tests/e2e/desktop-integration.spec.ts` — Copilot settings and pattern grid (when feature flags enabled)

### Manual Tests

See **[CoPilot test scenarios](../../copilot-test-scenarios.md)** for the full repeatable QA playbook (syntax edits, repair loops, provider errors, settings, local Ollama).

- Confirm "Insert at cursor" inserts generated `pat` at cursor position
- Confirm diagnostics appear verbatim in assembled context
- Test with OpenAI `gpt-5.4-mini` (default) and Groq `openai/gpt-oss-120b` (default)
- Switch curated models in Settings → AI and confirm the Copilot footer label updates
- Choose **Custom...** and enter an arbitrary model ID; confirm it persists across restart
- Test with local Ollama (`qwen2.5-coder:7b`, `num_ctx` ≥ 16k; no API key)
- Verify abort/cancel stops the in-flight request
- Verify Keep / Discard banner after Edit applies

---

## References

- [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat)
- [Groq API (free, OpenAI-compatible)](https://console.groq.com/docs/openai)
- [Ollama REST API](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [LM Studio server docs](https://lmstudio.ai/docs/local-server)
- [Monaco `executeEdits` API](https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor.ICodeEditor.html#executeEdits)
- [marked — Markdown renderer](https://marked.js.org/)
- [DOMPurify — HTML sanitiser](https://github.com/cure53/DOMPurify)
- [all-MiniLM-L6-v2 ONNX embedding model](https://huggingface.co/Xenova/all-MiniLM-L6-v2)
- [CoPilot test scenarios](../../copilot-test-scenarios.md)
- [Local Ollama guide](../copilot-local-ollama.md)
- [Desktop Copilot panel](../../apps/desktop/src/renderer/src/components/panels/DesktopCopilotPanel.tsx)
- [copilot-context.ts](../../apps/desktop/src/renderer/src/lib/copilot-context.ts)
- [chat.store.ts](../../packages/app-core/src/stores/chat.store.ts)
- [StorageKey registry](../../packages/app-core/src/utils/local-storage.ts)
