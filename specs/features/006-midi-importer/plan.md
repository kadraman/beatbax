# Implementation Plan: MIDI Importer Using @tonejs/midi

**Spec**: [spec.md](spec.md) | **Migrated**: 2026-09-03

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [ ] No invented syntax or undocumented language behavior
- [ ] AST / ISM / scheduler / expansion impact identified (or N/A)
- [ ] Plugins remain isolated; core does not gain plugin dependencies
- [ ] Determinism and compatibility preserved (or migration documented)
- [ ] Tests planned for new behavior

## Implementation Plan

### AST Changes

No AST shape changes are required.

Importer output is normal BeatBax source, parsed by existing parser and resolver.

### Parser Changes

No parser changes required for v1.

### CLI Changes

Add a new command:

```text
beatbax import midi <input.mid> <output.bax> [options]
```

Suggested options:

- --chip <chip>
- --config <file>
- --strict
- --quantize <nearest|floor|ceil|strict>
- --grid <1/4|1/8|1/16|1/32>
- --max-bars <N>
- --dry-run (prints summary only)

### Engine / Import Module Changes

Add a dedicated import module under engine/cli boundaries, for example:

- MIDI reader adapter using @tonejs/midi
- timing normalizer
- mapping engine (track -> channel role)
- pattern partitioner
- bax emitter

Keep importer as compile-time tooling.
Runtime playback and scheduler remain unchanged.

### Web UI Changes

No mandatory web-ui changes for v1.

Optional phase 2: expose importer in web UI as file-upload + mapping wizard.

### Export Changes

No export format changes required.

Generated .bax is handled by existing play/verify/export pipeline.

### Documentation Updates

- Add CLI usage examples to README and/or the [docs tutorial](https://beatbax.com/docs/tutorial/overview)
- Add mapping config schema reference
- Add example importer config files for NES songs

---

## Testing Strategy

### Unit Tests

- MIDI parsing adapter tests (tempo, time signatures, note extraction)
- Timing conversion tests (PPQ -> ticks)
- Quantization mode tests (nearest/floor/ceil/strict)
- Drum mapping tests (MIDI drum note -> noise token / DMC trigger)
- Pattern tick-balance tests (all emitted patterns sum to patternTicks)
- Determinism tests (same input/config yields byte-identical output)

### Integration Tests

- Golden-file tests for representative MIDI fixtures
- Round-trip validation:
  - import .mid -> .bax
  - run verify on generated .bax
- Strict-mode failure tests for unquantizable and unsupported cases

### Manual Tests

- Import a multi-track NES-style MIDI
- Validate generated song structure and channel assignments
- Spot-check bars with tuplets/syncopation under different quantization modes

---

## Migration Path

No migration required.

This is an additive feature delivered through a new command and does not change existing BeatBax source semantics.

---
