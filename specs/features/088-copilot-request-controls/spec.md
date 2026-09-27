---
title: "Copilot request controls and budget diagnostics"
id: 88
slug: "copilot-request-controls"
status: "specified"
authors:
  - "kadraman"
created: "2026-09-27"
updated: "2026-09-27"
issue: "https://github.com/kadraman/beatbax/issues/212"
area: "desktop"
related:
  - "specs/complete/052-ai-chatbot-assistant/spec.md"
  - "specs/features/017-copilot-local-ollama/spec.md"
---

# Feature Specification: Copilot request controls and budget diagnostics

## Summary

Make the Copilot reply budget and reasoning effort visible and adjustable, explain out-of-budget failures in plain language, and stop re-sending parameters a model has already rejected. The implementation is provider-generic: Copilot keeps one internal set of reasoning-effort levels, sends them in the single de-facto field `reasoning_effort`, and learns which values each endpoint and model accept from HTTP 400 replies. Endpoint detection is only a first guess to save round trips; correctness never depends on recognising the provider.

Auto reply budgets keep today's values as ceilings but shrink to the room left in the model token window, and Copilot warns before sending an Edit request whose full-song reply cannot fit. With default windows on OpenAI and Groq (128k), the ceilings apply unchanged. The other default change is that Auto reasoning effort sends `low` to every endpoint, not only OpenAI-style ones (see FR-006).

## Problem

Copilot's request parameters are hard-coded and invisible:

| Parameter | Today | Where |
| --- | --- | --- |
| Edit reply budget | 8192 tokens; raised to 16384 in the main process on `max_completion_tokens` endpoints | `copilot-token-budget.ts`, `ipc-handlers.ts` |
| Ask reply budget | 2048 tokens | `copilot-token-budget.ts` |
| Reasoning effort | `low` on `max_completion_tokens` endpoints, dropped if rejected; never sent elsewhere | `ipc-handlers.ts` |
| Temperature | `0.7`, dropped per request if rejected | `DesktopCopilotPanel.tsx`, `ipc-handlers.ts` |

This caused a real failure: with `gpt-5.5` in Edit mode on a large song (`songs/midi/call-me-maybe.bax`, ~15.5k chars), the model spent all 8192 completion tokens on hidden reasoning (`finish_reason: "length"`, `reasoning_tokens: 8192`, empty content). The user saw only "Copilot did not return an applicable song… Try again" and had no way to diagnose or fix it. Even after the fix, full-song Edit replies used 6.6k–8k *visible* output tokens, so the budget remains a real constraint users should be able to see and adjust.

Related problems:

- The footer context meter reserves 8192 tokens for an Edit reply, but the main process now sends 16384 on OpenAI-style endpoints, so the meter under-reports.
- On small windows the fixed budget makes the meter meaningless and hides songs that cannot fit. With Ollama's default 16,384-token window, the meter starts around 75% on `songs/sample.bax` before any chat, and is permanently over 100% on an 8,192 window. The reply budget is only a cap, not a reservation: prompt plus generated tokens must fit the window, so a large song like `call-me-maybe.bax` (prompt plus a 6.6k–8k-token reply) cannot fit a 16k window whatever the budget. Local servers may then truncate or shift context silently instead of returning an error.
- Every request to a reasoning model is sent twice: the first attempt is rejected for `temperature: 0.7` (HTTP 400), then retried without it.
- The per-message token badge shows prompt → completion only; reasoning tokens, which can be most of the completion, are hidden.
- Thinking models on other OpenAI-compatible servers get no `reasoning_effort` at all. Ollama, for example, turns thinking on by default for capable models when the field is absent, so they can hit the same out-of-budget failure with smaller context windows.
- Providers accept different, non-overlapping effort values. OpenAI accepts `minimal`, `low`, `medium`, `high` (newer models also `none`); Ollama's `/v1` endpoint accepts `none`, `low`, `medium`, `high` (recent versions also `max`) and rejects `minimal`. Provider-specific branches for each server would not scale.

## User scenarios

### User Story 1 — Understand an out-of-budget failure (Priority: P1)

**Why this priority**: Without it, users hit an opaque "try again" error that retrying never fixes. This is the cheapest change with the biggest impact.

**Independent test**: Force a small Edit budget (or use a reasoning model on a large song) and confirm the message names the cause and the setting to change.

**Acceptance scenarios**:

1. **Given** an Edit request whose reply ends with `finish_reason: "length"` and no usable content, and the reply shows reasoning (reasoning tokens reported, or a non-empty reasoning field), **When** the reply arrives, **Then** Copilot shows a message saying the model used its whole reply budget on reasoning, with the budget and any reported reasoning-token count, and suggests lowering reasoning effort or raising the Edit reply budget, with a link to Settings → AI.
2. **Given** an Edit request whose reply ends with `finish_reason: "length"` part-way through the song, **When** the reply arrives, **Then** Copilot shows a message saying the song was cut off at the reply budget, and suggests raising the Edit reply budget or starting a New chat. It does not run parse-repair or incomplete-song retries with the same budget.
3. **Given** any assistant reply whose provider reports reasoning tokens, **When** it appears in the chat, **Then** its token badge shows the reasoning-token count (for example `12.3k → 7.5k · 214 reasoning`). **Given** a reply with a non-empty reasoning field but no reasoning-token count, **Then** the badge shows `· thinking` instead.
4. **Given** an Edit request where the estimated full-song reply is larger than the reply budget that fits in the model token window (FR-017), **When** the user presses Send, **Then** Copilot does not send yet and shows a warning with both numbers (for example "This song needs about 8k tokens to reply, but only about 6k fit in your 16k model window"), suggesting a larger `num_ctx` and **Model token window**, Reasoning effort Off, or a cloud model, with **Send anyway** and **Open Settings** actions.
5. **Given** the warning in scenario 4, **When** the user presses **Send anyway**, **Then** the request is sent with the fitted budget, and the warning is not shown again for the same song text and settings in this chat.

### User Story 2 — Adjust reply budget and reasoning effort (Priority: P2)

**Why this priority**: Lets users recover from budget failures and trade quality against speed and cost, without code changes.

**Independent test**: Change each setting, send a request, and confirm the provider receives the configured (or negotiated) values and the footer meter reserves the same budget.

**Acceptance scenarios**:

1. **Given** Settings → AI → Advanced, **When** the user opens it, **Then** they see **Edit reply budget**, **Ask reply budget** and **Reasoning effort**, each defaulting to **Auto** with the effective value shown (for example "Auto (16,384 for this endpoint)", "Auto (about 9.1k for this chat)", "Auto (Low)").
2. **Given** Edit reply budget set to 24,576, **When** the user sends an Edit request, **Then** the provider receives a 24,576-token completion limit and the footer meter reserves 24,576.
3. **Given** Reasoning effort set to Medium, **When** a request is sent to any endpoint, **Then** its first attempt carries `reasoning_effort: "medium"`.
4. **Given** Reasoning effort set to Off on an endpoint that rejects `none` but accepts `minimal`, **When** a request is sent, **Then** Copilot retries with `minimal` and Settings shows "Sent as `minimal` for this model".
5. **Given** an endpoint that rejects every value in the fallback order, **When** a request is sent, **Then** it is retried without `reasoning_effort` and Settings shows "This model does not accept reasoning effort".
6. **Given** Reasoning effort set to **Custom** with value `xhigh`, **When** a request is sent, **Then** it carries `reasoning_effort: "xhigh"` exactly; if rejected, it is retried without the field.
7. **Given** Reasoning effort set to **Provider default**, **When** a request is sent, **Then** it carries no `reasoning_effort`.
8. **Given** **Reset to Auto**, **When** pressed, **Then** all three settings return to Auto.

### User Story 3 — Don't resend rejected parameters (Priority: P3)

**Why this priority**: Invisible to users, but removes wasted round trips (~0.6 s each) on every request after the first.

**Independent test**: Send two requests to `gpt-5.x` in one session; only the first should be rejected for `temperature`. Repeat with Reasoning effort Minimal on Ollama; only the first should be rejected for `minimal`.

**Acceptance scenarios**:

1. **Given** a model that rejected `temperature` earlier in this app session, **When** another request goes to the same endpoint and model, **Then** `temperature` is omitted from the first attempt.
2. **Given** a model that rejected a `reasoning_effort` value earlier in this session, **When** another request asks for the same level, **Then** the first attempt uses the value that was accepted last time (or omits the field if none was).
3. **Given** the user switches to a different model or endpoint, **When** a request is sent, **Then** no rejections learned for the previous model apply.

### Edge cases

- Endpoint's token-parameter dialect is learned mid-request (400 asks for `max_completion_tokens`): Auto budgets follow the learned dialect on later attempts and later requests.
- Non-thinking model given `reasoning_effort`: if the server rejects it, the fallback order ends by omitting the field and the rejection is cached. If the server silently ignores it, nothing changes for the user.
- Server silently ignores `reasoning_effort` on a thinking model: cannot be detected from the request; the `finish_reason: "length"` diagnostics (US1) still explain any resulting failure.
- A 400 whose message does not mention reasoning or thinking: not treated as a reasoning-effort rejection; handled by the existing adaptation rules or shown as an error.
- Configured budget exceeds the model's maximum output: the provider's 400 is shown with a hint to lower the reply budget; Copilot does not silently clamp it.
- Configured budget exceeds the model token window setting: Settings shows a warning, since prompt plus reply cannot fit. An explicit number is always sent as configured; only Auto is fitted to the window.
- Model token window setting does not match the server's real window (for example Ollama `num_ctx`): BeatBax cannot read the server's configured window over `/v1`, so fitting and the pre-send warning use the setting. Warnings and cut-off messages name the **Model token window** setting so users can correct it.
- Prompt alone fills the window: the Auto budget falls to its floor (FR-016) and the pre-send warning explains that the song and instructions do not fit.
- Chat grows during a session: the Auto budget shrinks as history grows, and the meter and Settings label show the current value.
- Provider omits `finish_reason`, reasoning-token usage and reasoning fields: fall back to today's messages; no badge suffix.
- Large budgets on slow endpoints: request timeouts scale with the configured budget, so a valid long reply is not cut off by a fixed timeout.

## Requirements

### Functional requirements

- **FR-001**: The main process MUST return to the renderer, along with content and usage: the provider's `finish_reason`; `usage.completion_tokens_details.reasoning_tokens` when present; and whether the reply message contained a non-empty reasoning field (`reasoning` or `reasoning_content`). Reasoning text itself is not shown or stored.
- **FR-002**: When `finish_reason` is `"length"`, Copilot MUST show a budget-specific message instead of the generic "did not return an applicable song" or parse-repair flow. The message MUST distinguish "reasoning used the budget" (empty content, and either reasoning tokens ≥ 90% of completion tokens or a non-empty reasoning field) from "reply was cut off" (partial content), include the relevant token counts when reported, and link to Settings → AI.
- **FR-003**: Copilot MUST NOT run automatic parse-repair or incomplete-song retries for a reply that ended with `finish_reason: "length"`, since the same budget would fail the same way.
- **FR-004**: Per-message token usage MUST include reasoning tokens when the provider reports them, summed across repair turns, and the badge MUST display them. When only a reasoning field is present, the badge MUST show `· thinking`.
- **FR-005**: Settings → AI MUST offer an **Advanced** section (collapsed by default) with **Edit reply budget**, **Ask reply budget** and **Reasoning effort**, each defaulting to **Auto**, plus **Reset to Auto**.
- **FR-006**: Auto values MUST be: Edit budget ceiling 16,384 when the endpoint uses `max_completion_tokens` (initial guess corrected by the learned dialect) and 8,192 otherwise; Ask budget ceiling 2,048; both fitted to the window per FR-016; reasoning effort **Low** for both modes on every endpoint.
- **FR-007**: Reply budgets MUST be whole numbers within documented bounds (Edit 2,048–65,536; Ask 512–16,384); out-of-range input is clamped on commit, as the model token window field does today.
- **FR-008**: Reasoning effort options MUST be **Auto**, **Provider default**, **Off**, **Minimal**, **Low**, **Medium**, **High** and **Custom** (free text, 1–32 characters of `[a-z0-9_-]`). Provider default MUST never send the field. Every other option MUST be sent as the string field `reasoning_effort`, using only that field for all providers.
- **FR-009**: Each level MUST map to an ordered fallback list of wire values, tried in order on rejection, then omitted:

  | Level | Values tried, in order |
  | --- | --- |
  | Off | `none`, `minimal`, `low` |
  | Minimal | `minimal`, `none`, `low` |
  | Low | `low` |
  | Medium | `medium` |
  | High | `high`, `max` |
  | Custom | the entered value |

  The rule is: exact value, then the nearest cheaper value, then the nearest more expensive value, then omit the field.
- **FR-010**: A `reasoning_effort` value MUST be treated as rejected when the provider returns HTTP 400 and the error message contains `reasoning` or `think` (case-insensitive). Copilot MUST then retry with the next value in the fallback list, or without the field once the list is exhausted.
- **FR-011**: The main process MUST remember, per endpoint origin and model, for the rest of the app session: rejected `temperature`; the learned token-parameter dialect; and the rejected `reasoning_effort` values. Later requests MUST start from the first value not yet rejected, and omit the field when all were rejected. The effective wire value (or "omitted") MUST be returned to the renderer so Settings can show it (US2 scenarios 4–5).
- **FR-012**: Total attempts per request MUST be capped at 6, including all parameter adaptations.
- **FR-013**: The reply budget MUST be resolved in one place, and that value MUST be both sent to the provider and reserved by the footer meter. The main process MUST NOT silently override it.
- **FR-014**: Remote request timeouts MUST scale with the resolved reply budget, keeping today's minimums (1 min Ask, 2 min Edit, 5 min local).
- **FR-015**: The new settings MUST be persisted in `beatbax:ai.settings` alongside existing fields, never alongside the API key, and older saved settings without them MUST load as Auto.
- **FR-016**: An Auto reply budget MUST be `min(ceiling, window − ceil(prompt × 1.1))`, floored at the mode minimum (Edit 2,048; Ask 512), where `window` is the **Model token window** setting and `prompt` is the same prompt figure the footer meter uses: provider-reported prompt tokens when available, otherwise the character estimate with the song text counted at 2 characters per token and other text at 4. This rule applies to every endpoint, with no local-endpoint detection.
- **FR-017**: Before sending an Edit request, Copilot MUST estimate the full-song reply as `ceil(songChars / 2)` tokens, plus 1,024 tokens when reasoning effort is anything other than Off or Provider default. If the estimate exceeds the resolved reply budget, Copilot MUST show the pre-send warning (US1 scenarios 4–5) instead of sending. The warning MUST apply to explicit budgets as well as Auto, and MUST NOT appear in Ask mode.

### Non-goals

- Provider-specific request fields (`reasoning.effort`, Ollama's native `think`, `thinking` budgets). Custom and Provider default are the escape hatches.
- Exposing temperature or timeouts as settings.
- Per-chat or per-message overrides.
- Streaming replies, or showing reasoning text.
- Returning only changed definitions in Edit mode (a separate design change to spec 052).
- Changing Ask-mode song truncation (`maxContextChars`).
- The web build (Copilot is desktop-only).

## Success criteria

- **SC-001**: Replaying the `call-me-maybe.bax` failure (reasoning exhausts the budget) shows a message naming reasoning and the Edit reply budget, not "try again".
- **SC-002**: For every request, the footer meter's reserved reply equals the completion limit sent to the provider.
- **SC-003**: In one app session, the second and later requests to a `gpt-5.x` model are sent once each (no `temperature` 400).
- **SC-004**: With all settings on Auto and a prompt that leaves room for the ceiling, request bodies to OpenAI are identical to today's. Bodies to other endpoints differ only by carrying `reasoning_effort: "low"` (or omitting it after a cached rejection) and by a fitted budget when the window is small.
- **SC-005**: Against simulated servers that (a) reject `none`, (b) reject `minimal`, and (c) reject every `reasoning_effort` value, each level resolves within its fallback list on the first request, and the second request in the session succeeds on its first attempt.
- **SC-006**: An Edit request on `call-me-maybe.bax` with a 16,384-token model window shows the pre-send warning before any request is sent; the same request with the OpenAI default window (128k) sends without a warning.
- **SC-007**: With any song, window and chat length, the footer meter's total (prompt plus reserved reply) is at most 100% of the window whenever the reply budget is Auto and the prompt leaves room for the floor.

## Assumptions

- `reasoning_effort` as a string is the field most OpenAI-compatible servers use for reasoning control (verified for OpenAI and Ollama `/v1`). Servers that need a different field are out of scope beyond Custom and Provider default.
- Servers reject unknown `reasoning_effort` values with HTTP 400 and an error message mentioning reasoning or thinking. Unusual wording just means one extra round trip, retried without the field.
- Remembering rejections in memory for the app session is enough; model capabilities rarely change mid-session.
- BeatBax notation tokenizes at roughly 2 characters per token: `call-me-maybe.bax` (~15.5k chars) produced 6.6k–8k reply tokens on `gpt-5.5`. The chars/4 estimate used today undercounts song text, hence counting song text at chars/2 in the prompt estimate (FR-016) and the reply estimate (FR-017), with a 1.1 margin for the rest. Constants may be tuned during implementation from provider-reported usage.

## Open questions

None.

Resolved:

- *Should reasoning effort offer None?* Yes, as **Off**, mapped through the fallback list so it works where `none` is rejected. Auto stays Low, because turning reasoning off hurts composition-style edits.
- *Should Auto differ by mode?* No. Low for both Ask and Edit keeps one rule for all providers.
- *Should learned rejections persist across restarts?* No, session-only (FR-011). Relearning costs at most a few fast 400s per model per launch. Persisting risks stale entries when capabilities change under the same model name (Ollama upgrades, re-pulled tags, updated aliases), and a single misclassified 400 would silently disable reasoning control for that model. Revisit with a short expiry, app-version keying and a "Clear learned settings" button only if the repeated round trips prove to matter.
- *Should the Auto budget scale with the model token window?* Yes, by fitting to the room left rather than a fixed fraction (FR-016), for every endpoint. The budget is only a cap, so lowering it cannot make a song fit; fitting keeps the meter honest, and the pre-send warning (FR-017) turns silent local truncation into an actionable message. "Half the window" was rejected because it ignores prompt size: an 8k window would get a 4k budget, and a large song on a 32k window could still overflow.

## References

- [Spec 052 — AI chatbot assistant](../../complete/052-ai-chatbot-assistant/spec.md) (API call implementation, token limits)
- [Spec 017 — Copilot with local Ollama](../017-copilot-local-ollama/spec.md) (context sizing)
- [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility) (`reasoning_effort` values)
- `apps/desktop/src/main/ipc-handlers.ts` — `createAIChatCompletion`
- `apps/desktop/src/renderer/src/lib/copilot-token-budget.ts`
- `apps/desktop/src/renderer/src/components/settings/ai.tsx`
