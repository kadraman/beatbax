---
title: "Web UI: AI Chatbot Assistant (BeatBax Copilot)"
status: implemented
authors: ["kadraman"]
created: 2026-03-21
updated: 2026-03-29
issue: "https://github.com/kadraman/beatbax/issues/61"
---

## Summary

An AI chat assistant in the BeatBax Web UI that helps users write, edit, and debug `.bax` song scripts. The assistant uses any **OpenAI-compatible REST API endpoint** (OpenAI, Groq, Mistral, Ollama, LM Studio, llama.cpp, etc.) — no on-device model required. It understands the full BeatBax language syntax, has access to the current editor content and active parse/validation errors, and can automatically apply generated code back into the editor with self-correction retry on parse failures.

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

| Preset label | Endpoint | Default model |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Groq (free, fast) | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Ollama (local) | `http://localhost:11434/v1` | `llama3.2` |
| LM Studio (local) | `http://localhost:1234/v1` | `local-model` |

Any OpenAI-compatible endpoint can also be entered manually. Connection settings (endpoint URL, API key, model ID) are persisted to `localStorage` under key `bb-ai-settings`.

---

## Problem Statement

The BeatBax language has a non-trivial surface area: instruments, patterns, sequences, transforms, channel routing, and effect syntax. New users — and experienced ones working on complex songs — have no in-editor assistance when they get stuck. Error messages are surfaced as Monaco markers, but they don't explain root causes or suggest fixes. There is no way to ask "generate a bass pattern in C minor" or "why is my channel 3 playing the wrong notes?"

---

## Implemented Solution

### Chat Panel

A **Chat Panel** is a collapsible right-side panel alongside the Channel Mixer. It renders a conversation thread with a text input. The user can ask questions or request code generation in two modes:

- **Edit mode** — the AI outputs a complete updated song in a ` ```bax ``` ` block that is automatically applied to the editor. Self-correction runs up to 4 times if the generated code has parse errors.
- **Ask mode** — the AI answers questions and can include code snippets, but does not auto-apply anything.

The mode toggle is persisted to `localStorage` key `bb-ai-mode`.

### Context Injection

On every inference call, `assembleContext()` builds the system prompt as follows:

```
You are BeatBax Copilot, an assistant for the BeatBax live-coding chiptune language.
<BeatBax Language Reference — chip-aware, see below>

<EDIT_SYSTEM_SUFFIX or ASK_SYSTEM_SUFFIX — see below>

[EDITOR CONTENT]
```bax
<current Monaco model value, truncated to 3000 characters if longer>
```

[DIAGNOSTICS]
  error   line 5, col 3: Unknown instrument 'fuzz'
  warning line 9, col 1: Channel 3 has no instrument assigned
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
- `chip`, `bpm`, `volume`, `time`, `ticksPerStep` with defaults
- Rule: omit any directive whose value equals the default (never write `volume 1.0`, `time 4`, `ticksPerStep 16`)

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

In Edit mode, after the AI generates a response, the panel validates the extracted `.bax` code using the engine's `parse()` and `resolveSong()` functions. If errors are found, it feeds the error messages back to the AI and asks it to correct them — up to **4 attempts**:

```typescript
const MAX_SELF_CORRECTION_ATTEMPTS = 4;

for (let attempt = 0; attempt < MAX_SELF_CORRECTION_ATTEMPTS; attempt++) {
  const errs = this.validateBax(baxCode);
  if (errs === null) break;
  // On the final attempt, give up rather than apply invalid code.
  if (attempt === MAX_SELF_CORRECTION_ATTEMPTS - 1) {
    baxCode = null;
    break;
  }
  // show status: ⚠ Parse errors — self-correcting (N/4)…
  appendMessages = [
    ...appendMessages,
    { role: 'assistant', content: response },
    { role: 'user', content:
        `The BeatBax code you generated has parse errors. Fix them and output the
         corrected complete song in a \`\`\`bax block.\n\nParse errors:\n${errs}` },
  ];
  response = await generate(text, appendMessages);
  baxCode = extractBaxCode(response);
}
// baxCode is non-null only if a validated (error-free) candidate was found.
```

Retry exchanges do **not** pollute the visible conversation history.

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

The panel calls the configured endpoint's `/chat/completions` endpoint directly from the browser:

```typescript
const url = `${this.settings.endpoint}/chat/completions`;
const headers: Record<string, string> = { 'Content-Type': 'application/json' };
if (this.settings.apiKey) {
  headers['Authorization'] = `Bearer ${this.settings.apiKey}`;
}

const res = await fetch(url, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    model: this.settings.model,
    messages,          // system + history (last 10) + user + optional correction turns
    temperature: 0.7,
    max_tokens: 1024,
    stream: false,
  }),
  signal: this.abortController.signal,
});
```

The API key is only included if non-empty (Ollama/LM Studio don't require one). Requests can be cancelled via the abort controller (stop button in the UI).

---

## Implemented Files

| File | Status | Notes |
|---|---|---|
| `apps/web-ui/src/panels/chat-panel.ts` | ✅ Complete | Full UI, API integration, context assembly, self-correction |
| `apps/web-ui/src/utils/feature-flags.ts` | ✅ Complete | URL param + localStorage feature flag helpers |
| `apps/web-ui/src/utils/local-storage.ts` | ✅ Updated | `AI_ASSISTANT` storage key added; `WEBLLM_MODEL` removed (WebLLM approach abandoned) |
| `apps/web-ui/src/ui/menu-bar.ts` | ✅ Updated | `View → AI Assistant` toggle added |
| `apps/web-ui/src/main.ts` | ✅ Updated | `ChatPanel` instantiated and wired |

No engine changes were required. `parse()` and `resolveSong()` from `@beatbax/engine` are imported directly by `chat-panel.ts` for validation.

---

## UX Notes

- **Settings panel** — a ⚙ gear icon opens an inline settings form where the user can choose a preset provider or enter a custom endpoint, API key, and model ID. Settings are saved on change.
- **Edit / Ask mode toggle** — a toggle button in the panel header switches modes; persisted to localStorage.
- **Auto-apply with diff highlighting** — in Edit mode, the returned code is applied directly to the editor. Changed lines are highlighted briefly. For fresh song creation (empty editor), highlights are skipped.
- **Undo** — auto-applied changes can be undone via the standard editor undo (Ctrl+Z).
- **Loading state** — while the model is generating, the send button shows a spinner and the input is disabled. A stop button cancels the request.
- **Clear conversation** — a "Clear" button resets the message history.
- **Markdown rendering** — assistant responses are rendered as HTML via `marked` + sanitised with `DOMPurify` to prevent XSS.

---

## Security Considerations

- **API key storage** — the API key is stored in `localStorage` (plaintext). This is acceptable for a local dev tool but users should be informed not to use production keys with high spend limits.
- **CORS** — the browser's fetch will be subject to CORS policy on the chosen endpoint. OpenAI and Groq allow browser requests; Ollama/LM Studio may require CORS headers to be enabled server-side.
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

Since BeatBax Copilot runs in the browser with no server backend, RAG must be entirely client-side. Two approaches are viable:

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

The total context injected by RAG must fit within the model's context window minus reserved space for the response. With `max_tokens: 1024` and a typical 8K context window:

- System prompt (language ref + mode suffix): ~1500 tokens
- Editor content (capped at 3000 chars): ~750 tokens
- Conversation history (10 messages): ~500 tokens
- **Available for RAG chunks**: ~4000–5000 tokens (~3000–4000 chars)

A chunk manager would score and rank all retrieved chunks, then greedily add them to the context until the budget is exhausted. Lower-scoring chunks are silently dropped.

### Implementation Plan (RAG)

1. **Build-time indexer** (`scripts/build-rag-index.mjs`):
   - Reads `docs/**/*.md` and `songs/**/*.bax`
   - Splits into overlapping ~512-token chunks with file + section metadata
   - Optionally generates embeddings if the ONNX backend is available
   - Outputs `apps/web-ui/public/rag-index.json`

2. **Client-side retriever** (`apps/web-ui/src/utils/rag-retriever.ts`):
   - Loads `rag-index.json` lazily on first query
   - Implements keyword match and/or cosine similarity scoring
   - Returns top-K chunks with score and source metadata
   - Exposes `retrieve(query: string, budget: number): RagChunk[]`

3. **Integration into `assembleContext()`**:
   - Call `ragRetriever.retrieve(userText, RAG_TOKEN_BUDGET)` before building the prompt
   - Inject results in `[RELEVANT EXAMPLES]` block
   - Fall back gracefully if the index is not loaded (first call, slow network)

4. **Settings toggle** — a checkbox in the chat panel settings to enable/disable RAG injection (useful for debugging prompt quality with/without retrieval).

### RAG Checklist (not yet implemented)

- [ ] Design chunk schema: `{ id, source, section, text, tokens, embedding? }`
- [ ] Write `scripts/build-rag-index.mjs` indexer
- [ ] Choose embedding approach: ONNX `all-MiniLM-L6-v2` vs keyword-only BM25
- [ ] Implement `apps/web-ui/src/utils/rag-retriever.ts`
- [ ] Integrate retrieval into `assembleContext()` in `chat-panel.ts`
- [ ] Add RAG enable/disable toggle to settings panel
- [ ] Measure prompt token counts before and after with real songs
- [ ] Evaluate generation quality improvement with 3–5 representative queries

---

## Testing Strategy

### Implemented

- `chat-panel.test.ts`
  - Panel renders correctly; root element appended to container
  - `assembleContext()` produces correct system prompt shape with `[SYSTEM]`, `[EDITOR CONTENT]`, and `[DIAGNOSTICS]` sections
  - Editor content truncated to ≤ 3000 characters; `[truncated]` marker appended
  - Diagnostics formatted as `line N, col N: message`; empty list shows "No current errors or warnings."
  - Insert/replace callbacks invoked with extracted code block text
  - `splitContent()` splits plain text, single `\`\`\`bax` blocks, and multiple blocks into typed segments
  - Self-correction loop: invalid code is not applied when all retry attempts are exhausted (`baxCode` set to `null`)

- `feature-flags.test.ts`
  - `isFeatureEnabled` returns `false` by default
  - `setFeatureEnabled(true)` persists; subsequent call returns `true`
  - URL param `?ai=1` enables regardless of storage; `?ai=0` disables
  - Only `?ai=1` and `?ai=0` are recognised; other values (e.g. `?ai=false`, `?ai=`) fall through to localStorage

### Manual Tests

- Confirm "Insert at cursor" inserts generated `pat` at cursor position
- Confirm diagnostics appear verbatim in assembled context
- Test with OpenAI `gpt-4o-mini` and Groq `llama-3.3-70b-versatile`
- Test with local Ollama (no API key path)
- Verify abort/cancel stops the fetch

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
- [Existing HelpPanel implementation](../../apps/web-ui/src/panels/help-panel.ts)
- [chat-panel.ts implementation](../../apps/web-ui/src/panels/chat-panel.ts)
- [DiagnosticsManager](../../apps/web-ui/src/editor/diagnostics.ts)
- [StorageKey registry](../../apps/web-ui/src/utils/local-storage.ts)
