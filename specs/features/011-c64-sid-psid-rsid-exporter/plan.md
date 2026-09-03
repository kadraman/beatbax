# Implementation Plan: C64 SID PSID/RSID Exporter Plugin

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

- Define the minimal internal SID playback-program representation used for file generation.
- Reuse the same SID-target lowering assumptions as preview/regression where practical.
- Reject songs whose features cannot be represented safely in the chosen PSID/RSID mode.

### CLI Changes

- Register exporter format names such as `sid`, `psid`, or `rsid` according to existing exporter conventions.
- Surface whether output was emitted as PSID or RSID.

### Documentation Updates

- Document supported metadata fields and known constraints.
- Cross-link from the SID chip plugin spec and chip docs.

## Testing Strategy

### Unit Tests

| Area | Cases |
|------|-------|
| Header writing | PSID/RSID header fields, offsets, metadata encoding |
| Lowering | deterministic control-program generation from fixed song inputs |
| Validation | reject unsupported export combinations or missing SID metadata |

### Integration Tests

- Export a SID smoke-test song to PSID and snapshot the binary or normalized structural fields.
- Export a compatible song to RSID and verify deterministic output.
- Compare repeated exports for byte-for-byte stability.

## Migration Path

- Backward compatible; no changes to existing songs.
- Requires the SID chip target and explicit model/region selection.
