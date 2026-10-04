# Implementation Plan: Granular CodeLens preview settings

**Spec**: [spec.md](spec.md) | **Migrated**: 2026-09-03

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [x] No invented syntax or undocumented language behavior (editor settings only)
- [x] AST / ISM / scheduler / expansion impact identified: N/A
- [x] Plugins remain isolated; core does not gain plugin dependencies
- [x] Determinism and compatibility preserved: all categories default to on, so existing installs are unchanged
- [x] Tests planned for new behavior

## Implementation

### App-core

1. Add storage keys and `boolAtom` settings for four categories.
2. Export `getCodeLensCategoryFlags(): { patterns, sequences, instruments, effects }`.
3. In `setupCodeLensPreview`, read flags when building lenses; subscribe to setting changes and call existing `notifyChange()`.

### No changes to

- Preview command handlers (`beatbax.previewPattern`, `beatbax.previewSeq`, …)
- Command palette play commands
- Pattern Grid / section focus controller
- Parser, AST, or grammar

### Testing

- `codelens-preview.test.ts`: fixture source with pat/seq/inst/effect lines; assert lens counts per category flag combination.
- Optional: settings panel smoke test (Desktop).
