# Implementation Plan: Copilot request controls and budget diagnostics

**Spec**: [spec.md](spec.md) | **Date**: 2026-09-27 | **Branch**: `feat/088-copilot-request-controls`

## Summary

Move reply-budget and reasoning-effort resolution into one renderer helper that feeds both the request and the footer meter. Extend the IPC result with `finishReason`, `reasoningTokens` and a reasoning-present flag so the Copilot panel can explain out-of-budget failures and show reasoning usage. Add an Advanced section to Settings → AI, persisted in `beatbax:ai.settings`.

Keep request building provider-generic: a new shared negotiation module owns the canonical effort levels, their fallback lists, the rejection test for 400 replies, and the session cache shape. The main process sends only `reasoning_effort`, walks the fallback list on rejection, and caches what each endpoint origin and model accepted. Endpoint detection (`isOpenAIEndpoint`) survives only as the initial token-parameter guess.

## Technical context

- **Packages / surfaces**: `apps/desktop` (main, preload types, renderer), `packages/app-core` (chat store, AI settings)
- **Language**: TypeScript (strict), ESM
- **Testing**: Jest via `npm test` (`apps/desktop/jest.config.cjs`)
- **Client profile**: desktop-full
- **Performance / constraints**: no extra requests on the happy path; one fewer request per turn for reasoning models after the first rejection

## Constitution Check

- [x] No invented syntax or undocumented language behavior (no BeatBax language change)
- [x] AST / ISM / scheduler / expansion impact identified: N/A
- [x] Plugins remain isolated; core does not gain plugin dependencies (desktop and app-core only)
- [x] Determinism and compatibility preserved: Auto reproduces current OpenAI request bodies; other endpoints gain only `reasoning_effort: "low"` (SC-004); old saved settings load as Auto
- [x] Tests planned for new behavior

## Project structure

| File | Change |
| --- | --- |
| `apps/desktop/src/shared/electron-api.ts` | Add `reasoningEffort?: ReasoningEffortRequest` to `AIChatCompletionRequest`; add `finishReason?`, `reasoningPresent?`, `effectiveReasoningEffort?` (wire value or `null` = omitted) and `tokenParam?` to `AIChatCompletionResult`; add `reasoningTokens?` to `AIChatCompletionUsage` |
| `apps/desktop/src/shared/ai-chat-completion.ts` | Parse `choices[0].finish_reason`, `usage.completion_tokens_details.reasoning_tokens`, and whether `choices[0].message.reasoning` / `reasoning_content` is non-empty; carry them through `normalizeAIChatCompletionResult` |
| `apps/desktop/src/shared/ai-request-negotiation.ts` (new) | Provider-generic negotiation: `ReasoningEffortLevel` type; `REASONING_EFFORT_FALLBACKS` table (FR-009); `nextReasoningEffortValue(request, rejected)`; `isReasoningEffortRejection(status, message)` (FR-010); `NegotiationState` cache entry type and `negotiationKey(endpoint, model)` (origin + model); `usesCompletionTokensParam(endpoint)` as the initial token-parameter guess |
| `apps/desktop/src/main/ipc-handlers.ts` | Honor `payload.maxTokens` as sent (remove `OPENAI_EDIT_COMPLETION_TOKENS` override); send `reasoning_effort` on every dialect via the negotiation module; session `Map<string, NegotiationState>`; attempt cap 6; budget-scaled timeouts; return `effectiveReasoningEffort` and `tokenParam` |
| `apps/desktop/src/renderer/src/lib/copilot-token-budget.ts` | `estimatePromptTokens({ songText, otherTexts, actualPromptTokens })` (song at chars/2, rest at chars/4); `resolveReplyBudget({ mode, settings, tokenParam, promptTokens, windowTokens })` with window fitting (FR-016); `resolveReasoningEffort(settings)`; `completionTokenLimit` delegates to them; `estimateContextBudget` uses the new prompt estimate |
| `apps/desktop/src/renderer/src/lib/copilot-budget-diagnostics.ts` (new) | `describeLengthStop({ content, finishReason, usage, budget, mode })` → user-facing message or `null`; `checkReplyFits({ songChars, budget, windowTokens, reasoningEffort })` → pre-send warning or `null` (FR-017) |
| `apps/desktop/src/renderer/src/components/panels/DesktopCopilotPanel.tsx` | Send resolved budget/effort; meter uses the same prompt and budget values; pre-send warning with Send anyway / Open Settings; on `finish_reason: "length"` show the diagnostic and skip repair loops; badge shows reasoning tokens |
| `packages/app-core/src/stores/chat.store.ts` | `AISettings` gains `editReplyTokens`, `askReplyTokens` (`'auto' \| number`), `reasoningEffort` (`'auto' \| 'provider-default' \| 'off' \| 'minimal' \| 'low' \| 'medium' \| 'high' \| 'custom'`) and `reasoningEffortCustom?: string`; load/save/clamp/validate; `ChatTokenUsage.reasoningTokens?` and `reasoningPresent?` merged by `addTokenUsage` |
| `apps/desktop/src/renderer/src/components/settings/ai.tsx` | Collapsible **Advanced** section, effective-value labels (including "Sent as `minimal` for this model" / "does not accept reasoning effort"), Custom text field, window-overflow warning, Reset to Auto; include new fields in `saveChatSettings` and `resetAIDefaults` |
| `specs/complete/052-ai-chatbot-assistant/spec.md` | Point the token-limit paragraph at spec 088 |
| `specs/complete/017-copilot-local-ollama/spec.md` | Mention the fitted Edit reply budget and the pre-send warning next to `num_ctx` guidance, and Reasoning effort Off for thinking models on windows of 16k or less |

## Implementation

### AST changes

None.

### Parser / grammar changes

None.

### CLI changes

None.

### Desktop / web UI changes

**Budget resolution (single source).** `resolveReplyBudget` returns the configured number, or Auto: a ceiling (Edit → 16,384 when the token parameter is `max_completion_tokens`, else 8,192; Ask → 2,048) fitted to the window as `max(floor, min(ceiling, window − ceil(prompt × 1.1)))`, with floors Edit 2,048 / Ask 512. `prompt` comes from `estimatePromptTokens`, which the meter also uses, so the meter total never exceeds the window on Auto (SC-007). The renderer passes the last `tokenParam` returned by the main process for the current endpoint and model, falling back to `usesCompletionTokensParam(endpoint)`. `resolveReasoningEffort` maps settings to a request: Auto → `{ level: 'low' }`; Provider default → `undefined`; Custom → `{ level: 'custom', value }`; otherwise `{ level }`. `generate()` sends `maxTokens` and `reasoningEffort`; the meter calls the same budget function for `reservedOutput`.

**Negotiation (main process).** One cache entry per `negotiationKey(endpoint, model)` (URL origin + model id):

```ts
interface NegotiationState {
  omitTemperature: boolean
  tokenParam?: 'max_tokens' | 'max_completion_tokens'
  rejectedReasoningValues: Set<string>
}
```

For each request: seed `tokenParam` from the entry (else `usesCompletionTokensParam`), omit `temperature` if cached, and pick `reasoning_effort` with `nextReasoningEffortValue(request, entry.rejectedReasoningValues)` — the first fallback value not yet rejected, or omitted when all are. On HTTP 400: if `isReasoningEffortRejection` and a value was sent, add it to the rejected set and retry with the next value; otherwise apply the existing `temperature` and token-parameter rules and record them. Stop after 6 attempts. Return `effectiveReasoningEffort` (the value sent on the successful attempt, or `null`) and `tokenParam`.

Rejections are only recorded for values actually sent, so switching levels later re-uses what was learned: Off after a cached `none` rejection starts at `minimal`.

**Timeouts.** `max(modeMinimum, ceil(maxTokens / 16384) × 120 s)`, capped at 10 min for remote endpoints; local stays 5 min minimum.

**Pre-send check.** In `send()` for Edit mode, before `generate()`: call `checkReplyFits` with the editor text length, the resolved budget and reasoning effort. If it returns a warning, render it above the composer with **Send anyway** and **Open Settings**, and return without sending. Remember a dismissal key (hash of song text + budget + effort + window) for the current chat so the same situation doesn't warn twice. Parse-repair and incomplete-song retries skip the check.

**Diagnostics.** After each completion in Edit mode, if `finishReason === 'length'`: build the message with `describeLengthStop` (which uses `reasoningTokens` when reported, else `reasoningPresent`), `setStatus` it, finish the assistant turn with `applyBlocked: true`, and return before the parse/incomplete repair loops. In Ask mode, append a one-line notice under the reply saying it was cut off at the Ask budget.

**Settings.** Advanced section under Behaviour. Budget fields use the same commit-on-blur pattern as `ContextWindowField`, with an Auto checkbox or select. Reasoning effort is a select; Custom reveals a text field validated against `[a-z0-9_-]{1,32}`. Below it, show the last `effectiveReasoningEffort` for the current endpoint and model when it differs from the chosen level. Show a warning when `reply budget ≥ contextWindowTokens × 0.5`.

### Export changes

None.

### Documentation updates

- Spec 052 token-limit paragraph → reference spec 088.
- Spec 017: the Edit reply budget counts against `num_ctx`; suggest Reasoning effort Off for thinking models on small context windows.

## Testing strategy

### Unit tests

- `ai-chat-completion.test.ts`: parses `finish_reason`, `reasoning_tokens`, and `reasoning` / `reasoning_content` presence; absent fields → `undefined`.
- `ai-request-negotiation.test.ts` (new): fallback order per level; exhausted list → omitted; Custom has no fallback; `isReasoningEffortRejection` matches `reasoning` / `think` wording on 400 only; `negotiationKey` ignores path and trailing slash.
- `copilot-token-budget.test.ts`: Auto ceilings per token parameter and mode; window fitting (16k / 8k / 128k windows, growing history, prompt larger than window → floor); explicit values are not fitted; clamping; `estimatePromptTokens` song vs other text and provider-reported override; meter total ≤ window on Auto (SC-007); `resolveReasoningEffort` for every option.
- `copilot-budget-diagnostics.test.ts` (new): reasoning-exhausted (by tokens and by reasoning flag) vs cut-off vs non-length → `null`; `checkReplyFits` with `call-me-maybe.bax`-sized input on 16k (warns) and 128k (no warning) windows (SC-006), reasoning margin on/off.
- `chat.store` tests (app-core): legacy settings load as Auto; invalid Custom value falls back to Auto; `addTokenUsage` sums reasoning tokens.
- Main-process request loop (extract a pure `negotiateChatCompletion(payload, state, send)` with an injected `send` to test): Auto OpenAI bodies match current output and other endpoints add only `reasoning_effort: "low"` (SC-004); simulated servers rejecting `none`, rejecting `minimal`, and rejecting all values (SC-005); cached state seeds the next request (SC-003); attempt cap 6.

### Integration tests

None beyond unit coverage; the IPC boundary is exercised by the pure helpers.

### Manual / QA

- Add scenarios to `docs/qa/copilot-test-scenarios.md`:
  - `gpt-5.x` with Edit budget forced to 4,096 on `call-me-maybe.bax` → reasoning-exhausted message (SC-001).
  - Meter reserved value matches Advanced setting (SC-002).
  - Two consecutive `gpt-5.x` requests → only the first logs a `temperature` 400 (SC-003).
  - Ollama thinking model (e.g. `qwen3.5`) with Reasoning effort Minimal → first request retries as `none`, Settings shows "Sent as `none`"; second request sends `none` directly.
  - Ollama non-thinking model with Auto → request succeeds (field accepted, ignored, or omitted after one rejection).
  - Ollama with a 16k window: Edit on `call-me-maybe.bax` → pre-send warning; Send anyway sends with the fitted budget; `sample.bax` sends without a warning and the meter stays at or below 100% (SC-006, SC-007).

## Migration and compatibility

New `AISettings` fields are optional in storage; missing values mean Auto. No change to other storage keys. With all-Auto settings, OpenAI request bodies are unchanged while the prompt leaves room for the ceiling; other endpoints now receive `reasoning_effort: "low"` (users can turn it off with Provider default) and, on small windows, a fitted reply budget. The meter's prompt estimate rises for song text (chars/2 instead of chars/4), so meters on existing chats read higher than before.

## Open implementation questions

- The effective reasoning value and token parameter piggyback on the completion result (no new IPC query). The renderer keeps the last values per endpoint and model in memory for the meter and Settings labels.
