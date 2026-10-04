# Implementation Plan: Scale Awareness — Scale Locking, Snapping, and Channel Locks

**Spec**: [spec.md](spec.md) | **Migrated**: 2026-09-03

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [x] No invented syntax or undocumented language behavior (`scale` and `lock` are defined in [spec.md](spec.md) and documented in `docs/grammar/metadata-directives.md`)
- [x] AST / ISM / scheduler / expansion impact identified: optional `ast.scale` and `ChannelNode.lock`; no ISM or scheduler change
- [x] Plugins remain isolated; core does not gain plugin dependencies
- [x] Determinism and compatibility preserved: additive, diagnostics only; source is never rewritten
- [x] Tests planned for new behavior

## Testing Strategy

### Unit Tests

- `ScaleUtils` — `buildScalePitchClasses(root, mode)` returns correct semitone sets for all supported modes
- `ScaleUtils` — `snapToScale(pitch, pitchClasses)` snaps correctly for edge cases (tritone equidistance → prefer up)
- `validateScaleLocks` — emits no diagnostics when all notes conform
- `validateScaleLocks` — emits correct `warning` for out-of-scale notes in `warn` mode
- `validateScaleLocks` — emits `error` in `error` mode
- `validateScaleLocks` — emits nothing when enforcement is `off`
- `validateScaleLocks` — evaluates post-transform pitches (after `oct()`)
- Parser — `scale C major` parses to `ast.scale = { root: 'C', mode: 'major', enforcement: 'warn' }`
- Parser — `lock=root+fifth` on channel parses to `channel.lock = 'root+fifth'`
- Parser — `lock` without `scale` produces `error` diagnostic

### Integration Tests

- Full `.bax` file with `scale C major error` and violating note fails `verify`
- Full `.bax` file with `scale C major warn` and violating note succeeds `verify` with warning
- Full `.bax` file with `scale C major off` and violating note produces no diagnostics
- `lock=chord` in C major restricts to `{ C, E, G }` across octaves
- `lock=root+fifth` in A minor restricts to `{ A, E }` across octaves
- MIDI step entry snap function correctly maps Db → C in C major

---

## Migration Path

Fully additive. Existing `.bax` files without `scale` or `lock` are unchanged in behaviour. No migration required.

---
