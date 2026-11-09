# Implementation Plan: Game Boy pulse portamento continuity

**Spec**: [spec.md](spec.md) | **Date**: 2026-11-08 | **Branch**: `fix/110-gameboy-pulse-portamento`

## Summary

Keep one Game Boy pulse oscillator across contiguous `port` notes on the live WebAudio path. The first `port` note of a run starts that voice and its envelope. Later `port` notes reuse the oscillator and skip the end-fade until the chain ends. A note without `port`, including the note immediately before the run, fades on its own.

## Technical context

- **Packages / surfaces**: `packages/engine` (Game Boy pulse playback and the `port` effect). No desktop or web-lite UI changes.
- **Language**: TypeScript (strict), ESM
- **Testing**: Jest via `npm test` in `packages/engine`
- **Client profile**: engine playback used by desktop-full and web-lite
- **Performance / constraints**: One oscillator per portamento run instead of one per step. No scheduler tick-rate or ISM timing change.

## Constitution Check

GATE: must pass before implementation. Re-check after design changes.

- [x] No invented syntax or undocumented language behavior — `port` syntax and speed stay as spec 033 specifies; this restores that spec's legato on the pulse oscillator path
- [x] AST / ISM / scheduler / expansion impact identified — AST, ISM, expansion, and tick timing are unchanged. Scheduling still places one callback per note. The pulse callback may reuse an oscillator instead of creating one. That is playback allocation, not a scheduler timing change
- [x] Plugins remain isolated; core does not gain plugin dependencies
- [x] Determinism and compatibility preserved (or migration documented) — same glide formula, same UGE `3xx`, same PCM renderer. Audible change is the removal of the per-step gap, phase jump, and unscaled legato gain on the live pulse path
- [x] Tests planned for new behavior

**Exceptions** (fill only if a principle cannot be met):

| Principle | Why needed | Simpler alternative rejected because |
|-----------|------------|-------------------------------------|
| | | |

## Project structure

- `packages/engine/src/chips/gameboy/pulsePortamento.ts` — which following notes extend a pulse voice
- `packages/engine/src/chips/gameboy/pulse.ts` — reuse the oscillator, hold gain, scale legato gain
- `packages/engine/src/effects/index.ts` — do not rewrite envelope flags on a note that joined an existing voice
- `packages/engine/src/audio/playback.ts` — decide join / hold while scheduling; clear the voice on stop
- `packages/engine/tests/gameboy/gbPulsePortamento.test.ts` — chain planning and oscillator reuse
- `docs/chips/gameboy/composition_guide.md` — one composer-facing sentence
- `.changeset/` — `@beatbax/engine` patch

## Implementation

### AST changes

None.

### Parser / grammar changes

None.

### CLI changes

None. The CLI PCM renderer is out of scope (FR-008).

### Desktop / web UI changes

None. Both clients use `Player`.

### Export changes

None. UGE `3xx` mapping stays as spec 033 specifies.

### Documentation updates

Add a short note under pitch slides in `docs/chips/gameboy/composition_guide.md`: contiguous `port` notes on a pulse channel share one voice until a note without `port`.

## Testing strategy

### Unit tests

- `contiguousPulsePortChainEnd` walks contiguous `port` pulse notes, including a lengthened note, and stops at a note without `port`, a rest, a non-pulse instrument, and a baked `duty_env` program.
- `playPulse` with `hold` does not schedule a ramp to silence and stops the oscillator at the chain end.
- A following `join` call does not create a second oscillator. The next call without `join` does, and the chain-ending note can fade.
- The existing `port` frequency test still glides from the seeded previous pitch to the target.

### Integration tests

No new CLI or export fixture. PCM and UGE paths are unchanged.

### Manual / QA

Play `songs/gameboy/digital_citadel.bax` through the rush section (channel 1, pattern `rush`) and confirm the chromatic climb glides, with a fresh attack on `C6`. `songs/gameboy/effects/gb_portamento_demo.bax` should still glide, without a click on each short step.

## Migration and compatibility

No song text changes. Songs that used the per-step gap as articulation will sound smoother. Portamento gain matches a normal pulse note instead of jumping to full scale. Loop restarts and buffered rendering do not extend one oscillator across the boundary.

## Open implementation questions

None.
