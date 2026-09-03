# Implementation Plan: hUGETracker UGE Converter

**Spec**: [spec.md](spec.md) | **Migrated**: 2026-09-03

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [ ] No invented syntax or undocumented language behavior
- [ ] AST / ISM / scheduler / expansion impact identified (or N/A)
- [ ] Plugins remain isolated; core does not gain plugin dependencies
- [ ] Determinism and compatibility preserved (or migration documented)
- [ ] Tests planned for new behavior

## Implementation Plan

### Phase 1 - Mechanical CLI Converter

Deliverables:

- `convertUGEToBax(uge: UGESong, opts): string`.
- CLI command: `beatbax convert uge song.uge <song.bax>`.
- Basic instrument, wavetable, pattern, order, and effect conversion.
- Warnings for unsupported features.

Acceptance criteria:

- A simple hUGETracker song converts to `.bax`.
- The generated `.bax` parses successfully.
- Exporting the generated `.bax` back to UGE produces a playable song.

### Phase 2 - Subpattern Preservation

Deliverables:

- Detect instrument subpatterns from UGE.
- Emit `subpat` declarations (grammar already shipped).
- Preserve unsupported subpattern details as comments if needed.

Acceptance criteria:

- A UGE song with noise kick/snare subpatterns imports with recognizable BeatBax `subpat` blocks.

### Phase 3 - Better Naming And Deduplication

Deliverables:

- Detect reused patterns and assign stable names.
- Generate friendlier instrument names from UGE instrument names.
- Group generated sequences by channel/section where possible.

Acceptance criteria:

- Generated `.bax` is readable enough for manual editing.
- Repeated UGE patterns are not unnecessarily duplicated when safe.

### Phase 4 - UI Import

Deliverables:

- Web/desktop "Import UGE" flow.
- Preview generated `.bax` before saving.
- Show conversion warnings in the diagnostics panel.

Acceptance criteria:

- User can select a `.uge` file and load generated BeatBax source into the editor.

---

## Test Plan

- Unit tests for UGE instrument-to-BeatBax instrument conversion.
- Unit tests for wavetable hex output.
- Pattern/order conversion tests.
- Effect mapping tests.
- Snapshot tests for generated `.bax` from small fixture UGE files.
- Round-trip smoke tests:
  1. Read UGE.
  2. Convert to `.bax`.
  3. Parse/resolve `.bax`.
  4. Export UGE.
  5. Confirm exported file opens through the UGE reader.
  6. Confirm repeated UGE pattern IDs in orders are still shared after export (not flattened to unique 64-row copies).

---
