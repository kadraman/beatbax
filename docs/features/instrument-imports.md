---
title: "Instrument Imports"
status: proposed
authors: ["kadraman"]
created: 2026-01-01
issue: ""
---

## Summary

Add a lightweight `import` directive to `.bax` files that pulls in collections
of `inst` declarations from external `.ins` files. Imported instruments are
merged into the song's instrument table prior to sequence/pattern expansion.

## Problem Statement

Authors frequently want to reuse instrument collections across songs and
projects. Currently instrument definitions must live inside each `.bax`, which
leads to duplication and makes cross-song updates tedious.

## Proposed Solution
### Summary

Introduce a top-level directive:

```
import "relative/path/to/instruments.ins"
```

`.ins` files contain only `inst` declarations and optional `import` lines.
Imports resolve relative to the importing file and may fall back to configured
search paths. Imports are processed recursively with cycle detection and a
cache. When names conflict, later definitions overwrite earlier ones (last-
win); the resolver emits a warning by default and can run in strict mode to
treat overrides as errors.

### Example Syntax

`common.ins`:

```
inst lead  type=pulse1 duty=50 env=12,down
inst bass  type=pulse2 duty=25 env=10,down
```

`song.bax`:

```
import "common.ins"

bpm 128
inst lead type=pulse1 duty=30 env=8,up

pat melody = C5 E5 G5 C6
channel 1 => seq melody inst lead
```

The local `inst lead` in `song.bax` overrides `common.ins`'s `lead` because
later definitions win.

## Implementation Plan
### AST Changes

- Add `ImportNode { source: string, loc }` as a top-level AST node.

### Parser Changes

- Recognize `import` as a top-level directive and emit `ImportNode` during
  parsing.
- When parsing `.ins` files, validate that only `inst` and `import` nodes are
  present; report a parse-time error for other node kinds.

### Export Changes

- No changes to export formats are required; imports are compile-time only and
  merge into the existing instrument table used by the resolver and exporter.

### Documentation Updates

- Add usage docs and examples (this feature doc plus a short example in the
  `songs/` directory). Update `TUTORIAL.md` and CLI help to mention import
  search paths and strict-mode toggle.

## Testing Strategy
### Unit Tests

- Parser: accept `import` lines and reject non-`inst` nodes inside `.ins`.
- Resolver: relative path resolution, search-path fallback, caching, and
  cycle detection.
- Merge semantics: last-win overrides and emitted warnings; strict mode
  causes errors.

### Integration Tests

- Small end-to-end tests that load a `.bax` which imports multiple `.ins`
  files (including a recursive import) and verify the final ISM contains the
  expected instrument table.

## Migration Path

- Existing songs continue to behave as before. Projects can start creating
  `.ins` libraries and import them; because overrides apply, local changes can
  still override library instruments without changing the libraries.

## Implementation checklist

- [ ] Add `ImportNode` to `ast.ts`.
- [ ] Update `parser.ts` to accept and emit `ImportNode`.
- [ ] Add `.ins` parsing validation.
- [ ] Implement resolver loading, caching, cycle detection, merge logic.
- [ ] Emit warnings for overrides; add `--strict-ins` or config option.
- [ ] Add CLI `--ins-path` option for search-paths (optional but recommended).
- [ ] Add unit and integration tests.
- [ ] Update `TUTORIAL.md` and CLI help text.

## References

- hUGETracker and other tracker formats use external instrument banks; this
  feature aims to provide similar convenience for `.bax`.

## Additional Notes

- Design choice: last-win overrides were selected for convenience and to
  enable intentional local overrides. Projects that require strict stability
  can enable strict-mode to treat overrides as errors.

- Resolution order:
  - Resolve the import path relative to the importing file's directory.
  - If not found, attempt configured project search paths (e.g. `songs/`,
    `lib/uge/`). Search paths are configurable in the CLI or build tooling.

- `.ins` files may themselves contain `import` directives (recursive imports).

- Only `inst` declarations are allowed inside `.ins` files. Any other top-level
  node (e.g. `pat`, `seq`, `play`) in an `.ins` file is a parse-time error.

- Later definitions win. If multiple imports (or local `inst` definitions) use
  the same instrument name, the last parsed/merged definition overrides
  previous ones. This enables composition and deliberate overrides.

- The resolver should still emit a warning when an instrument name is
  overridden (configurable as an error in strict mode).

- Add a new top-level AST node: `ImportNode { source: string, loc }`.

- The existing parser will recognize the `import` directive and emit an
  `ImportNode` into the top-level AST. When parsing `.ins` files, the parser
  will enforce that only `inst` (and `import`) nodes are present.

- The song resolver is responsible for processing imports before pattern and
  sequence expansion. Responsibilities:
  - Load imported files (respecting relative resolution and search paths).
  - Parse each imported file into an AST and validate permitted nodes.
  - Detect import cycles and return a clear, human-friendly error.
  - Cache parsed `.ins` files by absolute path to avoid re-parsing.
  - Merge instruments into the importing song's instrument table in import
    order; later definitions overwrite earlier ones.

- Merging semantics:
  - When merging, copy instrument definitions (do not mutate source AST nodes).
  - Preserve source metadata (origin file path) for diagnostics and tooling.

- Clear errors should be produced for:
  - Missing import files (file not found).
  - Parse errors inside an imported file.
  - Illegal nodes inside `.ins` files (non-`inst` nodes).
  - Import cycles.

- Warnings are emitted for name overrides; projects may opt into strict mode to
  treat overrides as errors.

- Add unit tests to cover:
  - Basic import resolution (relative and search-path fallback).
  - Recursive imports and cycle detection.
  - Override semantics (last-win) and optional strict-mode errors.
  - Parse errors when non-`inst` nodes appear in `.ins` files.

- Suggested test locations: `engine/tests/` (parser/resolver suites) and a new
  small integration test under `packages/cli/tests/` that loads example songs.

