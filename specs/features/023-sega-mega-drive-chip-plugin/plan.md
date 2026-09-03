# Implementation Plan: Sega Mega Drive / Genesis YM2612 + PSG Chip Plugin

**Spec**: [spec.md](spec.md) | **Migrated**: 2026-09-03

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [ ] No invented syntax or undocumented language behavior
- [ ] AST / ISM / scheduler / expansion impact identified (or N/A)
- [ ] Plugins remain isolated; core does not gain plugin dependencies
- [ ] Determinism and compatibility preserved (or migration documented)
- [ ] Tests planned for new behavior

## Implementation Plan

Implement in ordered phases; each phase should leave tests green. This section specifies implementation work — it is not executed as part of this documentation feature.

### Phase 1 — Package scaffold and chip directive

1. Create `packages/plugins/chip-genesis/` with `ChipPlugin` (`name: 'genesis'`, `aliases: ['megadrive', 'md']`, `channels: 10`, `status: 'Experimental'`).
2. Add the workspace to root `package.json`, plus `chip-genesis:build` / `chip-genesis:test` scripts.
3. Parser: accept `chip genesis` / `megadrive` / `md` and optional `ntsc` / `pal` (extend the region-qualifier allow-list beyond `sms` and `nes`).
4. Validate exactly 10 channels.
5. Register in `[packages/app-core/src/plugins/registry-config.ts](../../packages/app-core/src/plugins/registry-config.ts)` (commented SID-style entry becomes a real `AVAILABLE_PLUGINS` item). Wire CLI + desktop the same way as SMS.

**Gate:** `chip genesis` parses; `chipRegistry.has('genesis')` is true after host load; aliases resolve.

### Phase 2 — YM2612 core

1. `platform-profiles.ts` — NTSC/PAL clocks and frame rates.
2. `ym2612-period.ts` — MIDI/freq → block + 11-bit f-number.
3. `ym2612-fm.ts` / `ym2612-chip.ts` — 6 voices × 4 operators, 8 algorithms, feedback, envelopes, global LFO. Deterministic approximation (not Nuked-OPN2).
4. Unit tests: frequency formula, envelope stage transitions, algorithm routing smoke, LFO enable, repeated-step determinism.

**Gate:** `ym2612-fm.test.ts` passes; two runs produce identical PCM hashes for a one-voice sine-like patch.

### Phase 3 — PSG backends

1. Tone period tables at Mega Drive NTSC/PAL clocks (same formula as SMS, MD master ÷15).
2. Noise white/periodic + `tone3`-derived rate.
3. Attenuation 0–15. No `gg:pan`.
4. Mix PSG centre with YM2612 stereo output.

**Gate:** PSG-only smoke song produces non-zero audio; `gg:pan` rejected.

### Phase 4 — Register intents, session, validation

1. `register-intent.ts`, `register-arbitrator.ts`, `register-log.ts`.
2. `channel-backend.ts` facades (no per-channel YM2612 instances).
3. `beginSongSession()` + `configureForSong({ chip, chipRegion })`.
4. `validate.ts` / `validate-song.ts` — operator bounds, type↔channel mapping, mixed volume, LFO conflicts, DAC/CSM/sweep/echo/`gg:pan`/`duty_env` errors.

**Gate:** Register log SHA-256 identical across 3 runs of `genesis-smoke-test.bax`.

### AST Changes

Prefer additive, optional fields on existing instrument nodes (no structural AST redesign).

#### FM hardware fields


| Field       | Type                     | Description                                       |
| ----------- | ------------------------ | ------------------------------------------------- |
| `alg`       | `0`–`7`                  | Algorithm                                         |
| `fb`        | `0`–`7`                  | Feedback                                          |
| `ams`       | `0`–`3`                  | LFO amplitude sensitivity                         |
| `fms`       | `0`–`7`                  | LFO frequency sensitivity                         |
| `pan`       | `"L" | "C" | "R"`        | YM2612 L/R bits                                   |
| `op1`…`op4` | compact `key:value` list | Per-operator DT/MUL/TL/KS/AR/DR/SR/RR/SL/SSG/AM   |
| `patch`     | `string`                 | `@genesis/<name>` bundled patch                   |
| `tl`        | `0`–`127`                | Optional carrier TL override (after patch expand) |
| `lfo`       | `"off"` or `0`–`7`       | Per-instrument LFO request (must not conflict)    |




#### PSG hardware + macro fields (SMS-compatible)


| Field            | Type                   | Description         |
| ---------------- | ---------------------- | ------------------- |
| `noise_mode`     | `"white" | "periodic"` | LFSR feedback       |
| `noise_rate`     | `0 | 1 | 2 | "tone3"`  | Noise clock         |
| `vol_env`        | `[v0,v1,…|N]`          | Attenuation 0–15    |
| `arp_env`        | `[s0,s1,…|N]`          | Semitone offsets    |
| `pitch_env`      | `[s0,s1,…|N]`          | Semitone offsets    |
| `noise_rate_env` | `[r0,r1,…|N]`          | Noise rate sequence |




#### Song-level


| Directive               | Description                                             |
| ----------------------- | ------------------------------------------------------- |
| `lfo <0-7>` / `lfo off` | Global YM2612 LFO. Preferred over per-instrument `lfo`. |




### Parser Changes

- Accept `chip genesis` (and aliases) with optional `ntsc` / `pal`.
- Validate exactly 10 channels.
- Allow instrument types `fm1`–`fm6`, `tone1`–`tone3`, `noise`.
- Parse `alg`, `fb`, `ams`, `fms`, `pan`, `op1`–`op4`, `patch`, FM `tl`, song-level `lfo`.
- Reuse SMS PSG field parsing for Mega Drive PSG types.
- Reject NES/GB/SMS-only fields that do not apply (`gg:pan`, `sweep`, `duty_env`, DMC/wave RAM, etc.) with chip-specific diagnostics.
- Reject `echo`, DAC, and Channel 3 special mode.
- Warn on PSG `retrig` (SMS wording).



### CLI Changes

- Auto-discover / depend on `@beatbax/plugin-chip-genesis` the same way as SMS.
- `beatbax verify` emits Genesis-specific validation errors.
- Include Genesis in chip selection / help listings (`list-chips`).



### Web UI Changes

- Add Genesis to `[AVAILABLE_PLUGINS](../../packages/app-core/src/plugins/registry-config.ts)` (label e.g. `Mega Drive (YM2612 + PSG)`).
- Channel labels already exist in `chip-meta` / `ui-tokens` (`FM 1`…`Noise`); keep them.
- Syntax highlighting for `fm1`–`fm6`, `op1`–`op4`, `alg`, `fb`, `patch`, `lfo`.
- `ui-contributions.ts` and `songWizard.ts` with FM + PSG starter templates (console variant can mention Genesis / Mega Drive as one hardware target, two regional clocks).



### Export Changes

v1 export behavior:

- JSON/ISM: full Genesis semantics preserved (FM ops, PSG macros, LFO, pan).
- MIDI: map pitch normally; map FM `pan` to CC#10; TL/vol to CC#7 approximations.
- WAV preview/export: stereo render (FM pan + centred PSG).

Post-v1 native export:

- **VGM:** new backend in `@beatbax/plugin-exporter-vgm` — `supportedChips: ['genesis']`, YM2612 clock at header `0x2C`, interleaved `0x52`/`0x53` + `0x50`. Declare via `exporterPlugins` once the backend exists. Separate feature, referenced from `[vgm-exporter-plugin.md](complete/vgm-exporter-plugin.md)`.
- **GYM:** optional later archival format.
- Register-dump text export for debugging.



### Documentation Updates

Add during implementation (not part of this documentation-only change):

- `docs/chips/genesis/hardware_guide.md`
- `docs/chips/genesis/composition_guide.md`
- `docs/chips/genesis/interesting_facts.md`
- `packages/plugins/chip-genesis/README.md`
- `[ROADMAP.md](../../ROADMAP.md)` — mark YM2612 in progress / done; canonical package name `@beatbax/plugin-chip-genesis` (replace the `plugin-chip-ym2612` suggestion)
- `[docs/contributing/creating-plugins.md](../contributing/creating-plugins.md)` — status 📋 Planned → implemented
- `[docs/grammar/metadata-directives.md](../grammar/metadata-directives.md)` — `chip genesis ntsc|pal` on the region-qualifier allow-list
- This feature document → `docs/features/complete/` when the plugin ships

Sample songs under `songs/genesis/`:

- `genesis-smoke-test.bax` — one FM voice + one PSG tone + noise
- `fm-algorithm-demo.bax` — algorithms 0–7
- `lfo-demo.bax` — global LFO + AMS/FMS
- `stereo-demo.bax` — FM pan L/C/R
- `psg-drums-demo.bax` — noise kit + tone3-clocked metal
- `title-theme-demo.bax` — layered FM + PSG arrangement

---

## Testing Strategy



### Unit Tests

- F-number / block from MIDI note at NTSC and PAL clocks.
- Operator envelope: AR→DR→SR→RR stage transitions and TL attenuation.
- Algorithms 0–7: carrier vs modulator contribution (non-zero carriers; silent-only-modulator sanity).
- Feedback on operator 1.
- LFO enable/rate; AMS/FMS apply only when LFO is on.
- PSG period calculation and clamping at MD clocks.
- Noise deterministic output for white/periodic and `tone3` mode.
- Register log serialization stability.
- `validateInstrument`: op field bounds, PSG 0–15 vs FM 0–127, `gg:pan` rejected, `dac` rejected.



### Integration Tests

- Parse → resolve → schedule → render determinism snapshots for representative Genesis songs.
- 10-channel validation: reject 11th channel; reject `fm1` on channel 7; reject `noise` on channel 1.
- PAL vs NTSC: period/f-number tables differ; frame rate 50 vs 60.
- LFO conflict: two instruments with different `lfo` on the same tick → error.
- Alias resolution: `chip megadrive` and `chip md` select the same plugin.
- Unsupported field diagnostics under `chip genesis`.



### Regression Tests

- No behavioral changes to Game Boy / NES / SMS / Spectrum backends.
- Plugin loading order does not affect selected chip behavior.
- ISM stability: same input yields same scheduled events / output hashes.
- SMS songs still reject Genesis-only fields (`alg`, `op1`, `lfo`).

---

## Migration Path

No migration required for existing songs.

Adoption path:

1. Enable the Genesis plugin in Settings → Plugins (or CLI auto-discovery).
2. Add `chip genesis` (optionally `ntsc` / `pal`) at the top of a new song.
3. Define FM instruments with `type=fmN` and `op1`–`op4` (or `patch="@genesis/…"`).
4. Define PSG instruments with SMS-style `tone*` / `noise` fields on channels 7–10.
5. Optionally set song-level `lfo` and FM `pan`.

`[ROADMAP.md](../../ROADMAP.md)` currently suggests `@beatbax/plugin-chip-ym2612`. Canonical name is `@beatbax/plugin-chip-genesis`, matching plugin-system docs, UI `genesis` keys, and this spec. Update ROADMAP when the plugin lands; do not publish a second package name.

---
