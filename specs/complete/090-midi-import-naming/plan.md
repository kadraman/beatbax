# Implementation Plan: Readable names in MIDI import output

**Spec**: [spec.md](spec.md) | **Date**: 2026-10-01 | **Branch**: `feat/090-midi-import-naming`

## Summary

Rename generated instruments, patterns and sequences in the importer's naming points. Pattern interning keeps the content hash as its key; names are assigned after all bars are interned, so numbers and widths are known.

## Technical context

- **Packages / surfaces**: `packages/engine` (`src/import/midi/`), `packages/cli` (tests only)
- **Language**: TypeScript (strict), ESM
- **Testing**: Jest via `npm test`
- **Client profile**: engine-only (browser-safe)
- **Performance / constraints**: N/A

## Constitution Check

- [x] No invented syntax or undocumented language behavior: names only; identifiers with suffixes and digits are already valid.
- [x] AST / ISM / scheduler / expansion impact: none.
- [x] Plugins remain isolated: N/A.
- [x] Determinism and compatibility: names are deterministic. Output names change for every import; this is the intended behaviour change (spec FR-031), documented in docs and release notes. Resolved timelines are unchanged (SC-002).
- [x] Tests planned for new behavior.

## Project structure

- `packages/engine/src/import/midi/kit.ts`: `instrumentNameForFamilyRole` appends `_inst` for melodic roles; `parseFamilyRoleFromInstrumentName` accepts the old and new forms.
- `packages/engine/src/import/midi/reuse.ts`: two-pass naming in `buildPatternsAndSequences` (intern by hash, then assign `rest_x<N>_pat` / `<prefix>_<n>_pat`); `sectionSeqName` returns `<prefix>_s<NN>_seq`.
- `packages/engine/src/import/midi/emit.ts`: pattern order (FR-004); section parsing of `_s<NN>_seq`.
- Tests under `packages/engine/tests/import/midi/` and `packages/cli/tests/import-midi.test.ts`.

## Implementation

### Patterns (`reuse.ts`)

1. `intern(tokens, bar, prefix)` keeps the hash map but returns a stable placeholder key (the hash) and records `{ prefix, firstOrder }` for the first appearance.
2. After all channels are processed, assign names: rest-only patterns (all tokens `.` or `.:N`) → `rest_x<steps>_pat`; others numbered per prefix in first-appearance order, width `max(2, digits(count))`.
3. Rewrite playlists from keys to names. `PatternDef` gains no public fields beyond its new `name`.

### Pattern order (`emit.ts`)

Sort by: rest first (by steps), then prefix rank (channel order of first appearance), then number. `ReuseResult.patterns` is produced in that order so the emitter can keep it.

### Sequences

`sectionSeqName`: `${prefix}_seq` for one section, `${prefix}_s${NN}_seq` otherwise. `sectionIndexOfSeqName` in `emit.ts` matches `_s(\d+)_seq$`.

### Instruments (`kit.ts`)

`instrumentNameForFamilyRole(family, role)` returns `bass_inst` / `{family}{suffix}_inst` for melodic roles; noise and DMC unchanged. `parseFamilyRoleFromInstrumentName` matches `^(family)_(p1|p2|bass)(_inst)?$` and `bass` / `bass_inst`, so config names in the old form still pick the right kit line.

### CLI changes

None.

### Documentation updates

- `docs/features/midi-importer.md`: a "Generated names" section and the instrument naming bullet.
- `.changeset/midi-import-naming.md`: engine minor, behaviour change note.
- `specs/complete/006-midi-importer/spec.md`: note at the naming lines that 090 updates them.

## Testing strategy

### Unit tests

- `midi-family-kit.test.ts`: instrument names and parsing of both forms.
- New `midi-naming.test.ts`: numbering and order, width past 99, shared rest `rest_x16_pat` / `rest_x12_pat`, cross-channel shared pattern keeps the first channel's name, section names, no hash names, determinism.

### Integration tests

- Update name assertions in `midi-golden.test.ts`, `midi-convert.test.ts`, `midi-config-quantize.test.ts`, `midi-arrangement-*.test.ts`, CLI `import-midi.test.ts`.
- SC-002: compare resolved per-channel timelines of F01–F14 against the pre-090 engine (operator script, recorded in tasks).

### Manual / QA

Re-import one `songs/covers` song and read the output.

## Migration and compatibility

Existing `.bax` files are unaffected. Re-importing a MIDI produces the new names; anyone diffing against an older import sees renamed `inst` / `pat` / `seq` lines with the same music.

## Open implementation questions

None.
