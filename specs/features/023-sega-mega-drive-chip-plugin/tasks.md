# Tasks: Sega Mega Drive / Genesis YM2612 + PSG Chip Plugin

**Input**: [spec.md](spec.md), [plan.md](plan.md)

Migrated checklist (normalize to `Tnnn` format as work proceeds):

## Implementation Checklist

- [ ] Create `packages/plugins/chip-genesis/` package scaffold
- [ ] Implement `plugin.ts` / `index.ts` with 10 channel factories and `beginSongSession`
- [ ] Implement YM2612 register file, 4-op FM core, envelopes, LFO
- [ ] Implement SN76489 tone + noise at Mega Drive clocks (no `gg:pan`)
- [ ] Implement register intents, arbitrator, and deterministic register log
- [ ] Add `chip genesis` / `megadrive` / `md` plus `ntsc`/`pal` to the parser
- [ ] Add FM instrument fields (`alg`, `fb`, `op1`–`op4`, `patch`, `pan`, `ams`, `fms`)
- [ ] Add song-level `lfo` directive
- [ ] Validate mixed FM/PSG volume ranges
- [ ] Reject DAC, CSM, `gg:pan`, `sweep`, `echo`, `duty_env`
- [ ] Register in `registry-config.ts`, CLI, desktop, root workspace
- [ ] Add `ui-contributions.ts` and `songWizard.ts`
- [ ] Add unit + integration + regression tests
- [ ] Add sample songs under `songs/genesis/`
- [ ] Add chip docs under `docs/chips/genesis/`
- [ ] Update `ROADMAP.md`, `creating-plugins.md`, and `metadata-directives.md`

---
