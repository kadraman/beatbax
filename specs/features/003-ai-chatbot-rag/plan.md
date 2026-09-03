# Implementation Plan: BeatBax Copilot RAG (Retrieval-Augmented Generation)

**Spec**: [spec.md](spec.md) | **Migrated**: 2026-09-03

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [ ] No invented syntax or undocumented language behavior
- [ ] AST / ISM / scheduler / expansion impact identified (or N/A)
- [ ] Plugins remain isolated; core does not gain plugin dependencies
- [ ] Determinism and compatibility preserved (or migration documented)
- [ ] Tests planned for new behavior

## Implementation Plan

### 1. Build-time indexer — `scripts/build-rag-index.mjs`

- Node.js ESM script, no external build system dependency.
- Reads `docs/**/*.md` and `songs/**/*.bax` using glob.
- Splits markdown by `##`/`###` headings with 512-token max; overlaps adjacent chunks by 64 tokens.
- Splits `.bax` files by `# section` comment lines or whole-file if short.
- Computes BM25 keyword list per chunk.
- Optionally generates embeddings via `@xenova/transformers` (gated by `--embed` CLI flag).
- Outputs a bundled static index (e.g. under `apps/desktop/` assets).
- Runs as part of desktop build (or shared prebuild script).

### 2. Client-side retriever — `apps/desktop/src/renderer/src/lib/rag-retriever.ts` (or shared in app-core)

```typescript
export interface RagChunk { /* see schema above */ }
export interface RetrieveOptions {
  topK?: number;       // default 5
  budget?: number;     // token budget, default 3500
  useEmbedding?: boolean;
}
export class RagRetriever {
  async load(): Promise<void>;           // load bundled rag-index.json lazily
  retrieve(query: string, opts?: RetrieveOptions): RagChunk[];
  isLoaded(): boolean;
}
```

- Lazy-loads the index on first call to `retrieve()`.
- Implements BM25 scoring internally; embedding scoring via optional ONNX pipeline.
- Applies `ChunkBudgetManager` to trim results to the token budget.
- Exported as a singleton (`export const ragRetriever = new RagRetriever()`).

### 3. Integration into `assembleContext()` — `apps/desktop/src/renderer/src/lib/copilot-context.ts`

- Import `ragRetriever` singleton.
- In `assembleContext()`, if RAG is enabled and `ragRetriever.isLoaded()`, call `ragRetriever.retrieve(userText, { budget: RAG_TOKEN_BUDGET })`.
- Format retrieved chunks into the `[RELEVANT EXAMPLES]` block.
- Fall back gracefully (skip block) if the index is not loaded or retrieval returns empty.
- Start background loading of the index when the Copilot panel is first shown (`DesktopCopilotPanel.tsx`).

### 4. Settings UI update — `apps/desktop/src/renderer/src/components/settings/ai.tsx`

- Add "Enable RAG context" checkbox to Settings → AI.
- Show a loading indicator ("Loading knowledge base…") while the index is being loaded.
- Show chunk count and index size in settings for transparency.
- Persist toggle to `beatbax:ai.ragEnabled`.

### 5. Optional dependency

- Add `@xenova/transformers` as an optional dependency (only needed for embedding-based retrieval).
- Gate embedding generation behind `useEmbedding: true` option — keyword BM25 has no new dependencies.

---

## Testing Strategy

### Unit Tests — `apps/desktop/tests/rag-retriever.test.ts` (proposed)

- `RagRetriever` initialises with empty index; `isLoaded()` returns `false`.
- `load()` parses a mock index file.
- BM25 keyword scoring: query "vibrato" returns chunk containing "vib" before unrelated chunks.
- Token budget management: chunks are dropped when budget is exceeded.
- `retrieve()` returns empty array before `load()` completes (graceful fallback).

### Unit Tests — extend `apps/desktop/tests/copilot-context.test.ts`

- `assembleContext()` with RAG enabled includes `[RELEVANT EXAMPLES]` block.
- `assembleContext()` with RAG disabled omits `[RELEVANT EXAMPLES]` block.
- `assembleContext()` falls back silently when `ragRetriever.isLoaded()` is `false`.

### Integration Tests

- Run `scripts/build-rag-index.mjs` against actual `docs/` and `songs/` directories; verify output JSON structure matches `RagChunk` schema.
- Verify total token count of all chunks stays within expected bounds.

### Manual Tests

See [copilot-test-scenarios.md](../copilot-test-scenarios.md) for general Copilot QA. RAG-specific checks:

- Enable RAG and ask "how do I write a drum pattern with kicks and snares?" — verify a graveyard_shift.bax excerpt appears in the assembled prompt (via dev logging or temporary debug UI).
- Ask about `vib` effect — verify instruments.md vibrato section is retrieved.
- Verify disabling RAG removes the `[RELEVANT EXAMPLES]` block from the prompt.
- Test with a large song in the editor to confirm token budget is respected.

---
