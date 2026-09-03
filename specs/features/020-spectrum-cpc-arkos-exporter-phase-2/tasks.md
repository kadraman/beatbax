# Tasks: Spectrum-128 / Amstrad CPC Arkos Exporter — Phase 2 (full compatibility)

**Input**: [spec.md](spec.md), [plan.md](plan.md)

Migrated checklist (normalize to `Tnnn` format as work proceeds):

## Implementation Checklist

- [ ] Spec AT3 mapping table for each BeatBax Spectrum field/effect
- [ ] Implement `arp_env` → Arkos arpeggio expressions
- [ ] Implement `pitch_env` → Arkos pitch expressions / cells
- [ ] Implement `vol_env` → multi-cell volume instruments
- [ ] Implement `env_bass` / `env_shape` → hardware envelope instruments
- [ ] Implement `noise_frames` / `tone_frames` / `tone_vol` percussion lowering
- [ ] Map or diagnose inline effects (`volSlide` first)
- [ ] Relax/replace v1 blanket validation bans
- [ ] CPC clock / pitch validation in AT3
- [ ] Snapshot + integration tests for demo songs above
- [ ] Update exporter README and Spectrum docs
- [ ] Manual AT3 open/play checklist for phase-2 fixtures
