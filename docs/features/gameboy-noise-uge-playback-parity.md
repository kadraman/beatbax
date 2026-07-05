---
title: Game Boy Noise UGE Playback Parity
status: in-progress
authors:
  - kadraman
created: 2026-06-29T00:00:00.000Z
issue: https://github.com/kadraman/beatbax/issues/149
---

## Summary

Make BeatBax CLI and web/desktop Game Boy noise playback match hUGETracker playback of the exported `.uge`.

The reference fixture is [gb_uge_note_demo.bax](../../songs/gameboy/instruments/gb_uge_note_demo.bax) with paired WAV renders in the same directory.

---

## Problem Statement

Game Boy noise percussion sounded different between BeatBax playback and hUGETracker because BeatBax ignored `uge_note=` for the LFSR clock and used hardcoded defaults (`divisor=3`, `shift=4`) for every hit.

Authors set **`uge_note=`** (e.g. `C-6`, `C-7`, `C-8`) — the note hUGETracker shows in the pattern row. hUGEDriver derives internal NR43 clock parameters from that note via `get_note_poly`. **`divisor` and `shift` are not author-facing tracker fields.**

---

## Goals

1. Derive BeatBax noise LFSR clock from `uge_note` using hUGEDriver-compatible `get_note_poly` mapping (default for `chip gameboy`).
2. Keep `uge_note=` as the explicit UGE pattern-row note for named noise hits.
3. Use `gb:width`, `env`, and `length` for timbre/decay — same as hUGETracker instrument fields.
4. Add tests and a reference song comparing BeatBax render to hUGETracker render.

---

## Non-Goals

- Realistic kick drum timbre on the noise channel (use pulse or subpatterns).
- Perfect bit-exact LFSR emulation.
- Replacing hUGETracker as source of truth.

---

## Solution

### Author-facing controls

| What authors write | What hUGETracker shows | What drives playback clock |
|---|---|---|
| `uge_note=C-6` | Pattern note `C-6` | `get_note_poly(36)` → NR43 shift/divisor |
| `gb:width=7` | Instrument 7-bit mode | LFSR width (NR43 bit 3) |
| `env=…` | Instrument envelope | NR42-style volume sweep |
| `length=…` | Instrument length | NR41 length counter |

Optional explicit `divisor` / `shift` on an instrument override `uge_note` derivation (for tests and low-level tuning only).

### Implementation

Shared module: [`packages/engine/src/chips/gameboy/noiseNote.ts`](../../packages/engine/src/chips/gameboy/noiseNote.ts)

- `hugeTrackerNoteToIndex()` — parse `C-6` style notation
- `getNotePoly()` — port of hUGEDriver `get_note_poly`
- `resolveNoiseClock()` — priority: explicit divisor/shift → `uge_note` → defaults

Wired into:

- [`noise.ts`](../../packages/engine/src/chips/gameboy/noise.ts) — browser/WebAudio
- [`pcmRenderer.ts`](../../packages/engine/src/audio/pcmRenderer.ts) — CLI/WAV
- [`ugeWriter.ts`](../../packages/engine/src/export/ugeWriter.ts) — shared note-index parser

---

## Reference song

[songs/gameboy/instruments/gb_uge_note_demo.bax](../../songs/gameboy/instruments/gb_uge_note_demo.bax):

```bax
inst kick  type=noise gb:width=7  env=14,down,1 length=16 uge_note=C-6
inst snare type=noise gb:width=15 env=10,down,2 length=16 uge_note=C-7
inst hat   type=noise gb:width=15 env=4,down,1  length=8  uge_note=C-8
```

Expected hUGETracker noise pattern (first 8 rows): `C-6 C-8 C-7 C-8` with instruments 1/3/2/3.

Derived NR43 clocks:

| Hit | uge_note | shift | divisor |
|-----|----------|-------|---------|
| kick | C-6 | 5 | 7 |
| snare | C-7 | 2 | 7 |
| hat | C-8 | 0 | 3 |

---

## Test plan

- Unit tests: [`packages/engine/tests/gameboy/noiseNote.test.ts`](../../packages/engine/tests/gameboy/noiseNote.test.ts)
- Integration: [`packages/engine/tests/gbUgeNoteDemo.test.ts`](../../packages/engine/tests/gbUgeNoteDemo.test.ts)
- Manual: compare `gb_uge_note_demo_from_bax_cli.wav` vs `gb_uge_note_demo_from_hugetracker.wav` after re-exporting Bax CLI WAV

---

## Remaining work

- WebAudio vs PCM gain calibration if levels still diverge after clock parity
- Hardware length register modeling during playback (secondary at fast tempos)
- Instrument subpatterns (separate feature)

---

## Open questions (resolved)

1. UGE-compatible noise preview default for `chip gameboy`? **Yes — implemented as default via `uge_note` derivation.**
2. Should `uge_note` influence playback? **Yes — primary source for NR43 clock when set.**
3. Separate `noise_note` field? **No — `uge_note` is sufficient.**
4. Warn when `uge_note` set but no explicit divisor/shift? **No — explicit divisor/shift are optional overrides only.**
