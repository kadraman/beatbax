# Implementation Plan: MIDI import chip profiles for SMS and ZX Spectrum 128

**Spec**: [spec.md](spec.md) | **Date**: 2026-10-08 | **Branch**: `feat/094-midi-import-sms-spectrum`

## Summary

Generalise the importer's chip-specific code paths (role table, role names, kit emission, articulation) from a two-way `gameboy` / `nes` switch to a per-chip profile, then add SMS and Spectrum 128 profiles. Packing, reduction, lanes, quantize, naming and emit stay chip-independent. The Spectrum profile adds one rule: when drums exist, channel 2 is the drum channel.

## Technical context

- **Packages / surfaces**: `packages/engine/src/import/midi/*` (profiles, config, kit), `packages/cli` (help text, verify-based tests), docs
- **Language**: TypeScript (strict), ESM; engine code stays browser-safe and plugin-free
- **Testing**: Jest via `npm test`; engine golden tests in `packages/engine/tests/import/midi/`; CLI tests in `packages/cli/tests/import-midi.test.ts` run `verify` with plugins loaded
- **Constraints**: GB/NES output byte-identical (FR-040)

## Constitution Check

- [x] No invented syntax or undocumented language behavior: output uses existing `chip sms` / `chip spectrum-128` instrument fields documented by the plugins and chip guides
- [x] AST / ISM / scheduler / expansion impact: none; the importer only writes `.bax` text
- [x] Plugins remain isolated; core does not gain plugin dependencies (FR-042)
- [x] Determinism and compatibility preserved (FR-040, FR-041)
- [x] Tests planned for new behavior

## Project structure

| Path | Change |
| ---- | ------ |
| `packages/engine/src/import/midi/types.ts` | `MidiChipId` + `sms`, `spectrum-128`; `ChipRole` + `tone1..3`; `FamilyArticulation` + `sms`, `ay` |
| `packages/engine/src/import/midi/chipRoles.ts` | Profile table per chip; `rolesForChip`, `normaliseRoleForChip` (aliases, FR-003); Spectrum drum-channel rule |
| `packages/engine/src/import/midi/config.ts` | `SUPPORTED_CHIPS`; `families.*.sms` / `.ay` parsing; chip-aware target check in `resolveConvertOptions`; error text lists four chips |
| `packages/engine/src/import/midi/kit.ts` | `emitMelodicInstLine` / `emitKitLines` dispatch per chip; SMS and AY melodic lines and drum kits; default articulations |
| `packages/engine/src/import/midi/roles.ts`, `pack.ts` | Role hints resolve through the chip profile; Spectrum budget 2 when drums present; drum stream targets channel 2 |
| `packages/engine/src/import/midi/index.ts` | `pitch_below_chip_range` octave raise for SMS (after reduction, before packing); `dmc_reinforcement_ignored`, `role_alias`, `drums_share_tone_channel` diagnostics |
| `packages/engine/tests/import/midi/midi-chip-profiles.test.ts` (new) | Role tables, aliases, errors, kits contain only chip-valid fields, Spectrum drum channel, SMS low-pitch raise |
| `packages/engine/tests/import/midi/midi-golden.test.ts` + fixtures | New goldens: SMS and Spectrum, melodic-only and with drums (reuse `f02-gb-kit.mid`, `f04-gm-drums.mid`) |
| `packages/cli/src/import-midi.ts`, `packages/cli/tests/import-midi.test.ts` | Help/errors; `verify` passes on the four new goldens |
| `docs/features/midi-importer.md` | Chip table, role aliases, Spectrum drum rule, `families.*.sms/ay` |

## Implementation

### AST changes

None.

### Parser / grammar changes

None.

### Importer changes

- **Profiles.** Replace `if (chip === 'nes') … else gameboy` branches with a `ChipProfile` record: `roles` (role table), `aliases`, `melodicLine(name, role, family, gm, art)`, `drumLines(options)`, `pitchFloor?`. GB and NES profiles wrap today's functions unchanged, so their output does not move.
- **Role aliases.** `normaliseRoleForChip(role, chip)` maps GB/NES names to `tone1..3` on SMS/Spectrum and throws for incompatible roles (`tone*` on GB/NES, `dmc` off NES). Called from `resolveConvertOptions` over `trackMappings` and from role hinting.
- **Spectrum drums.** Before packing, if any drum stream exists, reserve channel 2 for the drum group and reduce the melodic budget to 2. Lanes that target `tone2` are packed with the drum lane in config order (089 lane rules apply unchanged).
- **SMS low pitch.** After reduction and before packing, raise melodic notes below MIDI 45 (A2) by octaves; count per channel. Exact floor confirmed against `packages/plugins/chip-sms/src/periodTables.ts` (10-bit period, NTSC clock) in T010.
- **Kits.** SMS drum lines adapted from `smsSongWizard` (kick, snare, hihat, shaker) plus `ghost` and `crash`. AY drum lines from the composition guide recipes, all with one shared `noise_rate`.

### CLI changes

`--chip` description and the missing-chip error list the four chips.

### Desktop / web UI changes

None (spec 096).

### Export changes

None.

### Documentation updates

`docs/features/midi-importer.md`: chip table, aliases, Spectrum layout, articulation keys, a worked SMS example.

## Testing strategy

### Unit tests

- Role tables and budgets per chip; alias mapping and error messages (FR-002, FR-003).
- Kit lines: SMS and AY lines contain none of `duty`, `uge_note`, `noise_period`, `dmc_`, `wave=`, GB `env=`; all AY drums share one `noise_rate` (FR-012, FR-023).
- Spectrum: drums present → channel 2 drums, budget 2, `drums_share_tone_channel`; no drums → channel 2 melodic.
- SMS: a C2 note becomes C3 with one `pitch_below_chip_range` warning.
- `families.*.sms` / `.ay` parse and validation errors; `dmcReinforcement` ignored with warning.

### Integration tests

- Goldens for SMS and Spectrum; existing goldens unchanged (SC-001, SC-002).
- CLI: convert each new golden and run `verify` with plugins loaded (FR-042, SC-002).

### Manual / QA

- Convert two `songs/midi` sources per chip and listen in Desktop (SC-003).

## Migration and compatibility

Additive. Existing configs work on the new chips through role aliases. Game Boy and NES output is unchanged.

## Open implementation questions

- Exact default SMS / AY family volumes and envelopes (FR-030): tune by ear in T020/T030 and record them in `docs/features/midi-importer.md`.
