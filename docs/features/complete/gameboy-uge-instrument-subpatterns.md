---
title: "Game Boy Instrument Programs → UGE Subpatterns"
status: complete
authors:
  - kadraman
created: 2026-06-29T00:00:00.000Z
updated: 2026-07-18T00:00:00.000Z
related:
  - docs/features/complete/gameboy-instrument-macros-policy.md
  - docs/features/complete/gameboy-noise-uge-playback-parity.md
  - docs/features/hugetracker-uge-converter.md
  - docs/features/song-timing-pattern-grid-inspector.md
issue: https://github.com/kadraman/beatbax/issues/150
---

## Summary

Game Boy instruments can run short **tick-time motion** (pitch drops, volume shapes, duty/timbre steps) that:

1. Authors write with BeatBax **macro** fields (`pitch_env`, `vol_env`, `duty_env`, `arp_env`) and/or native `subpat`
2. Compile once into a shared **tick program** IR (`lowerGameBoyInstrumentProgram`)
3. Drive **both** BeatBax preview/WAV playback **and** hUGETracker UGE instrument **subpattern** rows from that same IR

This satisfies revisit criterion 2 of `[gameboy-instrument-macros-policy.md](complete/gameboy-instrument-macros-policy.md)`.

**Shipped:** Phases 0–4 (authoring, export, preview, UI).
**Follow-up:** UGE **import** emitting `subpat` / macros (`[hugetracker-uge-converter.md](hugetracker-uge-converter.md)`).

hUGETracker reference: [Subpatterns](https://superdisk.github.io/hUGETracker/hUGETracker/subpatterns.html).

---



## Authoring (quick reference)

```bax
chip gameboy
bpm 128   # exact hUGE row timing: 224, 128, 112, 64, 56, …

# Macros → tick program (preview + UGE subpatterns)
inst kick type=noise gb:width=7 uge_note=C-6 pitch_env=[0,-2,-4,-6] vol_env=[15,12,8,4]
inst wah  type=pulse1 duty=50 env=12,flat duty_env=[2,2,2,2,2,2,2,2,0,0,0,0,0,0,0,0|0]
inst arp  type=pulse2 duty=25 env=10,flat arp_env=[0,4,7|0]

# Native subpat (empty rows, mid jumps, raw fx) — wins over macros on that inst
subpat kick_body =
  .
  +0 vol:15
  -2 vol:12 jump:5
  -4 vol:8
  -6 vol:4
  -6 vol:0
  halt

inst kick2 type=noise gb:width=7 uge_note=C-6 subpat=kick_body
```


| Field / syntax                    | Lowers to                                                          |
| --------------------------------- | ------------------------------------------------------------------ |
| `pitch_env`                       | Offset column                                                      |
| `vol_env`                         | Effect `Cxy` (wins over `duty_env` on the same tick)               |
| `duty_env`                        | Effect `9xx` (duty index 0–3 → pulse width)                        |
| `arp_env`                         | Offset column when `pitch_env` is absent                           |
| `subpat name = …` + `subpat=name` | Native rows (empty `.`, `jump:`, `vol:`, `timbre:`, `fx:`, `halt`) |


Demo: `[songs/gameboy/instruments/gb_subpattern_macro_demo.bax](../../songs/gameboy/instruments/gb_subpattern_macro_demo.bax)`.

**Noise base pitch** still uses `uge_note=`. Offsets are relative to that note. Prefer `uge_note=C-6` for kicks — large negative offsets from a high base (e.g. F-7/−31) are **not** a reliable pitch drop (GB noise note table is non-monotonic).

**One-shots:** macros without a loop point append silence (`C00`) + self-jump halt so the subpattern does not restart. Prefer ending `vol_env` at `0` or use explicit `halt`.

---



## Design Decision


| Layer             | Choice                                                    |
| ----------------- | --------------------------------------------------------- |
| **Authoring**     | Macros and/or native `subpat`                             |
| **Canonical IR**  | Tick program: per-tick offset, optional effect, jump/halt |
| **Preview + WAV** | Interpret the tick program (~60 Hz)                       |
| **UGE export**    | Same IR → 64 instrument subpattern cells                  |
| **Follow-up**     | UGE import → `subpat` / macros                            |


Do **not** invent BeatBax-only per-row `{ width, divisor, shift }` absolute-note syntax. Noise clock = base `uge_note` + offsets; LFSR width stays `gb:width` or `9xx`.

---



## hUGE Subpattern Model

Each UGE instrument can enable a 64-row subpattern. Rows are **not** absolute notes:


| Column     | Meaning                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------- |
| **Offset** | Semitone offset from the instrument base note (`C-6` = +0 in the tracker UI → note index 36) |
| **Jump**   | Optional jump to a **1-based** row (self-jump = halt/freeze)                                 |
| **Effect** | One tracker effect for that tick only                                                        |


Key rules ([manual](https://superdisk.github.io/hUGETracker/hUGETracker/subpatterns.html)):

- One row = one tick (~60 Hz).
- Subpatterns auto-loop unless jump/halt prevents it.
- Usable effects include `0,1,2,4,5,6,8,9,A,C,F`. Prefer short one-shots for drums (`Cxy` can click).

---



## Lowering Rules

Macros are parallel lanes; a subpattern is one timeline:

1. Zip lanes to `max(lengths)`; missing cells hold last pitch / omit effect.
2. Loop point (`|N`) → 1-based jump on the last row; different loop points warn.
3. One-shot (no loop) → silence halt unless last volume is already 0.
4. `vol_env` + `duty_env` on same tick → volume wins (one effect column).
5. `pitch_env` + `arp_env` → `pitch_env` wins (warning).
6. `subpat=` present → macros ignored for the program (warning).
7. Empty program → `subpatternEnabled=false`.

Implementation: `packages/engine/src/chips/gameboy/instrumentProgram.ts`.

---



## Implementation Plan



### Phase 0 — Tick program + lowerer ✅

- [x] `TickProgram` + `lowerGameBoyInstrumentProgram`
- [x] Merge / halt / loop rules + unit tests
- [x] UGE reader parses v6 subpattern bodies



### Phase 1 — Enable GB macros + UGE export ✅

- [x] `pitch_env` / `vol_env` allowed on `chip gameboy`
- [x] Macros policy updated
- [x] UGE writer fills 64 rows from tick program
- [x] `duty_env` / `arp_env` lowered (not merely warned)
- [x] Demo song



### Phase 2 — Preview / WAV from the same IR ✅

- [x] Noise WebAudio + PCM execute tick program
- [x] ~60 Hz ticks; BPM/tempo gaps documented in noise parity / UGE export guide
- [x] Playback regression tests



### Phase 3 — Duty/wave + richer macros ✅

- [x] `duty_env` → `9xx`; pulse preview/PCM apply duty steps
- [x] `arp_env` when no `pitch_env`
- [x] Effect-column collision diagnostics
- [x] Pulse mix gain retuned (`PULSE_OUTPUT_GAIN` 0.25) for hUGE WAV parity on sustained tones



### Phase 4 — Native `subpat` + UI ✅ (importer deferred)

- [x] Parser/AST for `subpat` / `halt` / `vol:` / `fx:` / `jump:` / `timbre:` / `.`
- [x] `inst … subpat=name` → `subpatRows` before validation
- [x] Completions + hover
- [ ] Importer emits `subpat` or macros (`[hugetracker-uge-converter.md](hugetracker-uge-converter.md)`)

---



## Remaining follow-up

1. **UGE import → BeatBax** — emit `subpat` (or macros when equivalent) so instrument programs round-trip.
2. **Inline note macros** (`C4<pitch_env:[…]>`) on Game Boy — still out of scope; instrument-level only.
3. **Pattern FX vs instrument program** — document/enforce hUGE “subpattern wins per tick” when `arp`/`vib`/`port` overlap an active program.
4. **Wave** `9xx` **timbre** — duty/noise covered; wave RAM index changes less exercised.

---



## Non-Goals

- Full tracker editing in BeatBax.
- Every hUGE subpattern effect.
- Replacing NES/SMS `*_env` with hUGE-shaped syntax.
- Forcing `subpat` onto other chips.
- Bit-exact LFSR/click parity with hUGEDriver (close, testable behavior).

---



## Cross-chip note

`*_env` remains the portable authoring idiom on NES/SMS/Spectrum. Game Boy uses the same syntax but lowers to UGE subpatterns. Do **not** force hUGE-shaped `subpat` onto other chips.

---



## Test Plan

- Lowerer unit tests: zip/pad, halt, loops, >64, native empty/jump.
- UGE export → read-back subpattern rows.
- Demo integration + hUGE reference WAV level checks.
- Pulse `duty_env` / `arp_env` playback tests.
- Manual: open exported `.uge` in hUGETracker.

---



## References

- [hUGETracker Subpatterns](https://superdisk.github.io/hUGETracker/hUGETracker/subpatterns.html)
- [hUGETracker Effect reference](https://superdisk.github.io/hUGETracker/hUGETracker/effect-reference.html)
- [UGE v6 format](https://superdisk.github.io/hUGETracker/hUGETracker/uge-format.html)
- `[docs/formats/uge-v6-spec.md](../formats/uge-v6-spec.md)`
- `[docs/features/complete/gameboy-instrument-macros-policy.md](complete/gameboy-instrument-macros-policy.md)`
- `[docs/features/complete/gameboy-noise-uge-playback-parity.md](complete/gameboy-noise-uge-playback-parity.md)`
- `[docs/grammar/instruments.md](../grammar/instruments.md)`
- `[TUTORIAL.md](../../TUTORIAL.md)`

