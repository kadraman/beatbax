---
title: "Chevrotain parser migration"
status: proposed
authors: ["maintainer-team"]
created: 2026-01-01
issue: "https://github.com/kadraman/beatbax/issues/22"
---

## Summary

Replace the current ad-hoc regex/tokenizer parser for `.bax` files with a Chevrotain-based parser (lexer + CST) and a small CST→AST transformer. This improves grammar clarity, error reporting, extensibility, and TypeScript ergonomics while preserving the existing AST and export pipelines.

## Problem Statement

The current parser implementation in `packages/engine/src/parser` relies heavily on regular expressions and hand-written tokenization. This results in:
- scattered parsing logic, hard-to-maintain ad-hoc token handling
- limited and inconsistent error messages (poor line/column info)
- fragile handling of nested/quoted constructs and comment stripping
- expensive future changes when adding more language features (transforms, nested directives)

## Proposed Solution

Use Chevrotain (a TypeScript-friendly, high-performance parser library) to implement:
- a well-defined token vocabulary (lexer)
- a clear CST grammar for directives (`chip`, `bpm`, `inst`, `pat`, `seq`, `channel`, `play`, `export`, metadata)
- a deterministic CST→AST transformer that produces the existing `AST` shape (`pats`, `insts`, `seqs`, `channels`, `bpm`, `chip`, `play`, `metadata`) and preserves backwards compatibility for downstream modules (expanders, scheduler, exporters)

### Summary

Chevrotain gives explicit token/grammar APIs, built-in error recovery and good TypeScript ergonomics. We will implement a lexer and CST parser inside `packages/engine/src/parser/chevrotain/` and wire the transformer to replace the existing `parse()` entry point gradually.

### Example Syntax

Keep the existing `.bax` surface (examples in `docs/` and `songs/` remain valid). The grammar will explicitly model pattern modifiers (e.g. `:oct(-1)`, `:rev`, `:+2`) and sequence transforms (`fast`, `slow`) rather than applying them as scattered post-processing steps.

## Implementation Plan

High-level phases (each phase is reversible and test-covered):

1. Grammar design & tests (non-invasive)
  - Create token definitions and CST rules for a minimal subset: `inst`, `pat`, `seq`, `channel`, `bpm`, `chip`, `play`, `export`, and metadata directives.
  - Write unit tests that parse sample `.bax` inputs and assert stable CST shapes.

2. CST→AST transformer
  - Implement a transformer that converts CST nodes into the existing `AST` shape (`pats`, `insts`, `seqs`, `channels`, `bpm`, `chip`, `play`, `metadata`).
  - Preserve semantics: expanded `pat` arrays are still produced by `expandPattern` (we will keep current expansion code and call it from the transformer where appropriate).

3. Replace `parse()` entrypoint behind a feature flag
  - Add `parseWithChevrotain()` next to the current `parse()` and enable via an environment variable or config flag for test runs.
  - Run full test-suite with the new parser to detect parity issues.

4. Full migration
  - Remove legacy regex-based parsing after parity is achieved and tests pass.

### AST Changes

No breaking AST changes planned. The Chevrotain transformer must emit the same keys and value types as the current `AST` (see `packages/engine/src/parser/ast.ts`). If minor additions are made (e.g. `pos` metadata for nodes), keep them optional to maintain compatibility.

### Parser Changes

- New folder: `packages/engine/src/parser/chevrotain/`
  - `tokens.ts` — token definitions
  - `lexer.ts` — Chevrotain lexer wrapper
  - `parser.ts` — CST grammar rules
  - `transformer.ts` — CST→AST converter
  - `index.ts` — public parse entry and feature-flag switch

### Export Changes

No changes to export modules; the transformer outputs current AST shape so `export/json`, `midi`, and `uge` code paths remain unchanged.

### Documentation Updates

Update `docs/features` with this migration plan (this document), and add a short migration guide in `DEVNOTES.md` describing how to run the parser with the feature flag and how to test.

## Testing Strategy

### Unit Tests

- Lexer/token tests: ensure tokens are recognized correctly (quoted strings, brackets, parens, comments, numbers, ids, transforms).
- CST tests: parsing small files into expected CST shapes.
- Transformer tests: CST→AST parity tests comparing outputs of legacy parser and Chevrotain transformer on a corpus of real `.bax` files (from `songs/` and `tmp/*_dbg.uge` test vectors).

### Integration Tests

- Run full engine test suite with Chevrotain parser enabled (CI job). Compare exports (JSON, MIDI, UGE) between legacy and new parser for a sample set of songs.

## Migration Path

1. Implement lexing & base grammar for `pat` and `inst` only; wire tests.
2. Add `seq` and `channel` rules and transformer support.
3. Incrementally add remaining directives (metadata, `play`, `export`).
4. Add feature-flagged integration runs; fix parity issues.
5. Flip feature flag to make Chevrotain the default; deprecate legacy parser.

Rollback strategy: keep legacy `parse()` implemented, allow tests to select parser. This permits quick rollback if unexpected incompatibilities arise.

## Implementation checklist

- [ ] Create `packages/engine/src/parser/chevrotain/` scaffold
- [ ] Implement `tokens.ts` and `lexer.ts` (including comment handling)
- [ ] Implement `parser.ts` (CST rules) with test vectors
- [ ] Implement `transformer.ts` to emit existing AST shape
- [ ] Add `parseWithChevrotain()` and feature flag wiring in `packages/engine/src/parser/index.ts`
- [ ] Add unit & integration tests
- [x] CI job to run the test matrix with the new parser (GitHub Actions workflow: `.github/workflows/chevrotain-parity.yml`)
- [x] Update `DEVNOTES.md` and `docs/features` links — see `DEVNOTES.md` section "Chevrotain parser migration" for usage and testing instructions


### How to test locally (short)

- Enable Chevrotain parser for local tests and runs:

  - macOS / Linux (bash/zsh): `BEATBAX_PARSER=chevrotain npm run engine:test`
  - Windows PowerShell: `$env:BEATBAX_PARSER = 'chevrotain'; npm run engine:test`

- Run the export parity checks (requires a built `dist`):

  1. `npm run build-all`
  2. `node packages/engine/scripts/compare-exports.mjs`

  The script writes outputs to `tmp/parity-exports/` and exits non-zero when artifacts differ.

- Notes:
  - Some CI/test environments may not be able to import the ESM `chevrotain` package; tests and the local script skip gracefully or warn when `chevrotain` cannot be resolved. Use Node 18+ for best compatibility.
  - See `.github/workflows/chevrotain-parity.yml` for the CI run matrix (build + tests with and without the Chevrotain parser, and parity checks).

## References

- Chevrotain docs: https://chevrotain.io/
- Example usage in TypeScript projects

## Example Chevrotain snippets (implementation hints)

Tokens (partial)

```ts
import { createToken } from 'chevrotain';

export const WhiteSpace = createToken({ name: 'WhiteSpace', pattern: /\s+/, group: Lexer.SKIPPED });
export const Pat = createToken({ name: 'Pat', pattern: /pat/ });
export const Inst = createToken({ name: 'Inst', pattern: /inst/ });
export const Seq = createToken({ name: 'Seq', pattern: /seq/ });
export const Channel = createToken({ name: 'Channel', pattern: /channel/ });
export const Id = createToken({ name: 'Id', pattern: /[A-Za-z_][A-Za-z0-9_\-]*/ });
export const NumberLiteral = createToken({ name: 'NumberLiteral', pattern: /-?\d+/ });
export const StringLiteral = createToken({ name: 'StringLiteral', pattern: /"(?:[^"\\]|\\.)*"|\'(?:[^'\\]|\\.)*\'/ });
// ... punctuation tokens: Colon, Equals, LParen, RParen, LBracket, RBracket, Comma
```

CST rules (partial)

```ts
this.RULE('patStmt', () => {
  this.CONSUME(Pat);
  this.CONSUME(Id, { LABEL: 'name' });
  this.OPTION(() => {
    this.CONSUME(Colon);
    this.MANY_SEP({ SEP: Colon, DEF: () => this.SUBRULE(this.patMod) });
  });
  this.CONSUME(Equals);
  this.SUBRULE(this.patBody);
});
```

Transformer guidance

- Use CST node shapes to extract position info and children.
- For `pat` bodies that are raw pattern tokens, reuse `expandPattern()` on the extracted string token to preserve existing expansion logic.

## Risks & Mitigations

- Risk: subtle parsing differences cause interop issues with existing songs. Mitigation: extensive parity tests and staged rollout behind a flag.
- Risk: developer ramp-up for Chevrotain. Mitigation: small initial scope, example-based docs, and pairing session.

## Additional Notes

- Consider adding optional `pos` metadata (line/column) to AST nodes; make optional to avoid breaking consumers.
- Future: expose a Tree-sitter grammar derived from the Chevrotain grammar for IDE/editor integration.
