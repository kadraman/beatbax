# Implementation Plan: C64 SID GoatTracker Exporter Plugin

**Spec**: [spec.md](spec.md) | **Migrated**: 2026-09-03

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [ ] No invented syntax or undocumented language behavior
- [ ] AST / ISM / scheduler / expansion impact identified (or N/A)
- [ ] Plugins remain isolated; core does not gain plugin dependencies
- [ ] Determinism and compatibility preserved (or migration documented)
- [ ] Tests planned for new behavior

## Implementation Plan

### Export Model

- Define the exact GoatTracker-facing artifact for v1 before coding begins.
- Start with a constrained subset that maps cleanly from BeatBax SID songs.
- Explicitly reject unsupported feature combinations such as mappings that require tracker semantics BeatBax does not currently preserve.

### CLI Changes

- Register exporter format names according to the final artifact, for example `goattracker` or `gt-sng`.
- Surface clear diagnostics when a song cannot be exported losslessly enough for the v1 contract.

### Documentation Updates

- Document the supported subset and known limitations.
- Cross-link from the SID chip plugin and roadmap/homebrew notes.

## Testing Strategy

### Unit Tests

| Area | Cases |
|------|-------|
| Pattern lowering | simple melodic patterns, repeated orders, order reuse |
| Instrument lowering | waveform, pulse-width, filter, and modulation subset mapping |
| Validation | reject unsupported sync/ring/filter combinations when tracker mapping is not representable |
| Serialization | deterministic file/interchange encoding |

### Integration Tests

- Export a SID smoke-test song to the v1 GoatTracker-oriented artifact.
- Snapshot intermediate lowered tracker structures for stability.
- Verify repeated exports are deterministic.

## Migration Path

- Backward compatible; no changes to existing songs.
- Intended for users targeting C64 tracker/homebrew workflows after SID chip support exists.
