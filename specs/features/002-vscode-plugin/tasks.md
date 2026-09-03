# Tasks: BeatBax VS Code Extension

**Input**: [spec.md](spec.md), [plan.md](plan.md)

## Phase 0: Foundation

- [ ] T001 [P] Create `packages/vscode-plugin` scaffold (`package.json`, `tsconfig`, build scripts)
- [ ] T002 [P] Wire monorepo workspace entry and CI job for the package

## Phase 1: Language surface (MVP)

- [ ] T010 [P] [US1] Add TextMate grammar `packages/vscode-plugin/syntaxes/bax.tmLanguage.json` and `.bax` association
- [ ] T011 [P] [US1] Add useful snippets under `packages/vscode-plugin/snippets/`
- [ ] T012 [US1] Implement LSP server under `packages/vscode-plugin/server/` using engine parse/resolve
- [ ] T013 [US1] Provide completions and hover from AST/resolver
- [ ] T014 [US1] Surface parser/resolver diagnostics in the Problems panel

## Phase 2: Playback commands

- [ ] T020 [US2] Implement `beatbax.play` / `beatbax.stop` spawning CLI (default path)
- [ ] T021 [US2] Document workspace-trust / embedded-engine opt-in setting (defer embed if undecided)

## Phase 3: Polish

- [ ] T030 [P] Unit/integration tests for LSP handlers and play command (mock CLI)
- [ ] T031 [P] Document usage in `packages/vscode-plugin/README.md`
- [ ] T032 Move folder to `specs/complete/002-vscode-plugin/` and update `specs/STATUS.md` when shipped
