# Implementation Plan: WebAudio ↔ PCM effect parity

**Spec**: [spec.md](spec.md) | **Date**: 2026-11-21 | **Branch**: `feat/112-webaudio-pcm-effect-parity`

## Summary

Bring offline PCM (`renderSongToPCM`) up to Desktop WebAudio effect semantics so CLI play, WAV export, and PCM-cloning hardware match live preview. Extract a shared sample-domain modulation kernel from the dual implementations in `effects/index.ts` and `pcmRenderer.ts`, align `tutorial_groove` effects first (`vib` / `arp` / `port`), then complete missing PCM effects (`echo` / `retrig`, wave `arp`/`cut`), wave-table tiling, and an Offline WebAudio vs PCM golden harness.

## Technical context

- **Packages / surfaces**: `packages/engine` (PCM renderer, effects, Game Boy chips, node play, WAV export), `packages/app-core` (PCM export warnings), `packages/cli` (play/export entry), docs under `docs/contributing/` and `docs/grammar/`
- **Language**: TypeScript (strict), ESM
- **Testing**: Jest via `npm test`; OfflineAudioContext / `node-webaudio` capture vs `renderSongToPCM`
- **Client profile**: engine-only (behavior shared by Desktop export, CLI, FM-1 oracle)
- **Performance / constraints**: Offline render must stay deterministic; delay buffers for echo capped (e.g. ≤ 2 s) as in #42

## Constitution Check

GATE: must pass before implementation. Re-check after design changes.

- [x] No invented syntax or undocumented language behavior — effect syntax unchanged; semantics from specs 033 / 025 / 110 (PCM clause superseded only for FR-004)
- [x] AST / ISM / scheduler / expansion impact identified (or N/A) — N/A for AST/ISM/scheduler; resolver `legato` / `durationSec` already exist
- [x] Plugins remain isolated; core does not gain plugin dependencies — shared kernel lives in engine; plugins keep dual `render` / `createPlaybackNodes`
- [x] Determinism and compatibility preserved (or migration documented) — PCM output will change toward WebAudio (intentional audible fix); document as playback/export fidelity improvement, not a language break
- [x] Tests planned for new behavior — Offline WebAudio vs PCM gates; unit tests for modulation kernel; echo/retrig PCM tests from #42

**Exceptions**: none

## Project structure

Expected implementation touchpoints:

- `packages/engine/src/effects/modulation.ts` (new) — shared pitch/gain modulation contract
- `packages/engine/src/effects/index.ts` — WebAudio handlers driven by or asserted against the kernel
- `packages/engine/src/audio/pcmRenderer.ts` — consume kernel; port continuity; wave arp/cut; echo/retrig; shared wave parse
- `packages/engine/src/chips/gameboy/wave.ts` / pulse path — reference schedules; wave scale alignment
- `packages/engine/src/node/play.ts` — remove echo warn when FR-006 lands
- `packages/app-core/src/export/pcm-export-warnings.ts` — shrink `WEB_AUDIO_ONLY_EFFECTS`
- `packages/engine/tests/` — `modulation*.test.ts`, `pcmRenderer.*.test.ts`, parity harness tests
- `docs/contributing/creating-plugins.md`, `docs/grammar/instruments.md` — dual-render + wave-table notes
- Optional: regenerate `songs/gameboy/tutorial_groove*.wav` fixtures after gates are green

## Implementation

### AST changes

None.

### Parser / grammar changes

None.

### Shared modulation kernel

- Pure functions: given base freq, duration, tickSeconds, chip, effect list → per-sample or tick-step Hz offset / pitch ratio and gain multiplier.
- Cover: `vib`, `arp`, `port`, `trem`, `bend`, `sweep`, `volSlide`, `cut`.
- Portamento: track prior channel freq; use the same duration formula as WebAudio (`(256 - speed) / 256 * dur * 0.6` with resolver `durationSec` override); use ramp shape matching WebAudio (linear/exponential on pulse/wave), not a one-off PCM smoothstep.
- Arp: `arpCycleOffsets` + chip frame rate (60 Hz GB) identical to `effects/index.ts`.
- Vib: continuous LFO; Δf = trackerDepth × f² / 131072; honor delay/duration.

### PCM renderer

- Replace duplicated effect loops in `renderPulse` / `renderWave` with kernel calls.
- Continuous phase + no per-note fade across contiguous `port` notes (extend 110 into PCM for pulse and wave).
- Add wave `arp` / `cut`; unify wave vib to continuous LFO.
- Pass effects into `renderNoise` where applicable, or warn.
- Echo: per-channel circular delay buffer, feedback clamp, wet/dry, beat-fraction delays.
- Retrig: expand into additional note onsets with volume deltas matching WebAudio metadata.
- Use shared `parseWaveTable` from `chips/gameboy/wave.ts` (tile 16→32); align wave output scale with WebAudio.

### WebAudio path

- Prefer generating AudioParam automation from the same schedule tables the kernel exposes, or keep handlers and add schedule-equivalence tests against the kernel.
- Do not regress live Desktop (spec 110 pulse held-voice remains).

### CLI / Desktop export

- Clear echo warn in `node/play.ts` when echo works.
- Update `pcm-export-warnings.ts` as coverage lands.

### Documentation updates

- Dual rendering table in `docs/contributing/creating-plugins.md`.
- Remove or rewrite the PCM-local wave-table discrepancy note in `docs/grammar/instruments.md` once fixed.
- Cross-link issue #276 / #42.

## Testing strategy

### Unit tests

- Kernel: vib depth Hz, arp step times, port duration/ramp, trem/cut/bend edge cases.
- PCM: wave 16→32 tiling; wave arp present; echo buffer stability; retrig counts.

### Integration tests

- Offline WebAudio capture helper (Node) vs `renderSongToPCM` for:
  - `songs/gameboy/tutorial_groove.bax` full + `-c 1..4`
  - portamento demos from 110
  - `songs/effects/echo.bax`, `songs/effects/retrigger.bax`, vib/arp fixtures
- Correlation + peak/RMS gates per SC-001 / SC-002; optional mild low-pass before compare.

### Manual / QA

- Desktop play `tutorial_groove` vs CLI play vs exported WAV.
- Confirm FM-1 can re-run compare against new CLI WAV after ship (out of repo).

## Migration and compatibility

- Audible change for CLI/WAV is intentional (toward Desktop).
- Spec 110’s “PCM stays as they are” is superseded by FR-004; when this feature completes, update the completed 110 spec note or add a one-line amendment in STATUS.
- UGE export mappings unchanged.

## Open implementation questions

- Exact correlation preprocess (DC-block / low-pass cutoff) if naive-square vs PeriodicWave blocks SC-001 — decide in T001 harness spike and record here.
- Whether plugin chips get full kernel application in this feature or warn-only for P1 (spec allows warn; prefer apply when `createPlaybackNodes` exists for schedule parity tests).
