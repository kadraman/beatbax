# Implementation Plan: MIDI import section/form and Beginner Mode output

**Spec**: [spec.md](spec.md) | **Date**: 2026-11-04 | **Branch**: `feat/104-midi-import-section-form`

## Summary

Add opt-in arrangement emit (`seqs` | `form` | `beginner`) to the MIDI importer. `seqs` stays the current `emit.ts` path. `form` and `beginner` reuse the same section slices and pattern playlists, then print spec 008 syntax. Eligibility for `beginner` is a check against the packed roles before any file is written. Lowering stays in the existing composition expand pass.

## Technical context

- **Packages / surfaces**: `packages/engine` (import emit and config), `packages/cli` (`--arrangement`), `docs/features/midi-importer.md`
- **Language**: TypeScript (strict), ESM
- **Testing**: Jest via `npm test` (engine MIDI tests plus one CLI smoke if the flag is parsed in the CLI package)
- **Client profile**: engine-only and CLI. Desktop wizard is out of scope (spec 096).
- **Performance / constraints**: N/A. Emit is string building over data the importer already computes.

## Constitution Check

GATE: must pass before implementation. Re-check after design changes.

- [x] No invented syntax or undocumented language behavior — output is spec 008 `section`, `form`, `channel … role … form`, `section … use`, and `channel auto` only
- [x] AST / ISM / scheduler / expansion impact identified — none. The importer prints source text. Spec 008 expansion already lowers it before resolve
- [x] Plugins remain isolated; core does not gain plugin dependencies
- [x] Determinism and compatibility preserved — omitted `arrangement` is byte-identical; new modes are deterministic and compared after expansion
- [x] Tests planned for new behavior

**Exceptions** (fill only if a principle cannot be met):

| Principle | Why needed | Simpler alternative rejected because |
|-----------|------------|-------------------------------------|
| | | |

## Project structure

- `packages/engine/src/import/midi/types.ts` — arrangement option on convert options
- `packages/engine/src/import/midi/config.ts` — parse `arrangement`, CLI override merge
- `packages/engine/src/import/midi/emit.ts` — `form` and `beginner` song text; keep `seqs` path
- `packages/engine/src/import/midi/reuse.ts` — expose the per-section pattern playlists the emitter already builds (no second slicing pass)
- `packages/cli/src/import-midi.ts` — `--arrangement`
- `packages/engine/tests/import/midi/` — default-identity, `form` golden, `beginner` golden, ineligible error
- `docs/features/midi-importer.md` — flag, config key, examples, eligibility

## Implementation

### AST changes

None.

### Parser / grammar changes

None.

### CLI changes

`--arrangement <seqs|form|beginner>` forwarded into convert options. Help text states the default is `seqs`. Invalid values fail with the FR-002 message before conversion.

### Desktop / web UI changes

None.

### Export changes

None. `beatbax verify` in tests is the check that exported-equivalent validation still accepts the song.

### Documentation updates

`docs/features/midi-importer.md` only. Grammar docs stay on spec 008; this feature does not change the language.

## Testing strategy

### Unit tests

- Config parse: missing, `seqs`, `form`, `beginner`, and a rejected string.
- Beginner eligibility table: GB quartet, NES 4, NES 5, lead+bass, DMC without quartet, spectrum-128.
- Name collision fails closed if a fixture can force one; otherwise a direct unit test on the name check.

### Integration tests

- Existing golden files unchanged when arrangement is omitted (SC-001).
- New golden `.bax` for `form` (GB and NES) and `beginner` (GB quartet, NES 4-lane, NES 5-lane).
- Expand both modes and compare per-channel pattern name order to the `seqs` import of the same bytes (FR-040).
- `beginner` on a two-channel fixture throws and does not return source.

### Manual / QA

- Open a `form` import in Desktop and confirm the Pattern Grid section strip reads `bars_1_8`, not `lead_s01_seq`.
- Play the `form` song and the `seqs` song of the same MIDI and confirm they match.

## Migration and compatibility

Default output is unchanged. Users opt in with `--arrangement form` or `"arrangement": "form"` in the import config. `beginner` is the stricter opt-in. OQ-1 (changing the default later) is not part of this work.

## Open implementation questions

None that block the spec. Section slices should be read from the playlist `reuse.ts` already cuts up, so `form` cannot drift from `seqs` boundaries.
