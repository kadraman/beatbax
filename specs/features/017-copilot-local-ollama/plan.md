# Implementation Plan: Copilot — Local models (Ollama)

**Spec**: [spec.md](spec.md) | **Updated**: 2026-09-03

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
