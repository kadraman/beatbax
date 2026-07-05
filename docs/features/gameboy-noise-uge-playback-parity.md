---
title: Game Boy Noise UGE Playback Parity
status: complete
authors:
  - kadraman
created: 2026-06-29T00:00:00.000Z
issue: https://github.com/kadraman/beatbax/issues/149
---

## Summary

BeatBax Game Boy **noise playback** (WebAudio and CLI/WAV) now matches hUGETracker exports when instruments use **`uge_note=`**. The same hUGEDriver `get_note_poly` mapping drives the NR43 LFSR clock in preview and in the tracker after UGE export.

Reference fixtures:

| Song | Purpose |
|---|---|
| [gb_uge_note_demo.bax](../../songs/gameboy/instruments/gb_uge_note_demo.bax) | Minimal noise-only kit (128 BPM) |
| [gb_percussion_demo.bax](../../songs/gameboy/instruments/gb_percussion_demo.bax) | Pulse kicks + noise drums (`uge_note=` on all noise hits) |

Optional paired WAVs (`*_from_cli.wav`, `*_from_hugetracker.wav`) in the same directories support manual A/B checks.

---

## Problem Statement

Game Boy noise percussion sounded wrong in BeatBax because playback **ignored `uge_note=`** and used hardcoded NR43 defaults (`divisor=3`, `shift=4`) for every hit. UGE export could show the correct pattern note, but preview/WAV did not use the same clock.

Authors set **`uge_note=`** (e.g. `C-6`, `C-7`, `C-8`) — the note hUGETracker shows in the pattern row. hUGEDriver derives NR43 shift/divisor from that index via `get_note_poly`. **`divisor` and `shift` are not author-facing tracker fields** (optional low-level overrides only).

---

## Goals

| Goal | Status |
|---|---|
| Derive noise LFSR clock from `uge_note` via `get_note_poly` | Done |
| Keep `uge_note=` as UGE pattern-row note for named hits | Done |
| Match timbre/decay via `gb:width`, `env`, `length` | Done |
| Calibrate output levels vs hUGE WAV (noise + pulse mix) | Done |
| Tests + reference songs | Done |

---

## Non-Goals

- Realistic kick timbre on the noise channel alone (use pulse or subpatterns).
- Perfect bit-exact LFSR emulation on every sample.
- Replacing hUGETracker as source of truth.
- BeatBax playback adopting hUGE integer ticks/row for non-exact BPM values (see [Tempo alignment](#tempo-alignment-beatbax-vs-huge)).

---

## Solution

### Author-facing controls

| What authors write | What hUGETracker shows | What drives playback |
|---|---|---|
| `uge_note=C-6` | Pattern note `C-6` | `get_note_poly(36)` → NR43 shift/divisor |
| `gb:width=7` | Instrument 7-bit mode | LFSR width (NR43 bit 3) |
| `env=…` | Instrument envelope | NR42-style volume sweep |
| `length=…` | Instrument length | NR41 length counter (playback duration) |

Optional explicit `divisor` / `shift` on an instrument override `uge_note` (tests and low-level tuning only).

**Use `uge_note=` on all named Game Boy noise hits.** Legacy `note=` without `uge_note=` still converts for UGE export but does **not** set the playback clock.

### Implementation

Shared module: [`packages/engine/src/chips/gameboy/noiseNote.ts`](../../packages/engine/src/chips/gameboy/noiseNote.ts)

| Symbol | Role |
|---|---|
| `hugeTrackerNoteToIndex()` | Parse `C-6` / `C#7` display notation |
| `getNotePoly()` | Port of hUGEDriver `get_note_poly` |
| `resolveNoiseClock()` | Priority: explicit divisor/shift → `uge_note` → defaults |
| `noiseClockToLfsrHz()` | LFSR step rate from NR43 shift/divisor |
| `stepGameBoyLfsr()` / `triggerGameBoyLfsr()` | SameBoy-compatible 7/15-bit LFSR |
| `gameBoyNoiseSample()` | Bipolar LFSR bit (matches hUGE WAV audibility) |
| `resolveNoiseHardwareLengthSec()` | NR41 `(64 - length) / 256` seconds |
| `NOISE_OUTPUT_GAIN` (0.25) | Noise PCM/WebAudio level vs hUGE |

Wired into:

- [`noise.ts`](../../packages/engine/src/chips/gameboy/noise.ts) — WebAudio noise
- [`pcmRenderer.ts`](../../packages/engine/src/audio/pcmRenderer.ts) — CLI/WAV (noise + pulse)
- [`pulse.ts`](../../packages/engine/src/chips/gameboy/pulse.ts) — WebAudio pulse + `PULSE_OUTPUT_GAIN` (0.5)
- [`plugin.ts`](../../packages/engine/src/chips/gameboy/plugin.ts) — chip-plugin noise path uses shared clock/gain
- [`ugeWriter.ts`](../../packages/engine/src/export/ugeWriter.ts) — shared `hugeTrackerNoteToIndex` for export

**Mix calibration** (playback and export):

| Channel | Constant | Notes |
|---|---|---|
| Noise | `NOISE_OUTPUT_GAIN` = 0.25 | Bipolar LFSR sample scale |
| Pulse | `PULSE_OUTPUT_GAIN` = 0.5 | Square-wave level vs hUGE full-kit WAV |
| Center pan (PCM) | dual-mono L+R | Avoids ~3 dB quiet vs hUGE equal-power center |

Gain constants apply in **WebAudio and CLI/WAV**, not export-only.

---

## Tempo alignment (BeatBax vs hUGE)

BeatBax playback uses the written `bpm`. UGE export stores `ticksPerRow = round(896 / bpm)`; hUGE effective BPM ≈ `896 / ticksPerRow`.

**Exact-match BPM** (identical row timing): **224**, **128**, **112**, **64**, **56**, and any value where **896 ÷ bpm** is an integer. **`gb_uge_note_demo.bax` uses 128 BPM** (7 ticks/row).

**Approximate:** `bpm 140` → 6 ticks/row → hUGE ~**149.3 BPM** (~7% faster). Acceptable for authoring; use an exact-match BPM for tight WAV timing comparisons.

See [uge-export-guide.md](../../exports/uge-export-guide.md#tempo-and-bpm-alignment).

---

## Reference song

[`gb_uge_note_demo.bax`](../../songs/gameboy/instruments/gb_uge_note_demo.bax) (128 BPM, noise channel only):

```bax
inst kick       type=noise gb:width=7  env=14,down,1 length=16 uge_note=C-6
inst snare      type=noise gb:width=15 env=10,down,2 length=16 uge_note=C-7
inst open_hat   type=noise gb:width=15 env=4,down,3  length=32 uge_note=D-8
inst closed_hat type=noise gb:width=15 env=4,down,1  length=8  uge_note=C-8
```

First pattern row notes (UGE indices / display): **C-6, C-8, C-8, D-8** → `[36, 60, 60, 62]`.

Derived NR43 clocks (`resolveNoiseClock`):

| Instrument | uge_note | shift | divisor | nr43 |
|---|---:|---:|---:|---:|
| kick | C-6 | 5 | 7 | 0x5f |
| snare | C-7 | 2 | 7 | 0x27 |
| closed_hat | C-8 | 0 | 3 | 0x03 |
| open_hat | D-8 | 0 | 1 | 0x01 |

Manual WAV export:

```bash
npm run engine:build
npm run cli -- export wav songs/gameboy/instruments/gb_uge_note_demo.bax songs/gameboy/instruments/gb_uge_note_demo_from_cli.wav
```

Compare with `gb_uge_note_demo_from_hugetracker.wav` from the same directory.

---

## Parity results (verified)

| Area | Result |
|---|---|
| Noise `uge_note` → NR43 clock | Unit + integration tests pass |
| Noise peak levels (isolated hits) | ~0.9–1.0× vs hUGE reference WAV |
| Snare/kick (full kit, `gb_percussion_demo`) | Median peak ratio ~1.0–1.1 after `PULSE_OUTPUT_GAIN` |
| Legacy `note=` without `uge_note=` | Export only for clock; playback uses defaults — **avoid for new songs** |

Known acceptable gaps:

- Row timing differs when Bax BPM is not an exact 896 ÷ integer match (see tempo section).
- Minor envelope step phasing on long open-hat decays vs hUGE (negligible at typical tempos).
- `GBChannelBackend` in `plugin.ts` (integration-test stub) uses a simplified pulse renderer without full envelope/gain stack — not the main player path.

---

## Test plan

| Test | Coverage |
|---|---|
| [`gameboy/noiseNote.test.ts`](../../packages/engine/tests/gameboy/noiseNote.test.ts) | Note index, `getNotePoly`, clock resolve, LFSR, gain |
| [`gameboy/pulseGain.test.ts`](../../packages/engine/tests/gameboy/pulseGain.test.ts) | `PULSE_OUTPUT_GAIN` constant |
| [`gbUgeNoteDemo.test.ts`](../../packages/engine/tests/gbUgeNoteDemo.test.ts) | Reference bax UGE export + audible PCM |
| [`gbPercussionDemo.test.ts`](../../packages/engine/tests/gbPercussionDemo.test.ts) | `uge_note` kit + optional hUGE WAV level parity |

Run:

```bash
cd packages/engine && npm test -- --testPathPattern="noiseNote|pulseGain|gbUge|gbPercussion"
```

---

## Remaining work

Nothing blocking parity for typical authoring workflows. Optional follow-ups:

| Item | Priority | Notes |
|---|---|---|
| Instrument subpatterns | Separate feature | See [gameboy-uge-instrument-subpatterns.md](gameboy-uge-instrument-subpatterns.md) |
| NR41 length step phasing vs hUGE | Low | Audible mainly at fast tempos / long decays |
| Align Bax playback to UGE ticks/row for all BPM | Low / non-goal | Would change preview timing away from written BPM |
| Simplified `GBChannelBackend` pulse path | Low | Test stub only; main paths use `playPulse` / `renderPulse` |

---

## Documentation

- [instruments.md](../grammar/instruments.md) — `uge_note=` reference
- [instrument-note-mapping-guide.md](../grammar/instrument-note-mapping-guide.md) — named-hit workflow
- [uge-export-guide.md](../exports/uge-export-guide.md) — export + BPM table
- [composition_guide.md](../chips/gameboy/composition_guide.md) — authoring tips

---

## Open questions (resolved)

1. UGE-compatible noise preview default for `chip gameboy`? **Yes — via `uge_note` derivation.**
2. Should `uge_note` influence playback? **Yes — primary NR43 clock source when set.**
3. Separate `noise_note` field? **No — `uge_note` is sufficient.**
4. Warn when `uge_note` set but no explicit divisor/shift? **No — overrides are optional only.**
5. Pulse level parity for mixed pulse+noise songs? **Yes — `PULSE_OUTPUT_GAIN` in WebAudio and PCM.**
