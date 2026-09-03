# Tasks: SNES S-DSP Built-in Chip Plugin

**Input**: [spec.md](spec.md), [plan.md](plan.md)

Migrated checklist (normalize to `Tnnn` format as work proceeds):

## Implementation Checklist

- [ ] Create `packages/engine/src/chips/snes/` module scaffold
- [ ] Implement `plugin.ts` with 8 channel factories
- [ ] Implement `voice.ts` S-DSP voice backend
- [ ] Implement `brr.ts` BRR decoder
- [ ] Implement `brrEncode.ts` and CLI `beatbax convert wav2brr`
- [ ] Implement `brrSamples.ts` bundled `@snes/*` library
- [ ] Implement `adsr.ts` hardware envelope generator
- [ ] Implement `echo.ts` global echo buffer
- [ ] Implement `mixer.ts` 32 kHz stereo output
- [ ] Add `snesPlugin` to `BUILTIN_CHIP_PLUGINS`
- [ ] Add `@beatbax/engine/chips/snes` package export
- [ ] Add parser support for `chip snes` and SNES instrument fields
- [ ] Add parser support for song-level `echo` directive
- [ ] Add SNES instrument + echo validator
- [ ] Reject unsupported effects/fields under `chip snes`
- [ ] Register in web-ui built-in chips list (data-driven)
- [ ] Update `chip-meta.ts` labels to `Voice N`
- [ ] Add `ui-contributions.ts` and `songWizard.ts`
- [ ] Add unit + integration + regression tests under `tests/snes/`
- [ ] Add sample songs under `songs/snes/`
- [ ] Add chip docs under `docs/chips/snes/`
- [ ] Update `ROADMAP.md` to include SNES

---
