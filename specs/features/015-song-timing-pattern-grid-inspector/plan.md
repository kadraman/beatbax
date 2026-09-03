# Implementation Plan: Song Timing Pattern Grid Inspector

**Spec**: [spec.md](spec.md) | **Migrated**: 2026-09-03

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [ ] No invented syntax or undocumented language behavior
- [ ] AST / ISM / scheduler / expansion impact identified (or N/A)
- [ ] Plugins remain isolated; core does not gain plugin dependencies
- [ ] Determinism and compatibility preserved (or migration documented)
- [ ] Tests planned for new behavior

## Implementation Plan



### Engine / App-Core

1. Add a resolver-side timeline extraction helper.
  - Input: parsed AST and resolved `SongModel`.
  - Output: channel lengths, pattern/sequence blocks, event rows, and source references where possible.
2. Add timing diagnostics that run after resolution.
3. Expose diagnostics through existing editor/app-core validation plumbing.
4. Add optional exporter-readiness diagnostics for UGE.



### UI

1. Add a Pattern Grid Inspector tab or diagnostics mode.
2. Render channel rows with block widths proportional to `lengthSteps`.
3. Add bar/step ruler using `stepsPerBar` or default 16-step bars.
4. Overlay diagnostic badges on affected blocks.
5. Add a block details panel with:
  - source `pat` / `seq`,
  - length,
  - step table,
  - diagnostics,
  - quick links to source.



### Tests

Add focused fixtures for:

- 15-step pattern in one channel.
- Channel length mismatch at song end.
- Section sequence mismatch.
- Split percussion kit where wave kick disappears in one section.
- Slow portamento on 2-step notes for UGE readiness.
- Flat-note UGE conversion warning.

---
