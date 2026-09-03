# Implementation Plan: BeatBax VS Code Extension

**Spec**: [spec.md](spec.md) | **Updated**: 2026-09-03

## Summary

Ship an independently versioned `packages/vscode-plugin` with TextMate grammar, LSP (completions/hover/diagnostics), and CLI-spawned playback/export. Reuse Web UI Monaco tokenizer/diagnostics patterns where practical.

## Technical context

- **Packages / surfaces**: `packages/vscode-plugin` (new), `@beatbax/engine` (parse/resolve), `@beatbax/cli` (playback default)
- **Language**: TypeScript (strict), ESM; VS Code extension APIs + `vscode-languageserver`
- **Testing**: Jest/mocha for LSP handlers; `@vscode/test-electron` for integration
- **Client profile**: VS Code extension (not desktop-full / web-lite)
- **Constraints**: Untrusted workspaces must default to CLI spawn; embedded engine opt-in only

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [x] No invented syntax or undocumented language behavior — editor surfaces existing grammar only
- [x] AST / ISM / scheduler / expansion impact identified — **N/A** (consumes engine; does not change contracts)
- [x] Plugins remain isolated; core does not gain plugin dependencies — **N/A**
- [x] Determinism and compatibility preserved — playback via CLI uses existing deterministic path
- [x] Tests planned for new behavior — see Testing strategy

## Project structure

```
packages/vscode-plugin/
├── src/extension.ts
├── server/                 # LSP
├── syntaxes/bax.tmLanguage.json
├── snippets/
├── playback.ts
├── package.json
└── README.md
```

## Implementation

### AST / parser

None. Reuse engine parse/resolve for diagnostics and hover.

### Package scaffold

- Create `packages/vscode-plugin` with independent `package.json`, `tsconfig`, build scripts.
- Contribute language id `bax`, grammar, commands, activation on `onLanguage:bax`.

### Language server

- Completions, hover, diagnostics from AST/resolver.
- Optional quick fixes later (out of MVP if not listed in checklist).

### Playback / export

- Default: spawn CLI (`npx @beatbax/cli play` / repo `bin`).
- Optional embedded engine behind `beatbax.allowEmbeddedEngine` + workspace trust.

### Documentation

- `packages/vscode-plugin/README.md` usage and security notes.

## Testing strategy

### Unit tests

LSP completion, hover, diagnostics handlers.

### Integration tests

`@vscode/test-electron`: grammar loads; `beatbax.play` invokes mocked CLI.

### Manual / QA

Open a `.bax` song, verify highlight, diagnostics, play/stop on Windows/macOS/Linux.

## Migration and compatibility

Additive package. No change to existing clients.

## Open implementation questions

1. MVP playback: CLI-only vs embedded opt-in in v1?
2. Bundle browser engine for WebView preview in v1 or later?
