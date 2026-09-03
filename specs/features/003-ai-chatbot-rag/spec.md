---
title: "BeatBax Copilot RAG (Retrieval-Augmented Generation)"
id: 3
slug: "ai-chatbot-rag"
status: "specified"
authors:
  - "kadraman"
created: "2026-03-29"
updated: "2026-09-03"
issue: "https://github.com/kadraman/beatbax/issues/66"
area: "desktop"
---
## Summary

Enhance **BeatBax Copilot** (desktop app) with a client-side Retrieval-Augmented Generation (RAG) layer that injects relevant documentation chunks and example songs into every inference call. The static language reference in `copilot-context.ts` covers core syntax but can miss edge cases, advanced effect usage, and idiomatic patterns found in real songs. RAG closes that gap without increasing the base context size for simple queries.

---

## Problem Statement

The current system prompt for BeatBax Copilot includes a hardcoded language reference (`buildLanguageRef()` in `apps/desktop/src/renderer/src/lib/copilot-context.ts`). This works well for common tasks but has several limitations:

- The reference is a static snapshot — it does not update automatically when new features are added to the language.
- It cannot include full song examples (too large to always include).
- Advanced effect presets, instrument archetypes, and section-based composition patterns are not fully covered.
- As the language grows (new chips, new effects, new export targets), keeping `buildLanguageRef()` complete by hand becomes a maintenance burden.

A RAG layer addresses all of these by retrieving the most relevant documentation and example songs at query time and injecting only the pieces that matter for the current user request.

---

## Proposed Solution

### Summary

A **pre-built static index** (Option A from the `ai-chatbot-assistant.md` analysis) is the recommended approach for v1. At build time, a script reads all documentation and example songs, splits them into overlapping chunks, and optionally generates embeddings with a small ONNX embedding model. The index is bundled as a static asset in the desktop app. At query time, the user's message is compared against the index and the top-K highest-scoring chunks are injected into `assembleContext()` under a `[RELEVANT EXAMPLES]` block.

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
  id: string;           // unique, e.g. "docs/language/instruments.md#2"
  source: string;       // relative path, e.g. "docs/language/instruments.md"
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
| Editor content | Full song in Edit mode; up to 12K chars (~3000 tokens) in Ask mode |
| Conversation history (last 10 messages) | ~500 |
| **Available for RAG** | **Varies by mode and song size** |

A `ChunkBudgetManager` greedily adds chunks in ranked order until the budget (configurable, default 3500 tokens) is exhausted. Lower-scoring chunks are silently dropped.

### Injection Format

Retrieved chunks are injected between the language reference and the editor content in `assembleContext()` (`copilot-context.ts`):

```
You are BeatBax Copilot…
<Language Reference>

[RELEVANT EXAMPLES]
--- songs/graveyard_shift.bax (drum patterns) ---
pat drums_funk = kick hat snare hat kick hat snare hat …

--- docs/language/instruments.md § Noise Channel ---
Noise envelope: env=gb:<vol>,<dir>,<period> …

[EDITOR CONTENT]
…bax
…
```

Each chunk is labelled with its source path and section so the model can cite it if needed.

### Settings Toggle

A checkbox in **Settings → AI** enables or disables RAG injection. Disabled by default until the index has loaded; automatically enabled once loading completes. The toggle state would be persisted under `beatbax:ai.ragEnabled` (proposed key in `packages/app-core/src/utils/local-storage.ts`).

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
  - Recommendation: generate at build time, add index path to `.gitignore`. CI regenerates it.
- Should embedding generation be part of the default CI build?
  - Recommendation: No for v1. BM25 requires no model download and is fast. Embeddings are an optional Phase 2 step.
- What is the right chunk overlap to balance coherence vs index size?
  - Starting point: 64-token overlap, benchmark against 0 and 128.
- Should the index be versioned (hash in filename) to bust caches on rebuild?
  - Recommendation: Yes — use a content hash suffix: `rag-index.<hash>.json`.

---

## References

- [AI Chatbot Assistant spec](../../../docs/features/complete/ai-chatbot-assistant.md) — parent feature document; RAG section describes original motivation
- [Local Ollama guide](../017-copilot-local-ollama/spec.md)
- [CoPilot test scenarios](../../../docs/qa/copilot-test-scenarios.md)
- [BM25 algorithm](https://en.wikipedia.org/wiki/Okapi_BM25) — term-frequency/IDF scoring
- [all-MiniLM-L6-v2 via @xenova/transformers](https://huggingface.co/Xenova/all-MiniLM-L6-v2) — client-side ONNX embedding model
- [Transformers.js docs](https://huggingface.co/docs/transformers.js) — ONNX inference in the browser/Electron renderer
- [copilot-context.ts](../../../apps/desktop/src/renderer/src/lib/copilot-context.ts)
- [DesktopCopilotPanel.tsx](../../../apps/desktop/src/renderer/src/components/panels/DesktopCopilotPanel.tsx)
- [StorageKey registry](../../../packages/app-core/src/utils/local-storage.ts)
