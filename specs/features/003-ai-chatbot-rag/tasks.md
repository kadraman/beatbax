# Tasks: BeatBax Copilot RAG (Retrieval-Augmented Generation)

**Input**: [spec.md](spec.md), [plan.md](plan.md)

Migrated checklist (normalize to `Tnnn` format as work proceeds):

## Implementation Checklist

- [ ] Design and finalise `RagChunk` schema
- [ ] Write `scripts/build-rag-index.mjs` build-time indexer
  - [ ] Markdown chunking by heading
  - [ ] `.bax` file chunking by section comment
  - [ ] BM25 keyword extraction
  - [ ] Output bundled index JSON
- [ ] Add indexer to desktop or root build script
- [ ] Implement retriever under desktop / app-core
  - [ ] Lazy index loading
  - [ ] BM25 retrieval
  - [ ] `ChunkBudgetManager` token trimming
  - [ ] Singleton export
- [ ] Integrate RAG into `assembleContext()` in `copilot-context.ts`
  - [ ] `[RELEVANT EXAMPLES]` block injection
  - [ ] Graceful fallback when index not loaded
  - [ ] Background index pre-load on Copilot panel show
- [ ] Add RAG settings toggle to Settings → AI
  - [ ] "Enable RAG context" checkbox
  - [ ] Loading indicator while index loads
  - [ ] Persist toggle to `beatbax:ai.ragEnabled`
- [ ] Add `AI_RAG_ENABLED` (or similar) to `StorageKey` in `local-storage.ts`
- [ ] Write `apps/desktop/tests/rag-retriever.test.ts`
- [ ] Extend `copilot-context.test.ts` for RAG injection
- [ ] Choose and document embedding approach (ONNX vs keyword-only BM25)
- [ ] (Phase 2) Implement embedding-based retrieval with `@xenova/transformers`
- [ ] (Phase 2) Add `--embed` flag to build-time indexer
- [ ] Measure prompt token counts before and after with 3–5 representative queries
- [ ] Evaluate generation quality improvement and document findings
- [ ] Update `ai-chatbot-assistant.md` RAG checklist to mark items complete

---
