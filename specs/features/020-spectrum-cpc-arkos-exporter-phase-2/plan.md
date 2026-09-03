# Implementation Plan: Spectrum-128 / Amstrad CPC Arkos Exporter — Phase 2 (full compatibility)

**Spec**: [spec.md](spec.md) | **Migrated**: 2026-09-03

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [ ] No invented syntax or undocumented language behavior
- [ ] AST / ISM / scheduler / expansion impact identified (or N/A)
- [ ] Plugins remain isolated; core does not gain plugin dependencies
- [ ] Determinism and compatibility preserved (or migration documented)
- [ ] Tests planned for new behavior

## Implementation Plan



### AST / Parser Changes

None expected. Use existing resolved song / instrument fields.

### Exporter Changes (`packages/plugins/export-arkos/`)

1. **Expressions** — emit real arpeggio/pitch tables from `arp_env` / `pitch_env` (beyond Default `0`).
2. **Multi-cell instruments** — lower `vol_env` and percussion frame recipes to instrument cell sequences with correct `speed`, `loopStartIndex`, `endIndex`, `isLooping`.
3. **Hardware envelope instruments** — map `env_bass` / `env_shape` to AT3 hardware links + envelope period/shape.
4. **Inline effects** — map representable effects (`volSlide` first); document/reject the rest.
5. **Validation** — replace blanket v1 field bans with per-field capability checks; keep clear diagnostics.
6. **Timing** — revisit `initialSpeed` / `stepsPerBar` / BPM mapping for songs that are not 16th-grid assumptions.
7. **CPC soak** — validate `chip cpc` exports open and pitch-match at 1 MHz.



### CLI / UI Changes

- Keep `export arkos` and `--instruments`.
- Surface phase-2 diagnostics consistently in CLI and desktop Problems/Output.
- Optional: desktop instrument-bank export action.



### Documentation Updates

- Expand `packages/plugins/export-arkos/README.md` supported/unsupported tables.
- Update Spectrum composition / export docs with “what exports to Arkos”.
- Cross-link from completed v1 feature doc.

## Testing Strategy



### Unit Tests

- Macro → expression / cell lowering for arp, pitch, vol
- Buzz-bass hardware link cells and shapes 8 / 10
- Percussion `noise_frames` / `tone_frames` cell sequences
- Effect mapping / rejection diagnostics
- Deterministic serializer snapshots



### Integration Tests

- Export and open (manual AT3 checklist) for:
  - `ay_macro_arp_pitch.bax`
  - `ay_buzz_bass.bax`
  - `ay_percussion_demo.bax`
  - `ay_all_macros.bax` (where jointly representable)
  - `cave_run_theme.bax` / CPC profile songs
  - `spectral_phantoms.bax` / `steel_justice.bax`
- Optional WAV A/B: BeatBax vs Arkos export for pitch/envelope smoke checks

## Migration Path

Additive. Songs that exported under v1 must keep working. Songs that previously failed validation become exportable when mapped.
