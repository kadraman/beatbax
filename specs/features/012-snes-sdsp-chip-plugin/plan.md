# Implementation Plan: SNES S-DSP Built-in Chip Plugin

**Spec**: [spec.md](spec.md) | **Migrated**: 2026-09-03

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [ ] No invented syntax or undocumented language behavior
- [ ] AST / ISM / scheduler / expansion impact identified (or N/A)
- [ ] Plugins remain isolated; core does not gain plugin dependencies
- [ ] Determinism and compatibility preserved (or migration documented)
- [ ] Tests planned for new behavior

## Implementation Plan

Implement in ordered phases; each phase should leave tests green.

### Phase 1 — Core plugin scaffold

1. Create `packages/engine/src/chips/snes/` directory structure.
2. Implement `plugin.ts` exporting `snesPlugin` with `name: 'snes'`, `channels: 8`, and channel factory dispatch.
3. Add `snesPlugin` to `BUILTIN_CHIP_PLUGINS` in [`packages/engine/src/chips/builtin-chips.ts`](../../packages/engine/src/chips/builtin-chips.ts).
4. Add `./chips/snes` export to [`packages/engine/package.json`](../../packages/engine/package.json).
5. Add parser support for `chip snes` directive and 8-channel validation.

### Phase 2 — BRR sample pipeline

1. Implement `brr.ts` — BRR block decoder (9-bit samples, filter modes 0–3, loop/end flags).
2. Implement `brrEncode.ts` — PCM → BRR encoder for CLI.
3. Implement `brrSamples.ts` — bundled `@snes/*` sample library.
4. Add `resolveSampleAsset()` and `preloadForPCM()` to `snesPlugin`.
5. Add CLI command `beatbax convert wav2brr`.

### Phase 3 — Voice backends and ADSR

1. Implement `adsr.ts` — hardware envelope rate tables (attack/decay/sustain/release).
2. Implement `voice.ts` — S-DSP voice backend with pitch (14-bit), Gaussian interpolation, key on/off.
3. Wire `createChannel()` to instantiate 8 voice backends.
4. Implement `validate.ts` — instrument field validation.

### Phase 4 — Echo and mixing

1. Implement `echo.ts` — global echo buffer, FIR filter, feedback, EDL/ESA management.
2. Implement `mixer.ts` — 32 kHz stereo output from voice sum + echo return.
3. Add song-level `echo` directive parsing and validation.
4. Support `echo_off` per-instrument (DIR bit).

### Phase 5 — AST, parser, and macros

New instrument fields:

| Field | Type | Description |
|-------|------|-------------|
| `brr_sample` | `string` | BRR sample reference (`@snes/*`, URL, `local:`) |
| `adsr` | `a,d,s,r` | Hardware ADSR nibbles (0–15 each) |
| `vol_l` | `0`–`127` | Per-voice left volume |
| `vol_r` | `0`–`127` | Per-voice right volume |
| `echo_off` | `boolean` | Disable echo for this voice (DIR bit) |
| `vol_env` | `[v0,v1,…\|N]` | Software volume macro (0–127 levels) |
| `pitch_env` | `[s0,s1,…\|N]` | Software pitch macro (semitone offsets) |

Parser changes:

- Accept `chip snes` directive.
- Validate exactly 8 channels for SNES songs.
- Allow `type=voice` instrument type.
- Parse `brr_sample`, `adsr`, `vol_l`, `vol_r`, `echo_off`, `vol_env`, `pitch_env`.
- Parse song-level `echo` directive with `fb`, `edl`, `evol_l`, `evol_r`, `esa`.
- Reject NES/GB/SMS-only fields when `chip snes` is active.
- Reject per-note `echo` effect with diagnostic: "use song-level `echo on` directive".
- Reject `sweep` and `duty_env` with clear diagnostics.

### Phase 6 — Web UI and CLI integration

**Web UI:**

- SNES appears in data-driven built-in chips list in Settings → Plugins (locked "Built-in" badge).
- Update [`apps/web-ui/src/utils/chip-meta.ts`](../../apps/web-ui/src/utils/chip-meta.ts) labels from `Ch N` to `Voice N`.
- Add syntax highlighting for `brr_sample`, `adsr`, `vol_l`, `vol_r`, `echo_off`, `echo` directive.
- Add `ui-contributions.ts` and `songWizard.ts` for SNES starter songs.

**CLI:**

- No plugin discovery needed (built-in).
- `beatbax verify` emits SNES-specific validation errors.
- `beatbax convert wav2brr` for sample preparation.
- Include SNES in chip selection/help listings.

### Phase 7 — Sample songs and documentation

Add under `songs/snes/`:

- `snes-smoke-test.bax` — minimal 3-voice playback
- `echo-demo.bax` — global echo with wet/dry comparison
- `adsr-demo.bax` — envelope sculpting showcase
- `stereo-demo.bax` — vol_l/vol_r panning patterns
- `orchestral-demo.bax` — layered BRR ensemble

Maintain chip docs (prerequisites for this feature):

- [`docs/chips/snes/hardware_guide.md`](../chips/snes/hardware_guide.md)
- [`docs/chips/snes/composition_guide.md`](../chips/snes/composition_guide.md)
- [`docs/chips/snes/interesting_facts.md`](../chips/snes/interesting_facts.md)

Update [`ROADMAP.md`](../../ROADMAP.md): add SNES as a planned built-in chip; qualify the "exclude sample-based" principle to exclude Amiga-style streaming, not S-DSP BRR playback.

### Export Changes

v1 export behavior:

- JSON/ISM export: full SNES semantics preserved.
- MIDI export: map pitch events normally; map `vol_l`/`vol_r` to CC#10/CC#11 approximations.
- WAV preview/export: 32 kHz stereo render.

Post-v1 native export candidates:

- **`.spc` export:** SPC700 program generation from register-intent stream (separate feature).
- **Register dump export:** Per-tick S-DSP register log for emulator/homebrew drivers.

---

## Testing Strategy

### Unit Tests

- BRR block decode: all filter modes, loop/end flags, 9-bit sample reconstruction.
- BRR encode round-trip: PCM → BRR → decode → PCM within tolerance.
- ADSR envelope: rate tables, attack/decay/sustain/release stage transitions.
- Echo buffer: feedback, delay length, FIR filter output.
- Pitch calculation: 14-bit pitch register from MIDI note + sample base rate.
- Gaussian interpolation: sample output at fractional positions.
- `vol_l` / `vol_r` clamping and stereo mix.

### Integration Tests

- Parse → resolve → schedule → render determinism snapshots for representative SNES songs.
- 8-channel validation: reject 9th channel assignment.
- Echo on/off: wet/dry output difference measurable in PCM hash.
- `echo_off` per-instrument: voice excluded from echo buffer.
- Bundled `@snes/*` sample resolution in CLI and test environment.
- Unsupported field diagnostics under `chip snes`.

### Regression Tests

- Ensure no behavioral changes to Game Boy/NES/SMS backends.
- Ensure built-in registration order does not affect other chips.
- Ensure ISM stability: same input yields same scheduled events/output hashes.

---

## Migration Path

No migration required for existing songs.

Adoption path:

1. Add `chip snes` at top of new songs.
2. Define instruments with `type=voice` and `brr_sample` references.
3. Set `adsr` and `vol_l`/`vol_r` for articulation and stereo placement.
4. Optionally add `echo on` with `fb`, `edl`, `evol_l`, `evol_r` for spatial depth.
5. Use `beatbax convert wav2brr` to prepare custom samples.

---
