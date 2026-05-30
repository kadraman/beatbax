---
title: "C64 SID GoatTracker Exporter Plugin"
status: proposed
authors: ["kadraman", "GitHub Copilot"]
created: 2026-05-30
issue: "<LINK_TO_GITHUB_ISSUE>"
---

## Summary

Implement a GoatTracker-oriented SID exporter as a standalone BeatBax exporter plugin: `@beatbax/plugin-exporter-goattracker`.

Primary output intent:

- native-tracker-style export for C64 homebrew and SID production workflows
- deterministic song-data export that can be imported or adapted into GoatTracker-oriented pipelines

## Problem Statement

PSID/RSID solve archival and playback distribution, but they are not the most direct path into native C64 tracker and homebrew workflows.

For many SID users, the more useful deliverable is GoatTracker-oriented song data because it:

- aligns more closely with native C64 composition and driver workflows
- is easier to adapt into homebrew projects than archival playback files
- preserves the mental model of tracker patterns, instruments, and order data

Without a GoatTracker exporter, BeatBax’s SID support would still be weak for the homebrew use case explicitly called out in the roadmap.

## Proposed Solution

### Summary

Create `packages/plugins/export-goattracker/` as a standalone npm package (`@beatbax/plugin-exporter-goattracker`) that:

- Implements the BeatBax `ExporterPlugin` interface
- Supports `supportedChips: ['sid']`
- Converts validated SID-target BeatBax songs into a deterministic GoatTracker-oriented export format
- Prioritizes homebrew usability and tracker interoperability over archival playback packaging

The exact emitted artifact may be a GoatTracker song file, a constrained interchange representation, or a documented intermediate format if full native-file compatibility requires staged delivery. The exporter spec should make that explicit before implementation starts.

### Design principles

1. **Tracker fidelity over generic rendering** — preserve patterns, order data, and instrument intent where possible.
2. **Reject unsupported mappings clearly** — if a BeatBax SID feature cannot map cleanly into GoatTracker constraints, emit diagnostics rather than silently flattening it.
3. **Deterministic export** — identical song/profile inputs produce identical exported tracker data.
4. **Homebrew-first workflow** — prefer outputs that are actually useful in C64 development pipelines.

### Expected mapping pressure points

GoatTracker export will be harder than simple register-dump export because it must reconcile BeatBax song structure with tracker-native structures such as:

- instrument definitions
- tables and modulation patterns
- pattern data and order lists
- tempo/speed assumptions
- chip-model assumptions and playback-driver limitations

The exporter should define a constrained v1 mapping rather than overpromising full equivalence for every SID authoring pattern.

### Architecture

The exporter should be layered as:

1. validated BeatBax song input
2. SID-target semantic lowering
3. GoatTracker-structured pattern/order/instrument lowering
4. file or interchange serialization

This staging makes it possible to snapshot intermediate tracker-structured data in tests before final file serialization is perfect.

### Package structure

```
packages/plugins/export-goattracker/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                   # ExporterPlugin entry
│   ├── gt-lowering.ts             # ISM -> GoatTracker-oriented structures
│   ├── gt-patterns.ts             # Pattern conversion helpers
│   ├── gt-instruments.ts          # Instrument/table conversion helpers
│   ├── gt-orders.ts               # Order list generation
│   ├── gt-serialize.ts            # Final file or interchange writer
│   ├── validate-export.ts         # Export preflight checks
│   └── version.ts
├── tests/
│   ├── gt-lowering.test.ts
│   ├── gt-patterns.test.ts
│   ├── validate-export.test.ts
│   └── exporter.test.ts
└── README.md
```

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

## Implementation Checklist

- [ ] Create `@beatbax/plugin-exporter-goattracker` package
- [ ] Freeze the exact v1 output artifact and naming
- [ ] Implement SID-to-tracker lowering
- [ ] Implement pattern/order/instrument conversion
- [ ] Add validation for unsupported mappings
- [ ] Add deterministic export tests

## Future Enhancements

| Enhancement | Notes |
|-------------|-------|
| Broader SID feature coverage | Expand once baseline export subset is proven |
| Direct native-file parity | Depends on final understanding of GoatTracker format constraints |
| Round-trip import/export testing | Valuable after initial exporter lands |

## Open Questions

1. What exact GoatTracker artifact should v1 emit: native song file, constrained subset, or documented intermediate interchange?
2. Which BeatBax SID features are intentionally excluded from the first GoatTracker mapping pass to preserve correctness?
3. Should the exporter target one GoatTracker version first to avoid format drift?

## References

- `ROADMAP.md` — GoatTracker homebrew direction for SID
- `docs/features/c64-sid-chip-plugin.md` — SID chip-plugin source semantics
- `docs/features/complete/exporter_plugin_system.md` — exporter plugin architecture