# Implementation Plan: Copilot — Local models (Ollama)

**Spec**: [spec.md](spec.md) | **Updated**: 2026-10-04

## Summary

This feature is primarily an **ops/docs contract** for BeatBax Copilot against local OpenAI-compatible endpoints (Ollama). Core Copilot already supports custom endpoints; this plan tracks documentation accuracy, settings UX, and Edit-mode reliability with large `num_ctx`.

## Technical context

- **Packages / surfaces**: `apps/desktop` Copilot panel + Settings → AI; main-process IPC chat path
- **Related**: [docs/features/complete/ai-chatbot-assistant.md](../../../docs/features/complete/ai-chatbot-assistant.md)
- **Testing**: [docs/qa/copilot-test-scenarios.md](../../../docs/qa/copilot-test-scenarios.md)
- **Client profile**: desktop-full only

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [x] No invented syntax or undocumented language behavior — Copilot must not invent grammar; validation unchanged
- [x] AST / ISM / scheduler / expansion impact identified — **N/A**
- [x] Plugins remain isolated — **N/A**
- [x] Determinism and compatibility preserved — apply-guard still blocks incomplete Edit responses
- [x] Tests planned — manual QA scenarios in `docs/qa/copilot-test-scenarios.md`

## Implementation

### Already shipped (track, do not regress)

- Ollama preset (`http://localhost:11434/v1`), model refresh, no API key
- Long timeout for local endpoints (~5 minutes)
- Edit-mode full-song apply + incomplete-response guard
- Settings token-window / context meter alignment

### Edit apply hardening (Phase 3, from the 2026-10-03 QA run)

All in `apps/desktop/src/renderer/src`; no language, AST, or validation changes. Every applied song is still validated.

- `lib/line-change-diff.ts` — `matchLineEndings(text, reference)`. The panel converts the reply to the editor's line endings before the snippet merge, completeness guard, raw diff, and definition merge, and converts `applyCode` again after merging (the merge helpers insert LF lines).
- `components/panels/DesktopCopilotPanel.tsx` — in the parse-validation loop, before requesting a repair, try `tryMergeChangedDefinitions(currentEditor, reply)`; if the merged song validates, apply it with `mergedDefinitions = true`. The later raw-diff merge is skipped when this already happened.
- `lib/bax-def-index.ts` — `collectUnmergedLines(previous, candidate)`: whitespace-normalised, non-comment, non-definition lines in the reply that the current song lacks. Shown as a *Not merged* card note whenever the definition merge is used.
- Explanation: keep the first reply's explanation through repair retries; `extractEditExplanation(reply, echoedHistory)` drops `[Previous Edit]` stub marker lines and long lines repeated from the assistant history sent with the request.
- Blocked outcomes: both "repair returned no song" exits and the "no `bax` song" fallthrough finish with `applyBlocked` and a reason; the collapsed body is labelled *View reply* when it has no code block.

Follow-up: **Discard remaining** residue (former T038) is tracked in [#218](https://github.com/kadraman/beatbax/issues/218). An offline merge-then-revert of the CRLF `songs/sample.bax` round-trips exactly (`tests/bax-def-index.test.ts`), so capture applied and reverted content from a live run before changing the review code.

### Remaining / maintenance

- Keep model recommendations and `num_ctx` guidance current in [spec.md](spec.md)
- Ensure Settings help text matches Ollama `num_ctx` behaviour
- Re-run Copilot QA scenarios after Copilot or settings changes

## Testing strategy

### Manual / QA

- Pull `qwen2.5-coder:7b`, set `num_ctx` ≥ 16384, Edit `songs/sample.bax`, confirm full-song apply
- Confirm Ask vs Edit behaviour and Discard/undo
- Confirm timeout/warm-load messaging for first request after Ollama restart

## Migration and compatibility

Documentation and settings only; no language changes.

## Open implementation questions

None for v1 docs track.
