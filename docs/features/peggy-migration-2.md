---
title: "Peggy grammar iteration 2: structured patterns and transforms"
status: proposed
authors: ["kadraman"]
created: 2026-01-02
issue: "https://github.com/kadraman/beatbax/issues/26"
---

## Summary

Define the second-stage Peggy work needed to eliminate reliance on the legacy pattern/sequence expression pipeline. This iteration parses pattern bodies and transforms directly in the Peggy grammar, emits structured AST nodes, and updates downstream expansion so the legacy tokenizer and expression handlers can be removed.

## Problem Statement

The current Peggy grammar parses top-level statements but still hands pattern and sequence right-hand sides to the legacy tokenizer/expander. This dual-path approach keeps the legacy parser alive, increases maintenance cost, makes error reporting inconsistent, and complicates bundling (browser-safe builds still need legacy code). We need structured parsing of pattern events, inline instrument overrides, and transforms so the legacy expression path can be retired.

## Proposed Solution
### Summary
Extend the Peggy grammar to parse pattern and sequence expressions into typed AST nodes (notes, rests, inline instrument changes, temporary overrides, transforms) while keeping AST compatibility. Update the AST schema with optional structured fields and migrate the expansion pipeline to consume them directly. Remove the dependency on legacy tokenizer/expression code once parity is achieved.

### Example Syntax

```
pat fill = inst sn C6 C6 inst(hat,2) C6 .
seq main = intro:oct(-1):rev fill:slow(2)
```

### Example Usage

```
import { parse } from '@beatbax/engine';
const ast = parse(source);
// ast.pats[].tokens holds structured events; seq.parts[].transforms is structured
```

## Implementation Plan
### AST Changes
- Add structured pattern event nodes (note, rest, inline inst change, temporary inst override with duration N) with location info.
- Add structured transform nodes for sequences and patterns (`oct`, `rev`, `slow`, `fast`, `inst`, etc.) with optional args.
- Introduce optional `tokens` and `transforms` arrays on pattern/sequence AST nodes while preserving existing string `rhs` fields for backward compatibility during rollout.
- Keep overall AST schema stable; update `schema/ast.schema.json` and `docs/ast-schema.md` with optional structured fields.

### Parser Changes
- Extend `grammar.peggy` to parse pattern bodies into event lists instead of `RestOfLine` strings.
- Parse `inst(name,N)` as a temporary override node, including duration capture and location.
- Parse transforms (`:oct(+1)`, `:rev`, `:slow(2)`, `:inst(bass)`, etc.) into structured arrays, supporting chaining and spacing quirks from the legacy parser.
- Preserve identifier rules, comments, and whitespace tolerance to maintain parity; improve diagnostics by attaching locations to new nodes.
- Update the Peggy wrapper to populate both legacy `rhs` fields and new structured arrays until the rollout is complete.
- Parse duration suffixes (e.g., `C4/2`).
- For unknown transforms during migration: collect them as `unknown` and continue (no hard failure during rollout).
- Keep the `rhs` string lbut mark it deprecated.

### CLI Changes
- None to surface; verify continues to display parse errors but may show richer locations tied to structured events.

### Web UI Changes
- None; Web UI benefits from better diagnostics and no longer needs the legacy expression bundle once retired.

### Export Changes
- None directly; ensure downstream expansion and ISM generation consume structured nodes so exports remain unchanged.

### Documentation Updates
- Update `docs/ast-schema.md`, `docs/features/peggy-migration.md`, `docs/features/sequence-arrangements.md`, and relevant tutorial/examples to describe structured pattern tokens and transforms.

## Testing Strategy
### Unit Tests
- Grammar unit tests covering notes, rests, inline inst changes, temporary overrides, chained transforms, duration suffixes, and odd spacing.
- Snapshot tests for AST nodes ensuring locations and token shapes match expectations.

### Integration Tests
- Parity tests comparing legacy expansion vs. structured Peggy expansion over `songs/*.bax` and selected `tmp/*.bax` files.
- End-to-end tests for `verify`, `export json/midi/uge`, and playback to ensure ISM output matches pre-change baselines.

## Migration Path
 - Structured parsing is now the default. The legacy tokenizer/expression path has been removed and downstream code should consume structured fields directly.

### Implementation Checklist
- [x] Extend Peggy grammar for pattern events and transforms with location metadata.
- [x] Add structured AST fields and update schema/docs.
- [x] Implement transformer to populate structured tokens and transforms while keeping `rhs` strings during rollout.
- [x] Update pattern/sequence expansion to consume structured nodes; keep fallback during parity testing.
- [x] Add parity and regression tests for structured parsing vs. legacy outputs.
- [x] Enable structured fields by default and move legacy tokenizer/expression code behind feature flags once stable.

- Note: Unknown transforms are intentionally collected as `unknown` (no fail-fast) during rollout.
 - Structured fields are enabled by default; resolver materializes structured data into legacy token maps when enabled.

#### Remaining Tasks (explicit rollout steps)

- [x] Flip rollout flag: make structured Peggy events the default. (Files: `packages/engine/src/parser/*`)
- [x] Gate legacy tokenizer: move legacy tokenizer/expression code behind a feature flag and ensure it is tree-shakeable from browser bundles (e.g. `packages/engine/src/parser/legacy`).
- [x] Remove fallback code paths: update transformer/resolver/expanders to consume structured `tokens`/`transforms` unconditionally and remove `rhs`-to-token materializer, leaving a small compatibility shim only for opt-out mode. (Files: `engine/src/patterns/expand.ts`, `engine/src/sequences/expand.ts`, `engine/src/song/resolver.ts`)
- [x] Clean up AST/schema/docs: mark `rhs` deprecated in `schema/ast.schema.json` and update `docs/ast-schema.md`, `docs/features/peggy-migration-2.md`, and `docs/features/sequence-arrangements.md` to document structured fields as first-class.
- [x] Tests & parity validation: update unit tests/snapshots for structured AST shapes, run parity/integration tests across `songs/*.bax` and `tmp/*.bax`, and confirm ISM parity with legacy outputs.
- [x] CI and release: update CI matrix to run with structured events enabled by default and retain a short-lived opt-out job; add release notes documenting the deprecation window.
- [x] Packaging & bundles: ensure demo/browser builds exclude legacy expression bundle by default and verify ESM/type exports remain consistent.
- [x] Final removal: after a deprecation window and successful rollout, delete legacy parser code and remove `BEATBAX_PEGGY_EVENTS` handling and related docs.

## Future Enhancements
- Error recovery for pattern bodies (multiple diagnostics per line).
- Emit a CST for editor tooling (LSP/VS Code extension) and potential Tree-sitter alignment.

## References
- [docs/features/peggy-migration.md](docs/features/peggy-migration.md)
- [docs/ast-schema.md](docs/ast-schema.md)
- [docs/features/sequence-arrangements.md](docs/features/sequence-arrangements.md)

## Additional Notes
Structured parsing is required to retire the legacy expression path and simplify bundling. The goal is functional parity with clearer diagnostics, not new language surface changes.
