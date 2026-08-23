---
"@beatbax/app-core": patch
---

Expand Copilot store, settings, and editor hooks for multi-session chats, token budgeting, and per-change edit review (monorepo internal).

- Add `CopilotSession` persistence (`beatbax:ai.sessions`, `beatbax:ai.activeSessionId`) with create/switch/delete helpers and per-session token totals.
- Extend `AISettings` with `contextWindowTokens`; add provider defaults via `defaultContextWindowTokens()` and `DEFAULT_CONTEXT_WINDOW_TOKENS`.
- Persist richer applied-edit metadata on chat messages (`changeDetails`, `applyExplanation`, `applyNotes`, `usage`, `documentName`, `undoneInEditor`).
- Add review helpers: `setCopilotReviewActive()`, `resolveStuckPendingAppliedEdits()`, and `markLastAppliedEditUndoneInEditor()`.
- Register optional **BeatBax: Add Selection to Copilot** in the command palette; emit `copilot:add-selection` on the event bus.
