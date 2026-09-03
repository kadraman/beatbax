---
title: "C64 SID PSID/RSID Exporter Plugin"
id: 11
slug: "c64-sid-psid-rsid-exporter"
status: "specified"
authors:
  - "kadraman"
  - "GitHub Copilot"
created: "2026-05-30"
updated: "2026-09-03"
issue: "<LINK_TO_GITHUB_ISSUE>"
area: "export"
---
## Summary

Implement a SID file exporter as a standalone BeatBax exporter plugin: `@beatbax/plugin-exporter-sid`.

Initial output targets:

- PSID (`.sid`) for archival/playback workflows
- RSID (`.sid`) for stricter C64-oriented playback compatibility where appropriate

The exporter should consume validated BeatBax song data for the SID target and emit deterministic SID-file output suitable for emulator/player playback and distribution.

## Problem Statement

The planned SID chip plugin provides live preview and a deterministic register-log path, but BeatBax currently has no archival/export format for C64 SID playback ecosystems.

PSID/RSID are the canonical interchange and playback formats for SID music sharing. Without them:

- BeatBax SID songs cannot be distributed in the standard playback format used by many emulators and players.
- There is no stable archival artifact for regression and cross-tool comparison.
- The C64 SID target remains preview-only inside BeatBax.

PSID/RSID are not the primary homebrew-driver integration format. They are still necessary as the standard playback and archival output for the SID ecosystem.

## Proposed Solution

### Summary

Create `packages/plugins/export-sid/` as a standalone npm package (`@beatbax/plugin-exporter-sid`) that:

- Implements the BeatBax `ExporterPlugin` interface
- Supports `supportedChips: ['sid']`
- Consumes validated ISM plus SID-target backend helpers to produce a deterministic SID playback program
- Emits PSID in v1 and RSID where the generated playback constraints are satisfied
- Uses song metadata to populate title, author, copyright, and playback metadata fields

Registration is explicit. A host may expose the exporter via exporter discovery/registration or by forwarding it from the SID chip plugin once implemented.

### Design principles

1. **Exporter plugins consume validated BeatBax song data** — the exporter may rely on SID-specific lowering helpers, but the core input contract remains validated ISM/song data.
2. **Playback correctness over exotic headers** — v1 should generate stable, broadly playable files before attempting edge-case compatibility tricks.
3. **Profile fidelity matters** — emitted playback data must preserve explicit `chipModel` and `chipRegion` intent where representable.
4. **No preview-only shortcuts** — export must derive from the same deterministic SID control/register program used for regression.

### Output scope

Included in v1:

- PSID file emission
- RSID file emission when song/export constraints are satisfiable
- SID metadata tagging from BeatBax metadata
- Deterministic output for the same song/profile input

Excluded in v1:

- Multi-SID files
- Arbitrary hand-tuned player-driver optimization
- Unsupported playback tricks that require direct C64 program authoring outside BeatBax’s declarative model

### Architecture

The exporter should be layered as:

1. validated BeatBax song input
2. SID-target lowering into a deterministic control/register program
3. packaging that program into PSID/RSID file structure

This keeps exporter behavior aligned with the SID chip plugin while respecting the standalone exporter-plugin architecture.

### Package structure

```
packages/plugins/export-sid/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                # ExporterPlugin entry
│   ├── sid-header.ts           # PSID/RSID header writer
│   ├── sid-program.ts          # Lowered playback/register program builder
│   ├── sid-lowering.ts         # ISM -> SID-target control program
│   ├── sid-metadata.ts         # Metadata mapping
│   ├── validate-export.ts      # Export preflight checks
│   └── version.ts
├── tests/
│   ├── sid-header.test.ts
│   ├── sid-lowering.test.ts
│   ├── validate-export.test.ts
│   └── exporter.test.ts
└── README.md
```

## Future Enhancements

| Enhancement | Notes |
|-------------|-------|
| Multi-SID support | Separate feature |
| Richer metadata support | Expand when playback compatibility is verified |
| Export-time driver optimization | Only after baseline correctness |

## Open Questions

1. Should PSID be the default export mode with RSID as an opt-in strict target, or should the exporter auto-select based on song constraints?
2. How much of the SID playback program should be shared as library code with the chip plugin versus duplicated inside exporter-specific lowering?

## References

- `ROADMAP.md` — SID export direction
- `docs/features/c64-sid-chip-plugin.md` — SID chip-plugin source semantics
- `docs/features/complete/exporter_plugin_system.md` — exporter plugin architecture
