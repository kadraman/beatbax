# Implementation Plan: NES DMC sample kit expansion

**Spec**: [spec.md](spec.md) | **Date**: 2026-11-07 | **Branch**: `feat/109-nes-dmc-sample-kit`

## Summary

Generate license-clean mono 16-bit WAVs (original synthesis; optional CC0), convert with `beatbax convert wav2dmc`, embed base64 in `dmcSamples.ts`, retarget selected NES songs and the song wizard, and align docs/UI lists with the new keys.

## Technical context

- **Packages / surfaces**: `packages/engine` (NES chip), `songs/nes`, `samples/dmc`, `docs/chips/nes`, CLI `wav2dmc` (existing)
- **Language**: TypeScript (strict), ESM
- **Testing**: Jest via `npm test` (NES plugin tests)
- **Client profile**: engine-only library + song/docs updates (Desktop/Web resolve `@nes/` the same way)
- **Performance / constraints**: Keep total new base64 well under ~40 KB; hardware max 4081 bytes per sample

## Constitution Check

GATE: must pass before implementation. Re-check after design changes.

- [x] No invented syntax or undocumented language behavior
- [x] AST / ISM / scheduler / expansion impact identified (or N/A) — N/A; sample data and song text only
- [x] Plugins remain isolated; core does not gain plugin dependencies
- [x] Determinism and compatibility preserved (or migration documented) — classic kick/snare bytes preserved
- [x] Tests planned for new behavior

**Exceptions**: none

## Project structure

| Path | Change |
|------|--------|
| `samples/wav/nes_kit/` | Source WAVs (generated) |
| `samples/dmc/*.dmc` | Encoded hits + NOTICE |
| `packages/engine/src/chips/nes/dmcSamples.ts` | Register base64 + meta |
| `packages/engine/src/chips/nes/ui-contributions.ts` | Kit name lists |
| `packages/engine/src/chips/nes/songWizard.ts` | Starter instruments |
| `packages/engine/tests/nes/nes-plugin.test.ts` | Key / alias assertions |
| `songs/nes/{battle_fanfare,wily_fortress,puffball_parade,iron_keep}.bax` | Retarget DMC insts |
| `songs/nes/instruments/nes_dmc_demo.bax` | Bass, hats, voice |
| `docs/chips/nes/composition_guide.md` | Prep + speech pairs |

## Implementation

### Sample generation

1. Convert CC0 WAVs (plus original synth replacements after audition) for kick_punch, kick_body, snare_tight, snare_fat, hat_closed, hat_open, crash, rim, shaker, cowbell, 808/909-*style* originals (`kick_808`, `snare_808`, `hat_808`, `hat_open_808`, `clap_808`, `kick_909`, `snare_909` — not ROM dumps), bass_saw_c2 (+ pitched c1/d1/e1/g1/a1; C2 highest), orch_hit, orch_hit_up, Kenney voices, and a sped-up voice_ready take (encode@15 / play@12).
2. Convert each with `wav2dmc --dmc-rate 15 --gain 0.5 --trim-silence -45 --tail-ms 8 --fade-out-ms 4` and appropriate `--max-duration-ms`.
3. Write `samples/dmc/NOTICE` with provenance (BeatBax Team / original synthesis / CC0 if any).
4. Embed `.dmc` bytes as base64 in `dmcSamples.ts`; set meta (`designedRate: 12` for `voice_ready`, `baseNote: 'C2'` for `bass_saw_c2`).

### Compatibility

- Keep existing `kick` / `snare` / latin kit / `bass_c2` entries.
- Add `kick_classic` / `snare_classic` aliases to the same classic bytes.
- Point `hihat` at `hat_closed`; give `crash` unique bytes.
- Optionally alias `bass` → `bass_saw_c2` so the demo’s historical name resolves.

### Songs / wizard / docs

As in [spec.md](spec.md) US2–US3. Do not touch kingdom_hall, shadow_temple, silver_orbit, or effect fixtures’ sample choice.

### AST / Parser / CLI / Export

No changes. Existing `wav2dmc` is sufficient.

## Testing strategy

### Unit tests

- New keys present in `BUNDLED_SAMPLES` / meta.
- `hihat` ≠ `clap`; `crash` ≠ `clap`.
- Classic `kick` / `snare` byte length and (optional) prefix match pre-change fixtures if tests snapshot them; otherwise keep existing decode smoke tests plus classic aliases.

### Integration tests

- Optional: resolve `@nes/voice_ready` and assert designedRate 12.

### Manual / QA

- Play retargeted songs and `nes_dmc_demo.bax` in Desktop or CLI.

## Migration and compatibility

Songs that already use `@nes/kick` / `@nes/snare` keep the thin classic sound until authors opt into punch/body names. Retargeted demos opt in explicitly.

## Open implementation questions

- Prefer fully original synthesis for the first ship so NOTICE is trivial; CC0 Freesound can replace individual hits later without API changes.
