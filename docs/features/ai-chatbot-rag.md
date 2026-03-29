---
title: "Web UI: AI Chatbot RAG (Retrieval-Augmented Generation)"
status: proposed
authors: ["kadraman"]
created: 2026-03-29
issue: "https://github.com/kadraman/beatbax/issues/66"
---

## Summary

Enhance the BeatBax Copilot chat assistant with a client-side Retrieval-Augmented Generation (RAG) layer that injects relevant documentation chunks and example songs into every inference call. The static language reference in the current system prompt covers the core syntax but can miss edge cases, advanced effect usage, and idiomatic patterns found in real songs. RAG closes that gap without increasing the base context size for simple queries.

---

## Problem Statement

The current system prompt for BeatBax Copilot includes a hardcoded language reference (`buildLanguageRef()`). This works well for common tasks but has several limitations:

- The reference is a static snapshot — it does not update automatically when new features are added to the language.
- It cannot include full song examples (too large to always include).
- Advanced effect presets, instrument archetypes, and section-based composition patterns are not fully covered.
- As the language grows (new chips, new effects, new export targets), keeping `buildLanguageRef()` complete by hand becomes a maintenance burden.

A RAG layer addresses all of these by retrieving the most relevant documentation and example songs at query time and injecting only the pieces that matter for the current user request.

---

## Proposed Solution

### Summary

A **pre-built static index** (Option A from the `ai-chatbot-assistant.md` analysis) is the recommended approach for v1. At build time, a script reads all documentation and example songs, splits them into overlapping chunks, and optionally generates embeddings with a small ONNX embedding model. The index is serialised to a JSON file bundled as a static asset. At query time, the user's message is compared against the index and the top-K highest-scoring chunks are injected into `assembleContext()` under a `[RELEVANT EXAMPLES]` block.

A simpler keyword/BM25 fallback (Option B) is implemented first — it requires no model download and handles the majority of queries well. Embedding-based retrieval can be layered on top later.

### Retrieval Corpus

| Source | Content | Chunk strategy |
|---|---|---|
| `docs/*.md` | Core language spec, scheduler, instruments, effects, exports | Split by `##` heading, 512-token max |
| `docs/features/*.md` | Feature-specific syntax (metadata, volume, logger, etc.) | Split by `##` heading |
| `songs/*.bax` | Full annotated example songs | Whole file if < 512 tokens; else split by `#` comment sections |
| `songs/features/*.bax` | Feature demonstration songs | Whole file |
| `songs/effects/*.bax` | Effect showcase songs | Whole file |

### Chunk Schema

```typescript
interface RagChunk {
  id: string;           // unique, e.g. "docs/instruments.md#2"
  source: string;       // relative path, e.g. "docs/instruments.md"
  section: string;      // heading or filename, e.g. "## Noise Channel"
  text: string;         // raw chunk content
  tokens: number;       // approximate token count (chars / 4)
  keywords: string[];   // extracted lowercase identifiers for BM25
  embedding?: number[]; // optional: unit-normalised float32 vector
}
```

### Retrieval Strategy

**Phase 1 — Keyword/BM25 (implemented first):**

1. Tokenise the user's query into lowercase words and identifiers.
2. Score each chunk by BM25 (term frequency × inverse document frequency).
3. Boost chunks whose `source` path matches a keyword (e.g. query "vibrato" boosts `instruments.md` and `vib`-containing `.bax` files).
4. Return top-K chunks ranked by score.

**Phase 2 — Embedding-based retrieval (layered on, optional):**

1. Load `all-MiniLM-L6-v2` via the `@xenova/transformers` ONNX runtime (lazy, first query).
2. Embed the user's query to a 384-dimensional unit vector.
3. Compute cosine similarity against all stored embeddings in the index.
4. Merge BM25 and embedding scores with configurable weights (`α·bm25 + (1-α)·cosine`).

### Token Budget

The total injected RAG content must stay within the available context window:

| Component | Approximate tokens |
|---|---|
| System prompt (language ref + mode suffix) | ~1500 |
| Editor content (capped at 3000 chars) | ~750 |
| Conversation history (last 10 messages) | ~500 |
| **Available for RAG** | **~4000–5000** |

A `ChunkBudgetManager` greedily adds chunks in ranked order until the budget (configurable, default 3500 tokens) is exhausted. Lower-scoring chunks are silently dropped.

### Injection Format

Retrieved chunks are injected between the language reference and the editor content in `assembleContext()`:

```
You are BeatBax Copilot…
<Language Reference>

[RELEVANT EXAMPLES]
--- songs/graveyard_shift.bax (drum patterns) ---
pat drums_funk = kick hat snare hat kick hat snare hat …

--- docs/instruments.md § Noise Channel ---
Noise envelope: env=gb:<vol>,<dir>,<period> …

[EDITOR CONTENT]
…bax
…
```

Each chunk is labelled with its source path and section so the model can cite it if needed.

### Settings Toggle

A checkbox in the chat panel's settings form enables or disables RAG injection. Disabled by default until the index has loaded; automatically enabled once loading completes. The toggle state is persisted to `localStorage` under `bb-ai-rag-enabled`.

---

## Implementation Plan

### 1. Build-time indexer — `scripts/build-rag-index.mjs`

- Node.js ESM script, no external build system dependency.
- Reads `docs/**/*.md` and `songs/**/*.bax` using glob.
- Splits markdown by `##`/`###` headings with 512-token max; overlaps adjacent chunks by 64 tokens.
- Splits `.bax` files by `# section` comment lines or whole-file if short.
- Computes BM25 keyword list per chunk.
- Optionally generates embeddings via `@xenova/transformers` (gated by `--embed` CLI flag).
- Outputs `apps/web-ui/public/rag-index.json`.
- Runs as part of `npm run build` (added to `prebuild` script in `apps/web-ui/package.json`).

### 2. Client-side retriever — `apps/web-ui/src/utils/rag-retriever.ts`

```typescript
export interface RagChunk { /* see schema above */ }
export interface RetrieveOptions {
  topK?: number;       // default 5
  budget?: number;     // token budget, default 3500
  useEmbedding?: boolean;
}
export class RagRetriever {
  async load(): Promise<void>;           // fetch + parse rag-index.json lazily
  retrieve(query: string, opts?: RetrieveOptions): RagChunk[];
  isLoaded(): boolean;
}
```

- Lazy-loads `rag-index.json` on first call to `retrieve()`.
- Implements BM25 scoring internally; embedding scoring via optional ONNX pipeline.
- Applies `ChunkBudgetManager` to trim results to the token budget.
- Exported as a singleton (`export const ragRetriever = new RagRetriever()`).

### 3. Integration into `assembleContext()` — `apps/web-ui/src/panels/chat-panel.ts`

- Import `ragRetriever` singleton.
- In `assembleContext()`, if RAG is enabled and `ragRetriever.isLoaded()`, call `ragRetriever.retrieve(userText, { budget: RAG_TOKEN_BUDGET })`.
- Format retrieved chunks into the `[RELEVANT EXAMPLES]` block.
- Fall back gracefully (skip block) if the index is not loaded or retrieval returns empty.
- Start background loading of the index when the chat panel is first shown.

### 4. Settings UI update — `apps/web-ui/src/panels/chat-panel.ts`

- Add "Enable RAG context" checkbox to the settings panel.
- Show a loading indicator ("Loading knowledge base…") while `rag-index.json` is being fetched.
- Show chunk count and index size in settings for transparency.
- Persist toggle to `localStorage` under `bb-ai-rag-enabled`.

### 5. Web UI package dependency update — `apps/web-ui/package.json`

- Add `@xenova/transformers` as an optional dependency (only needed for embedding-based retrieval).
- Gate embedding generation behind `useEmbedding: true` option — keyword BM25 has no new dependencies.

---

## Testing Strategy

### Unit Tests — `apps/web-ui/tests/rag-retriever.test.ts`

- `RagRetriever` initialises with empty index; `isLoaded()` returns `false`.
- `load()` fetches and parses a mock `rag-index.json`.
- BM25 keyword scoring: query "vibrato" returns chunk containing "vib" before unrelated chunks.
- Token budget management: chunks are dropped when budget is exceeded.
- `retrieve()` returns empty array before `load()` completes (graceful fallback).

### Unit Tests — `apps/web-ui/tests/chat-panel-rag.test.ts`

- `assembleContext()` with RAG enabled includes `[RELEVANT EXAMPLES]` block.
- `assembleContext()` with RAG disabled omits `[RELEVANT EXAMPLES]` block.
- `assembleContext()` falls back silently when `ragRetriever.isLoaded()` is `false`.

### Integration Tests

- Run `scripts/build-rag-index.mjs` against actual `docs/` and `songs/` directories; verify output JSON structure matches `RagChunk` schema.
- Verify total token count of all chunks stays within expected bounds.

### Manual Tests

- Enable RAG and ask "how do I write a drum pattern with kicks and snares?" — verify graveyard_shift.bax excerpt appears in the prompt (visible via browser DevTools Network tab).
- Ask about `vib` effect — verify instruments.md vibrato section is retrieved.
- Verify disabling RAG removes the `[RELEVANT EXAMPLES]` block from the prompt.
- Test with a large song in the editor to confirm token budget is respected.

---

## Implementation Checklist

- [ ] Design and finalise `RagChunk` schema
- [ ] Write `scripts/build-rag-index.mjs` build-time indexer
  - [ ] Markdown chunking by heading
  - [ ] `.bax` file chunking by section comment
  - [ ] BM25 keyword extraction
  - [ ] Output `rag-index.json`
- [ ] Add indexer to `prebuild` script in `apps/web-ui/package.json`
- [ ] Implement `apps/web-ui/src/utils/rag-retriever.ts`
  - [ ] Lazy index loading
  - [ ] BM25 retrieval
  - [ ] `ChunkBudgetManager` token trimming
  - [ ] Singleton export
- [ ] Integrate RAG into `assembleContext()` in `chat-panel.ts`
  - [ ] `[RELEVANT EXAMPLES]` block injection
  - [ ] Graceful fallback when index not loaded
  - [ ] Background index pre-load on panel show
- [ ] Add RAG settings toggle to chat panel settings UI
  - [ ] "Enable RAG context" checkbox
  - [ ] Loading indicator while index fetches
  - [ ] Persist toggle to `localStorage`
- [ ] Add `bb-ai-rag-enabled` to `StorageKey` enum in `local-storage.ts`
- [ ] Write `apps/web-ui/tests/rag-retriever.test.ts`
- [ ] Write `apps/web-ui/tests/chat-panel-rag.test.ts`
- [ ] Choose and document embedding approach (ONNX vs keyword-only BM25)
- [ ] (Phase 2) Implement embedding-based retrieval with `@xenova/transformers`
- [ ] (Phase 2) Add `--embed` flag to build-time indexer
- [ ] Measure prompt token counts before and after with 3–5 representative queries
- [ ] Evaluate generation quality improvement and document findings
- [ ] Update `ai-chatbot-assistant.md` RAG checklist to mark items complete

---

## Future Enhancements

- **User song corpus** — allow users to add their own `.bax` files to the retrieval index via a drag-and-drop interface.
- **Dynamic re-indexing** — watch `docs/` and `songs/` for changes during development and rebuild the index automatically.
- **Hybrid reranking** — use a cross-encoder model (`ms-marco-MiniLM`) to rerank the top-20 BM25 candidates to top-5 for higher precision.
- **Source citation in responses** — instruct the model to cite retrieved chunk sources in its answers (e.g. "According to `instruments.md`…").
- **Per-feature toggle** — allow users to disable retrieval from specific source directories (e.g. disable song examples, keep only docs).

---

## Open Questions

- Should the RAG index be committed to the repository or generated at build time only (`.gitignore`d)?
  - Recommendation: generate at build time, add `apps/web-ui/public/rag-index.json` to `.gitignore`. CI regenerates it.
- Should embedding generation be part of the default CI build?
  - Recommendation: No for v1. BM25 requires no model download and is fast. Embeddings are an optional Phase 2 step.
- What is the right chunk overlap to balance coherence vs index size?
  - Starting point: 64-token overlap, benchmark against 0 and 128.
- Should the index be versioned (hash in filename) to bust CDN caches on rebuild?
  - Recommendation: Yes — use a content hash suffix: `rag-index.<hash>.json`.

---

## References

- [AI Chatbot Assistant spec](./ai-chatbot-assistant.md) — parent feature document; RAG section describes original motivation
- [BM25 algorithm](https://en.wikipedia.org/wiki/Okapi_BM25) — term-frequency/IDF scoring
- [all-MiniLM-L6-v2 via @xenova/transformers](https://huggingface.co/Xenova/all-MiniLM-L6-v2) — client-side ONNX embedding model
- [Transformers.js docs](https://huggingface.co/docs/transformers.js) — ONNX inference in the browser
- [Chat panel implementation](../../apps/web-ui/src/panels/chat-panel.ts)
- [StorageKey registry](../../apps/web-ui/src/utils/local-storage.ts)
