# Implementation Plan: CLI MIDI → .bax Conversion

**Spec**: [spec.md](spec.md) | **Fixtures**: [fixtures.md](fixtures.md) | **Updated**: 2026-09-21

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [x] No invented syntax or undocumented language behavior (emit existing `inst` / `pat` / `seq` / `channel` / `inst()`)
- [x] AST / ISM / scheduler / expansion impact identified: **N/A** — output is normal `.bax` source
- [x] Plugins remain isolated; core does not gain chip-plugin dependencies beyond registry lookups for channel counts / kits
- [x] Determinism and compatibility preserved (additive CLI command)
- [x] Tests planned for new behavior ([fixtures.md](fixtures.md) + tasks below)

**Status of this documentation pass**

Implementation landed under `packages/engine/src/import/midi/` and CLI `import midi` / `convert midi2bax`. Fixtures F01–F09 committed; see [fixtures.md](fixtures.md) and [tasks.md](tasks.md).

## Implementation Plan (follow-on)

### AST Changes

No AST shape changes are required.

Converter output is normal BeatBax source, parsed by existing parser and resolver.

### Parser Changes

No parser changes required for v1.

### CLI Changes

Add a new command (primary):

```text
beatbax import midi <input.mid> <output.bax> [options]
```

Equivalent alias (optional):

```text
beatbax convert midi2bax <input.mid> <output.bax> [options]
```

Suggested options:

- `--chip <chip>` (**required**)
- `--config <file>` (optional mapping override)
- `--strict`
- `--quantize <nearest|floor|ceil|strict>`
- `--grid <1/4|1/8|1/16|1/32>`
- `--max-bars <N>`
- `--dry-run` (prints summary only)
- `--max-overlap-ticks <N>` (packing merge threshold)

### Engine / Import Module Changes

Add a dedicated module under `packages/engine/src/import/midi/`:

| Stage | Responsibility |
|-------|----------------|
| Reader | `@tonejs/midi` → tracks, tempo, notes, ch10 drums |
| Quantizer | PPQ → BeatBax ticks; nearest/floor/ceil/strict |
| Role classifier | Melodic vs drum; GM program / track name heuristics |
| Channel packer | Assign to chip roles; schedule `inst()` switches; emit warnings |
| Kit emitter | Chip default `inst` lines + GM drum → named percussion map |
| Reuse engine | Bar hash → shared `pat`; sequence compression → `seq` |
| Bax emitter | Deterministic, commented `.bax` |

Keep conversion as compile-time tooling. Runtime playback and scheduler remain unchanged.

Instrument-change packing policy (default):

1. Route channel-10 / GM drums to noise as named hits.
2. Prioritize streams (bass → wave/triangle, lead → pulse1, harmony → pulse2, …).
3. Merge non-overlapping streams of compatible type onto one channel with `inst(a)` / `inst(b)`.
4. Otherwise warn and drop lower-priority notes or flatten chords to top note.

Invert GM drum maps from `packages/engine/src/export/midiExport.ts` (kick 36, snare 38, hat 42).

### Desktop / Web UI Changes

**No** Desktop or Web UI changes for v1.

Explicitly out of scope: IDE file-import wizard, and any conflation with MIDI step-entry (feature 065).

Optional later phase: file-upload + mapping wizard.

### Export Changes

No export format changes required.

Generated `.bax` is handled by existing `play` / `verify` / `export` pipeline.

### Documentation Updates (when implementing)

- CLI usage examples in package README / beatbax.com CLI docs
- Mapping config schema reference
- Example config files for NES / Game Boy
- Link [fixtures.md](fixtures.md) from feature docs

---

## Testing Strategy

### Unit Tests

- MIDI parsing adapter (tempo, time signatures, note extraction)
- Timing conversion (PPQ → ticks)
- Quantization modes
- Drum mapping (MIDI drum note → noise token / optional DMC)
- Packing / `inst()` multiplexing and over-polyphony warnings
- Pattern tick-balance and reuse (shared `pat`, `seq` compression)
- Determinism (same input/options → byte-identical output)

### Integration Tests

- Golden-file tests for fixtures **F01–F09** ([fixtures.md](fixtures.md))
- Round-trip validation: convert → `verify` on generated `.bax`
- Strict-mode failure tests for unquantizable cases

### Manual / Stretch Tests

- Well-known stretch set **S01–S10** (see fixtures.md); S07–S08 operator-local only

---

## Migration Path

No migration required.

This is an additive feature delivered through a new CLI command and does not change existing BeatBax source semantics.
