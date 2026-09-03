# Testing

## MUST

- Add tests for new behavior (parser, expansion, export, CLI, and UI logic as applicable).
- Assert **determinism** and **export correctness** when those pipelines change.
- Keep refactors from reducing coverage.
- Run `npm test` before opening a PR.

## Where tests live

- Engine and plugins: `packages/*/tests/` (and package-local `tests/` where already used).
- CLI integration: `packages/cli/tests/`.
- Shared app logic: `packages/app-core` tests where present.
- Historical root `tests/` may still exist; prefer colocated package tests for new work.

## Plan.md

Every feature `plan.md` MUST state:

- Unit tests (what and where)
- Integration tests (CLI, export, playback, or UI)
- Manual QA if desktop-only (pointer to `docs/qa/` when relevant)

## Pointers

- Copilot QA scenarios: [docs/qa/copilot-test-scenarios.md](../../docs/qa/copilot-test-scenarios.md)
- Desktop release QA: [docs/qa/desktop-release-qa.md](../../docs/qa/desktop-release-qa.md)
