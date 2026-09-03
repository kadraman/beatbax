# Tasks: Copilot — Local models (Ollama)

**Input**: [spec.md](spec.md), [plan.md](plan.md)

Most product behaviour is already shipped. Remaining work is verification and doc/settings hygiene.

## Phase 0: Verify shipped behaviour

- [x] T001 Ollama preset + model refresh in Settings → AI
- [x] T002 Local endpoint timeout suitable for cold model load
- [x] T003 Edit-mode incomplete-response guard blocks song wipe

## Phase 1: Docs and settings alignment

- [ ] T010 [P] Keep [spec.md](spec.md) model/`num_ctx` tables accurate after Ollama or Copilot changes
- [ ] T011 [P] Align Settings → AI help / token-window copy with Ollama `num_ctx` guidance
- [ ] T012 Cross-link [docs/qa/copilot-test-scenarios.md](../../../docs/qa/copilot-test-scenarios.md) from Desktop AI settings if missing

## Phase 2: QA gate

- [ ] T020 Run Copilot local-Ollama scenarios from `docs/qa/copilot-test-scenarios.md` on a 7B coder model at 16k context
- [ ] T021 Move to `specs/complete/017-copilot-local-ollama/` when treated as complete docs/ops feature
