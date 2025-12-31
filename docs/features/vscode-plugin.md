---
title: "BeatBax VS Code Extension"
status: proposed
authors: ["kadraman"]
created: 2025-12-31
issue: "https://github.com/kadraman/beatbax/issues/21"
---

## Summary

This document describes requirements and an implementation plan for a Visual Studio Code extension providing first-class editing and playback support for BeatBax `.bax` files. The extension will be developed as an independently-versioned package under `packages/vscode-plugin` so it can be built, tested, and released separately from the monorepo.

## Goals

- Provide reliable syntax highlighting and file association for `.bax` files.
- Offer language features (completion, hover, diagnostics) with high-quality, fast responses via a Language Server (LSP).
- Expose editor commands for deterministic playback, stop, and export; allow both quick previews and full exports.
- Ship as `packages/vscode-plugin` with independent build/release pipeline.

## Non-goals (initial)

- Full-blown visual pattern editor (outside scope for MVP — could be a future WebView-based feature).
- Reimplement core engine — reuse existing `engine` package where possible or call CLI when embedding is undesirable.

## User Stories

- As a composer, I want `.bax` files to show colors and tokens, so the script is easier to read.
- As an author, I want completions for `inst`, `pat`, `seq`, directives, and transforms so I write valid scripts faster.
- As a developer, I want inline diagnostics and hover docs for directives and instrument fields so errors are discovered early.
- As a tester, I want to run `BeatBax: Play` inside the editor to audition the current song without leaving VS Code.

## Requirements

### Functional
- Recognize and associate `.bax` files.
- Syntax highlighting (TextMate grammar) for tokens: directives (`bpm`, `chip`, `inst`, `pat`, `seq`, `channel`, `play`, `export`), notes, rests, numbers, transforms, and inline `inst(...)` tokens.
- LSP-backed completions for top-level directives, instrument names, pattern names, sequence names, and inline transforms.
- Hover documentation for language constructs and instrument fields (populated from `/docs` and AST types).
- Diagnostics for parse errors (point to lines/columns, friendly messages).
- Commands: `beatbax.play`, `beatbax.stop`, `beatbax.exportJson`, `beatbax.exportMidi`, `beatbax.exportUge`.
- Playback options (configurable):
  - Spawn local CLI (`bin/beatbax`) to play or export (recommended minimal-surface implementation).
  - Optional embedded playback: import `engine` from workspace when running in dev-mode / workspace trusted environment.
  - Optional WebView-based preview (later roadmap).

### Non-functional
- Fast cold start (< 300ms for grammar & basic completions).
- Reasonable memory usage; LSP runs as a separate Node process.
- Works on Windows/macOS/Linux.
- Extension must not execute arbitrary workspace code without explicit user consent (security model respected).

## Architecture

### High level
- Client extension (VS Code) — registers grammar, file association, commands, and starts/attaches to a Language Server.
- Language Server (Node/TypeScript) — provides completions, hover, diagnostics, and quick fixes by using the existing parser/resolver from the `engine` package or by embedding a lightweight parser layer.
- Playback bridge — simple command handler that either spawns the CLI (`node ./bin/beatbax`) or loads `engine` programmatically when configuration allows.

### Components
- `packages/vscode-plugin/src/extension.ts` — activation, command registration, start LSP client, register webviews.
- `packages/vscode-plugin/server/*` — language server implementation using `vscode-languageserver`.
- `packages/vscode-plugin/syntaxes/bax.tmLanguage.json` — TextMate grammar adapted from the parser token types.
- `packages/vscode-plugin/snippets/bax.code-snippets.json` — useful patterns and instrument templates.
- `packages/vscode-plugin/playback.ts` — spawns CLI or uses workspace `engine` per config.

### Playback integration patterns
- CLI-based (recommended default): spawn `npx @beatbax/cli play <file>` or call `bin/beatbax` in repo root. Pros: isolated, no bundling. Cons: requires native CLI artifact in PATH or repo.
- Embedded (developer opt-in): import `engine` from the monorepo (`../../engine/src`) or an installed dependency and run playback in-process. Pros: lower latency preview; Cons: security and dependency complexity.
- WebView sandbox (future): render a small audio preview UI that runs the engine compiled for browser (uses `engine-core` browser bundle).

## Security and workspace trust

- Playback using embedded JavaScript should only run for trusted workspaces. Default to CLI spawning for untrusted workspaces.
- Avoid executing arbitrary user scripts. If in-process import is used, warn and require explicit opt-in setting `beatbax.allowEmbeddedEngine`.

## Developer experience & packaging

- The extension will live under `packages/vscode-plugin` with its own `package.json`, `tsconfig.json`, and `README.md` so it can be built and published independently.
- Recommended npm scripts in `packages/vscode-plugin/package.json`:

  - `build` — compile TypeScript
  - `lint` — run ESLint/type checks
  - `vscode:prepublish` — bundle grammar/snippets and run `vsce package` friendly checks
  - `test` — unit tests for server/client handlers

- CI: GitHub Actions workflow to run `npm ci`, `npm run build`, `npm test`, and optionally `vsce publish` when a release tag is pushed.

### Extension manifest highlights
- `contributes.languages` — associate `.bax` and provide `bax` id.
- `contributes.grammars` — point to `syntaxes/bax.tmLanguage.json`.
- `contributes.commands` — list playback and export commands.
- Activation events: `onLanguage:bax`, commands, and `onCommand:beatbax.play`.

## Testing

- Unit tests for language server handlers (completion, hover, diagnostics) using `mocha`/`jest`.
- Integration test: spawn an instance of the extension using `@vscode/test-electron` and verify that grammar loads and `beatbax.play` can be invoked (mock CLI in CI).

## Roadmap / Future work

- WebView-based pattern editor and visual timeline.
- Live in-editor playback with seek/loop controls.
- Snippet generator from `docs/` for common idioms.
- Support for language-aware refactorings and quick-fixes (rename symbol propagation across patterns/seqs).

## Open Questions / Decisions for the user

1. Preferred playback integration for MVP: spawn CLI (safe/default) or embed `engine` (faster, requires workspace trust)?
2. Should the extension bundle the `engine` browser build for a WebView preview at initial release or push that to a later milestone?

## Implementation checklist (MVP)

- [ ] Create `packages/vscode-plugin` scaffold
- [ ] Add TextMate grammar and file association
- [ ] Implement LSP server with parsing and diagnostics
- [ ] Provide completions and hover using AST/resolver
- [ ] Implement `beatbax.play` and `beatbax.stop` that spawn CLI
- [ ] Add unit/integration tests and CI
- [ ] Document usage in `packages/vscode-plugin/README.md`

## References

- Project docs and AST: see `/docs` and the engine packages for parser/AST shape.
- VS Code extension guides: `https://code.visualstudio.com/api`
