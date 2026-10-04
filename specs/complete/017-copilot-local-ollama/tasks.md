# Tasks: Copilot — Local models (Ollama)

**Input**: [spec.md](spec.md), [plan.md](plan.md)

Complete. The 2026-10-03 local-Ollama QA run (T020) found Edit-apply problems, fixed in Phase 3 and re-checked on 2026-10-04. The **Discard remaining** residue (former T038) is tracked in [#218](https://github.com/kadraman/beatbax/issues/218).

## Phase 0: Verify shipped behaviour

- [x] T001 Ollama preset + model refresh in Settings → AI
- [x] T002 Local endpoint timeout suitable for cold model load
- [x] T003 Edit-mode incomplete-response guard blocks song wipe

## Phase 1: Docs and settings alignment

- [x] T010 [P] Keep [spec.md](spec.md) model/`num_ctx` tables accurate after Ollama or Copilot changes (2026-10-02: presets match `packages/app-core/src/stores/ai-models.ts`; prompt budget re-measured on `songs/sample.bax`)
- [x] T011 [P] Align Settings → AI help / token-window copy with Ollama `num_ctx` guidance (`apps/desktop/src/renderer/src/components/settings/ai.tsx`)
- [x] T012 Cross-link [docs/qa/copilot-test-scenarios.md](../../../docs/qa/copilot-test-scenarios.md) from Desktop AI settings (same file); fixed the QA doc's relative link to the Ollama guide

## Phase 2: QA gate

- [x] T020 Run Copilot local-Ollama scenarios from `docs/qa/copilot-test-scenarios.md` on a 7B coder model at 16k context (first run 2026-10-03 on `qwen2.5-coder-7b-16k`: findings → Phase 3; re-run 2026-10-04: cards match what reaches the editor; remaining misses are model quality, compared against a cloud model)
- [x] T021 Move to `specs/complete/017-copilot-local-ollama/` when treated as complete docs/ops feature

## Phase 3: Edit apply hardening (spec § Edit apply behaviour with local models)

- [x] T030 Card explanation comes from the first Edit reply; retry replies only fill an empty explanation (`DesktopCopilotPanel.tsx`)
- [x] T031 Drop lines copied from the previous-edit history stub from the explanation (`copilot-edit-explanation.ts` + `tests/copilot-edit-explanation.test.ts`)
- [x] T032 Convert the reply to the editor's line endings before diff / merge / apply (`line-change-diff.ts` `matchLineEndings` + tests)
- [x] T033 On validation failure, apply the definition merge into the current song when it validates, before requesting a parse repair (`DesktopCopilotPanel.tsx`)
- [x] T034 List non-definition lines dropped by the definition merge in a *Not merged* card note (`bax-def-index.ts` `collectUnmergedLines` + tests)
- [x] T035 Show **⚠ Not applied — editor unchanged** with a reason on every Edit exit that does not apply a song (`DesktopCopilotPanel.tsx`)
- [x] T036 Troubleshooting note for leftover `llama-server` processes ([spec.md](spec.md) § Edit mode expectations)
- [x] T037 QA scenarios for the above in [docs/qa/copilot-test-scenarios.md](../../../docs/qa/copilot-test-scenarios.md)
- [x] T039 Context meter popup: **Start a new chat** is a button and only appears when chat history uses the window; with no history it offers **Open AI settings** (fresh Edit chat on `sample.bax` at 16k sits at ~80%) (`copilot-token-budget.ts` `contextBudgetHint` + tests)
- [x] T040 Edit replies with zero line changes show **⚠ Not applied** instead of **✓ Kept in editor**; the missing-song retry asks the model to apply what it described (`DesktopCopilotPanel.tsx`, `copilot-apply-guard.ts`)
- [x] T041 Edit-mode history leaves out earlier Edit turns and prefixes the request with the earlier-requests note; context meter matches (`copilot-history-pack.ts` `earlierEditRequestsNote`, `omitEditTurns` + tests)
- [x] T042 Block reformat-only replies; comment-only warning; explanation-mismatch warning (`DesktopCopilotPanel.tsx`, `line-change-diff.ts` `onlyCommentLinesChanged`, `copilot-edit-changes.ts` `unchangedDefinitionsMentioned` + tests)
- [x] T038 ~~Investigate **Discard remaining** leaving the editor different from the pre-edit song~~ — moved to bug [#218](https://github.com/kadraman/beatbax/issues/218)
