---
title: Game Boy Noise UGE Playback Parity
status: in-progress
authors:
  - kadraman
created: 2026-06-29T00:00:00.000Z
issue: https://github.com/kadraman/beatbax/issues/149
---

## Summary

Goal: BeatBax preview and WAV export should sound close to the same `.uge` opened in hUGETracker, for Game Boy noise-channel percussion.

**Current state:** Export note indices and NR43 clock mapping are aligned with hUGEDriver. Playback still diverges audibly in manual A/B tests — the work so far has not produced a perceptible match for typical drum demos (`gb_uge_note_demo.bax`, exported `.uge` vs BeatBax desktop/CLI/WAV).

Authors set noise pitch via **`gb:uge_note=`** (hUGETracker display notation) on named hits — not BeatBax-only `divisor`/`shift`.

## hUGE-aligned authoring model

| BeatBax param | hUGETracker / UGE equivalent |
|---------------|------------------------------|
| `env` | Initial volume + volume sweep |
| `gb:width=7` / `15` | Noise mode (7-bit metallic vs 15-bit white) |
| `length` | Length enabled + length value (1–64 frames at 256 Hz → N/256 s cap) |
| `gb:uge_note=C-7` | Pattern-row note for named hits (`uge_note=` alias) |

**Removed:** `divisor`, `shift`, `gb:divisor`, `gb:shift` — parser warns if present; playback ignores them.

Example (tuned to match `gb_percussion_demo`, not a synthetic C-6/C-7/C-8 ladder):

```bax
inst kick  type=noise gb:width=7  env=14,down,1 length=16 gb:uge_note=C-6
inst snare type=noise gb:width=7  env=10,down,2 length=16 gb:uge_note=C-6
inst hat   type=noise gb:width=15 env=4,down,1  length=8  gb:uge_note=C-7
```

## Progress

### Done (code shipped)

| Area | Module / location | Notes |
|------|-------------------|-------|
| Note index → NR43 | `noiseNoteTable.ts` | Ports hUGEDriver `get_note_poly`; shared with UGE export |
| `length=` playback | `gbLength.ts`, `noise.ts`, `pcmRenderer.ts` | Caps duration at N/256 s when `length=` is set |
| CH4 voice reset | `playback.ts`, `pcmRenderer.ts`, `bufferedRenderer.ts` | New noise hit replaces overlapping noise on same channel |
| Preview mode toggle | app settings + transport **UGE** badge | `uge` (default) vs `legacy` |
| Demo + docs | `gb_uge_note_demo.bax`, grammar docs | Realistic `uge_note` values; width=7 snare documented as normal |
| Tests | `noiseNoteTable.test.ts`, `gbLength.test.ts` | Mapping and length helpers |

### Verified working

- Node diagnostics: `resolveNoisePlayback()` returns consistent `noteIndex`, `lfsrHz`, `width` for UGE mode.
- UGE export: pattern rows show expected notes (e.g. C-6 / C-7) for named hits with `gb:uge_note=`.
- Unit tests pass for note table and length resolution.

### Not verified / still failing (manual listen tests)

- **Primary acceptance criterion:** exported song sounds like hUGETracker — **not met** as of 2026-07-01.
- Desktop preview often worse than CLI/WAV (WebAudio path), but **all three** still differ from hUGETracker on `gb_uge_note_demo.bax`.
- CH4 voice reset and `length=` changes did not produce an obvious improvement in user A/B listening.

## Known playback gaps (likely next work)

These are not implemented or are only approximated; they probably dominate the remaining audible difference:

1. **Instrument subpatterns** — hUGETracker kicks/snares often use internal instrument subpatterns for pitch/volume shapes; BeatBax plays single static hits. See [gameboy-uge-instrument-subpatterns.md](./gameboy-uge-instrument-subpatterns.md).
2. **LFSR / envelope fidelity** — WebAudio pre-buffer + simplified LFSR vs hardware NR41–NR44 timing; not cycle-accurate.
3. **Length counter edge cases** — BeatBax uses N/256 s frame semantics from authoring docs; hUGEDriver packs NR41 + length-enable bits — confirm no export/play inversion vs hUGETracker UI values.
4. **7-bit note path** — metallic mode via NR43 bit 3 (hUGEDriver OR) is implemented; if hUGETracker audibly differs, re-check against live `.uge` + SameBoy/hardware capture.
5. **Mixer / master volume** — NR50/NR51 pan and master level not fully emulated in preview.

## Acceptance criteria

| Criterion | Status |
|-----------|--------|
| Named hit with `gb:uge_note=` uses same NR43 clock in preview as UGE export row note | ✅ Mapping + export |
| Preview/WAV sounds recognizably similar to same `.uge` in hUGETracker | ❌ Manual A/B failed |
| Old `.bax` with `divisor`/`shift` warns; values ignored | ✅ |
| Docs: [instrument-parameters.md](../grammar/instrument-parameters.md), [instrument-parameter-nomenclature.md](./instrument-parameter-nomenclature.md) | ✅ |

## How to test when resuming

```bash
# Build
cd packages/engine && npm run build

# WAV vs UGE in hUGETracker
npm run cli:dev -- export wav songs/gameboy/instruments/gb_uge_note_demo.bax /tmp/demo.wav
npm run cli:dev -- export uge songs/gameboy/instruments/gb_uge_note_demo.bax /tmp/demo.uge

# Richer kit reference (better A/B baseline than the minimal demo)
npm run cli:dev -- export wav songs/gameboy/instruments/gb_percussion_demo.bax /tmp/perc.wav
npm run cli:dev -- export uge songs/gameboy/instruments/gb_percussion_demo.bax /tmp/perc.uge

# Diagnostic: resolved LFSR params per instrument
node -e "
  const { resolveNoisePlayback } = require('./packages/engine/dist/chips/gameboy/noiseNoteTable.js');
  for (const [name, uge_note, width] of [['kick','C-6',7],['snare','C-6',7],['hat','C-7',15]]) {
    const p = resolveNoisePlayback({ width, uge_note }, undefined, 'uge');
    console.log(name, 'index='+p.noteIndex, 'lfsrHz='+p.lfsrHz.toFixed(1), 'width='+p.width);
  }
"
```

Desktop: `npm run engine:build && npm run desktop:dev` — confirm transport **UGE** badge on Game Boy songs.

## Suggested next steps (pick up later)

1. **Golden-ear / capture test** — render same pattern in hUGETracker (or SameBoy + hUGEDriver ROM) and BeatBax WAV; diff spectrograms or RMS envelopes to find which parameter diverges first.
2. **Subpattern support** — highest impact for kick/snare character in real hUGE songs.
3. **Reconcile length semantics** — compare BeatBax `length=16` in exported `.uge` instrument blob vs hUGETracker instrument editor and hUGEDriver NR41 write.
4. **Optional:** pulse-channel kick in demos instead of noise kick — many hUGE kits use CH1 for kick; noise-only demos may always sound unlike tracker expectations.

## Non-goals

- Perfect cycle-accurate APU emulation (unless required to close the listen-test gap).
- Cross-chip nomenclature renames (separate spec).
