# Tasks: Copilot request controls and budget diagnostics

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn [P?] [USn?] Description` with **exact repo paths**.

- **[P]**: can run in parallel (different files, no shared-write dependency)
- **[USn]**: maps to a user story in spec.md

## Phase 0: Foundation (blocks stories)

- [x] T001 [P] Add `reasoningEffort?` to `AIChatCompletionRequest`; `finishReason?`, `reasoningPresent?`, `effectiveReasoningEffort?`, `tokenParam?` to `AIChatCompletionResult`; `reasoningTokens?` to `AIChatCompletionUsage` in `apps/desktop/src/shared/electron-api.ts`
- [x] T002 Parse `choices[0].finish_reason`, `usage.completion_tokens_details.reasoning_tokens`, and non-empty `choices[0].message.reasoning` / `reasoning_content` in `apps/desktop/src/shared/ai-chat-completion.ts` (`parseAIChatUsage`, `parseAIChatCompletionResponse`, `normalizeAIChatCompletionResult`); tests in `apps/desktop/tests/ai-chat-completion.test.ts` (FR-001)
- [x] T003 [P] New `apps/desktop/src/shared/ai-request-negotiation.ts`: `ReasoningEffortLevel`, `REASONING_EFFORT_FALLBACKS`, `nextReasoningEffortValue`, `isReasoningEffortRejection`, `NegotiationState`, `negotiationKey`, `usesCompletionTokensParam`; tests in `apps/desktop/tests/ai-request-negotiation.test.ts` (FR-008–FR-010)
- [x] T004 Add `reasoningTokens?` and `reasoningPresent?` to `ChatTokenUsage` and merge them in `addTokenUsage` / `sanitizeUsage` in `packages/app-core/src/stores/chat.store.ts`

**Checkpoint**: finish reason and reasoning signals reach the renderer; negotiation helpers exist but are unused; no behavior change yet.

## Phase 1: User Story 1 — Understand an out-of-budget failure (P1)

- [x] T010 [US1] New `apps/desktop/src/renderer/src/lib/copilot-budget-diagnostics.ts` with `describeLengthStop` (reasoning tokens, else reasoning flag); tests in `apps/desktop/tests/copilot-budget-diagnostics.test.ts`
- [x] T011 [US1] In `apps/desktop/src/renderer/src/components/panels/DesktopCopilotPanel.tsx`, keep `finishReason` from `generate()`; on `"length"` in Edit mode show the diagnostic, mark `applyBlocked`, and skip no-bax / parse / incomplete repair loops (FR-002, FR-003)
- [x] T012 [US1] Ask mode: append a cut-off notice when `finishReason === "length"` in `DesktopCopilotPanel.tsx`
- [x] T013 [US1] Show reasoning tokens (or `· thinking`) in `MessageUsage` badge and title in `DesktopCopilotPanel.tsx` (FR-004)
- [x] T014 [US1] Add `checkReplyFits` to `apps/desktop/src/renderer/src/lib/copilot-budget-diagnostics.ts` with tests (FR-017); in `DesktopCopilotPanel.tsx`, run it before Edit sends and show the warning with Send anyway / Open Settings and a per-chat dismissal key (depends on T021)

**Checkpoint**: SC-001 passes manually with a forced small budget; SC-006 passes in tests.

## Phase 2: User Story 2 — Adjust reply budget and reasoning effort (P2)

- [x] T020 [US2] Extend `AISettings` with `editReplyTokens`, `askReplyTokens`, `reasoningEffort`, `reasoningEffortCustom`; load/save/clamp/validate with Auto defaults in `packages/app-core/src/stores/chat.store.ts` (FR-007, FR-008, FR-015); tests for legacy settings and invalid Custom values
- [x] T021 [US2] Add `estimatePromptTokens`, `resolveReplyBudget` (with window fitting) and `resolveReasoningEffort` to `apps/desktop/src/renderer/src/lib/copilot-token-budget.ts`; switch `estimateContextBudget` to the new prompt estimate; tests in `apps/desktop/tests/copilot-token-budget.test.ts` (FR-006, FR-016, SC-007)
- [x] T022 [US2] Send resolved `maxTokens` and `reasoningEffort` from `generate()`; keep the last returned `tokenParam` / `effectiveReasoningEffort` per endpoint and model; use the same budget for the meter `reservedOutput` in `DesktopCopilotPanel.tsx` (FR-013)
- [x] T023 [US2] In `apps/desktop/src/main/ipc-handlers.ts`, remove `OPENAI_EDIT_COMPLETION_TOKENS`; extract a pure `negotiateChatCompletion(payload, state, send)` that sends `payload.maxTokens` as received, picks `reasoning_effort` from the fallback list on every dialect, walks the list on rejection, and caps attempts at 6; scale timeouts by budget (FR-009, FR-010, FR-012, FR-014); tests for SC-004 and SC-005
- [x] T024 [US2] Advanced section in `apps/desktop/src/renderer/src/components/settings/ai.tsx`: two budget fields and a Reasoning effort select (with Custom text field), each showing its effective value; window-overflow warning; Reset to Auto; update `saveChatSettings` and `resetAIDefaults` (FR-005)
- [x] T025 [US2] Show "Sent as `<value>` for this model" / "This model does not accept reasoning effort" in `ai.tsx` from the last `effectiveReasoningEffort`

**Checkpoint**: SC-002, SC-004 and SC-007 pass.

## Phase 3: User Story 3 — Don't resend rejected parameters (P3)

- [x] T030 [US3] Session `Map<string, NegotiationState>` keyed by `negotiationKey(endpoint, model)` in `apps/desktop/src/main/ipc-handlers.ts`; seed each request (temperature, token parameter, rejected reasoning values) and record each adaptation (FR-011); tests via `negotiateChatCompletion`

**Checkpoint**: SC-003 passes manually with `gpt-5.x`; SC-005 second-request case passes in tests.

## Polish

- [x] T900 Add QA scenarios for SC-001–SC-003, SC-006, SC-007 and the Ollama fallback cases to `docs/qa/copilot-test-scenarios.md`
- [x] T901 Point the token-limit paragraph in `specs/complete/052-ai-chatbot-assistant/spec.md` at this spec; in `specs/complete/017-copilot-local-ollama/spec.md`, note the fitted Edit reply budget, the pre-send warning, and Reasoning effort Off for thinking models on windows of 16k or less
- [x] T902 Run `npm test`; move this folder to `specs/complete/088-copilot-request-controls/` and update `specs/STATUS.md` when shipped

## Follow-up: meter warnings (2026-10-08)

- [x] T910 Meter level from reply risk, not fill thresholds: `estimateContextBudget` takes the resolved reply (`auto`, `fitted`) and the FR-017 reply estimate; `contextBudgetHint` returns amber / red one-line warnings without an Open AI settings action, in `apps/desktop/src/renderer/src/lib/copilot-token-budget.ts`; tests in `apps/desktop/tests/copilot-token-budget.test.ts` (FR-018, FR-019, SC-008)
- [x] T911 Pass the reply and Edit reply estimate to the meter, render the warning icon and suggestion line, and drop the popup's settings button in `apps/desktop/src/renderer/src/components/panels/DesktopCopilotPanel.tsx`; hatched **Room for reply** segment and red/amber warning styles in `apps/desktop/src/renderer/src/styles.css`
- [x] T912 Update the meter paragraphs in `specs/complete/052-ai-chatbot-assistant/spec.md` and `specs/complete/017-copilot-local-ollama/spec.md`, and the meter expectations in `docs/qa/copilot-test-scenarios.md`
- [x] T913 Leave Reasoning effort Off out of the meter suggestion and the pre-send warning when it is already Off (`copilot-token-budget.ts`, `copilot-budget-diagnostics.ts` + tests)
- [x] T914 Tidy Settings → AI → Advanced in `apps/desktop/src/renderer/src/components/settings/ai.tsx`: shared control column, one short budget note, bounds as a tooltip, the overflow warning only when a budget fills the window (edge case "Configured budget exceeds the model token window"); the meter covers smaller overflows (FR-018)
- [x] T915 Keep one reply budget per turn across token-parameter retries: drop `maxTokensByTokenParam` from the IPC request, `resolveReplyBudgetsByTokenParam` and the main-process sanitizer; `negotiateChatCompletion` sends `payload.maxTokens` on every attempt, and the learned parameter's ceiling applies from the next request (edge case "token-parameter dialect is learned mid-request", FR-006); test in `apps/desktop/tests/ai-request-negotiation.test.ts`
- [x] T916 Calibrate the FR-016 prompt figure from reported usage: `calibratePromptTokens` / `estimatePromptTokens({ calibration })` in `copilot-token-budget.ts` (replaces the unused `actualPromptTokens`); `recordPromptUsage` / `learnedPromptCalibration` in `copilot-request-learning.ts`; `DesktopCopilotPanel.tsx` records each reply's prompt count with that request's estimate and applies the calibration to the meter, the pre-send warning and the sent budget; tests in `copilot-token-budget.test.ts` and `copilot-request-learning.test.ts`
- [x] T917 **Reset to Auto** also discards a pending Custom reasoning-effort selection and its draft, so the controls show the reset setting (FR-005); `ReasoningEffortField` is remounted on reset in `apps/desktop/src/renderer/src/components/settings/ai.tsx`; test in `apps/desktop/tests/ai-settings-reset.test.ts`
