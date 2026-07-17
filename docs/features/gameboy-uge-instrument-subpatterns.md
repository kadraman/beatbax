---
title: "Game Boy Instrument Programs → UGE Subpatterns"
status: proposed
authors:
  - kadraman
created: 2026-06-29T00:00:00.000Z
updated: 2026-07-17T00:00:00.000Z
related:
  - docs/features/complete/gameboy-instrument-macros-policy.md
  - docs/features/complete/gameboy-noise-uge-playback-parity.md
  - docs/features/hugetracker-uge-converter.md
  - docs/features/song-timing-pattern-grid-inspector.md
issue: https://github.com/kadraman/beatbax/issues/150
---

## Summary

Give Game Boy instruments short **tick-time motion** (pitch drops, volume shapes, duty/timbre steps) that:

1. Authors write with the existing BeatBax **macro** fields (`pitch_env`, `vol_env`, and later `duty_env` / `arp_env`)
2. Compile once into a shared **tick program** (instrument program IR)
3. Drive **both** BeatBax preview/WAV playback **and** hUGETracker UGE instrument **subpattern** rows from that same IR

This revisits [`gameboy-instrument-macros-policy.md`](complete/gameboy-instrument-macros-policy.md) under its approved criterion: a formally specified, test-covered compile-time lowering model.

Native `subpat` syntax (hUGE-shaped offset / jump / effect rows) is a **later phase** for UGE import fidelity and power-user effects that macros cannot express. It is not the v1 authoring surface.

hUGETracker reference: [Subpatterns](https://superdisk.github.io/hUGETracker/hUGETracker/subpatterns.html).

---

## Problem Statement

Current BeatBax Game Boy noise instruments are mostly single-trigger definitions:

```bax
inst kick type=noise gb:width=7 env=14,down,1 uge_note=C-6
```

This cannot express the short internal motion common in hUGETracker percussion:

- Kick drops that step through several noise pitches
- Snares with a bright transient then a lower tail
- Hats with stepped volume shapes
- Pulse “plucks” (start up an octave, then settle)

hUGETracker solves this with **instrument subpatterns**: mini tick scripts attached to an instrument (offset | jump | effect), not with FamiTracker-style macro arrays.

BeatBax already has portable macro syntax on NES/SMS/Spectrum. Game Boy currently **rejects** those fields by policy, because enabling them without a shared lowerer would make preview and UGE export diverge.

---

## Design Decision

| Layer | Choice |
|-------|--------|
| **v1 authoring** | Existing macros: `pitch_env`, `vol_env` (noise first; `duty_env` / `arp_env` next) |
| **Canonical IR** | Tick program: ordered per-tick actions (offset, optional effect, jump/halt) |
| **Preview + WAV** | Interpret the tick program (do **not** reuse NES-style macro advance separately) |
| **UGE export** | Serialize the same tick program into instrument subpattern rows |
| **Later authoring** | Optional native `subpat` for raw hUGE effects / round-trip import |

**Do not** invent BeatBax-only per-row props such as `{ width, divisor, shift }` inside a fake absolute-note `subpat`. Noise clock comes from base `uge_note` + per-tick **offsets**; LFSR width stays instrument-level (`gb:width`) or maps via hUGE effect `9xx` when needed.

---

## Goals

1. Enable Game Boy `pitch_env` / `vol_env` (and documented follow-ons) with deterministic UGE lowering.
2. Define one `lowerGameBoyInstrumentProgram(inst) → TickProgram` used by playback and export.
3. Start with `type=noise` drums; leave room for duty/wave.
4. Keep song `pat` length unchanged — programs run inside the instrument on note-on.
5. Match hUGE subpattern semantics closely enough that exported drums behave in hUGETracker.
6. Defer full hUGE effect surface and native `subpat` grammar until macros cover the common cases.

---

## Non-Goals

- Full tracker editing in BeatBax.
- Supporting every hUGE subpattern effect in v1.
- Replacing NES/SMS `*_env` with hUGE-shaped syntax.
- Making hUGE `subpat` the universal cross-chip instrument model.
- Export-only macros with a “preview may differ” escape hatch as the long-term design.
- Perfect bit-exact LFSR / click parity with hUGEDriver in phase 1 (aim for close, testable behavior).

---

## hUGE Subpattern Model (target semantics)

Each UGE instrument can enable a 64-row subpattern. Rows are **not** absolute notes:

| Column | Meaning |
|--------|---------|
| **Offset** | Semitone offset from the **base note** that triggered the instrument |
| **Jump** | Optional jump to a row (loop / halt). Default: loop to start. Self-jump = freeze |
| **Effect** | One tracker effect for **that tick only** |

Key rules ([manual](https://superdisk.github.io/hUGETracker/hUGETracker/subpatterns.html)):

- One row = one tick (not a BeatBax pattern step).
- Subpatterns auto-loop unless jump/halt prevents it (forgetting halt causes volume/pitch crackle on long notes).
- Subpattern effects override conflicting main-grid effects.
- Usable effects include `0,1,2,4,5,6,8,9,A,C,F`. Not usable: `3,7,B,D,E` (use jump / `C00` instead).
- Effect `9xx` changes pulse duty, wave RAM index, or noise LFSR width.
- Effect `Cxy` sets volume (and can retrigger / click — prefer short one-shots for drums).

UGE v6 already stores 64 subpattern cells per instrument (`note | unused | jump | effectCode | effectParam`). BeatBax writes empty disabled rows today; this feature fills them from the tick program.

---

## Proposed Authoring (v1 — macros)

Reuse existing macro syntax. Base pitch for noise remains `uge_note=`:

```bax
chip gameboy
bpm 140

inst kick type=noise gb:width=7 env=14,down,1 uge_note=C-6 \
  pitch_env=[0,-2,-4,-6] vol_env=[15,12,8,4]

inst snare type=noise gb:width=7 env=10,down,2 uge_note=C-7 \
  pitch_env=[0,7,0] vol_env=[12,8,4]

inst hat type=noise gb:width=15 env=4,down,1 uge_note=C-8 \
  vol_env=[5,2]

pat drums = kick hat snare hat
channel 4 => inst kick pat drums
```

### Macro → tick program (normative sketch)

| Source | Tick program |
|--------|----------------|
| `pitch_env=[…]` | Per-tick `offset` (semitones relative to base note) |
| `vol_env=[…]` | Per-tick set-volume effect (`Cxy`) |
| `duty_env=[…]` (later, pulse) | Per-tick timbre (`9xx`) |
| `arp_env=[…]` (later) | Offsets; prefer `pitch_env` when not looping a chord shape |
| `\|N` loop point | Jump back to row N |
| No loop (one-shot) | **Halt** (self-jump) on the last authored row so hUGE does not restart |

### Merge rules (must be specified and tested)

Macros are parallel lanes; a subpattern is one timeline. v1 rules:

1. Zip lanes to `max(lengths)`.
2. Missing pitch → hold last offset (or `0` before first pitch value).
3. Missing volume → omit volume effect that tick (or hold last — pick one, test it).
4. If volume and duty would both need the effect column on the same tick, **volume wins** in v1; emit a diagnostic for the dropped duty step.
5. More than 64 ticks after expansion → export/playback error.
6. Empty program (no macros) → `subpatternEnabled=false`, empty rows as today.

### Interaction with hardware `env=`

- Instrument `env=` remains the UGE instrument envelope fields.
- `vol_env` lowers to subpattern `Cxy` steps and takes precedence for the stepped shape during the program.
- Document that combining long hardware envelopes with aggressive `Cxy` can click; drum kits should keep envelopes short or rely on `vol_env` + halt.

### Interaction with `uge_note`

- Pattern / named-hit base note still comes from `uge_note=` (and noise playback parity via `get_note_poly`).
- Tick offsets are applied relative to that base.
- Do not treat macro values as absolute `C-6` / `B-5` note names.

---

## Shared Tick Program (architecture constraint)

This is **not** a separate product feature. It is required implementation for this feature:

```text
inst macros (and later native subpat)
        │
        ▼
lowerGameBoyInstrumentProgram(inst)   ← single function
        │
        ▼
TickProgram  (offsets, effects, jumps/halt)
        ├── playTickProgram(...)      → WebAudio / PCM / WAV
        └── writeUgeSubpattern(...)   → .uge instrument rows
```

### Hard rules

1. Preview must **not** call the NES-style per-chip macro advance path as a second source of truth.
2. Export must **not** invent a separate ad-hoc mapping from arrays to rows.
3. Golden tests assert the same `TickProgram` for a fixture instrument feeds both paths.
4. If something cannot lower, **error or warn** — do not play full macros in the IDE while exporting a flat instrument.

### Suggested IR (sketch)

```ts
interface TickProgram {
  enabled: boolean;
  rows: TickRow[]; // max 64 when targeting UGE
}

interface TickRow {
  offset: number;          // semitones; 0 = base note
  effect?: { code: number; param: number }; // hUGE effect, or null
  jump?: number;           // absolute row index; omit if none
  halt?: boolean;          // encode as self-jump
}
```

Offset encoding into UGE `rowNote` must be confirmed against fixture `.uge` files (hUGE UI uses C6 as `+0` reference when entering offsets).

---

## Later Phase — Native `subpat` (optional)

For UGE import and effects macros cannot express (`1xx`/`2xx` portamento, pan, routines, etc.):

```bax
subpat kick_drop =
  +0  vol:15
  -2  vol:12
  -4  vol:8
  -6  vol:4
  halt

inst kick type=noise gb:width=7 uge_note=C-6 subpat=kick_drop
```

Rules when both macros and `subpat=` are present: **`subpat` wins**; warn that macros on that instrument are ignored for the program.

Raw escape hatch for round-trip:

```bax
subpat fancy =
  +3  fx:1,20
  +0  fx:C,0F
  jump:2
```

Native `subpat` also lowers into the **same** `TickProgram` IR.

---

## Implementation Plan

### Phase 0 — Tick program + lowerer

Deliverables:

- `TickProgram` types and `lowerGameBoyInstrumentProgram`.
- Documented merge / halt / loop rules.
- Unit tests for lowering fixtures (drums, looped arp-like pitch, uneven lane lengths).
- Fix UGE reader to **parse** v6 subpattern bodies (today it skips them) so export round-trips can be asserted.

Acceptance:

- Pure function: same instrument props → identical `TickProgram` every time.

### Phase 1 — Enable GB macros + UGE export

Deliverables:

- Allow `pitch_env` / `vol_env` on `chip gameboy` (noise first) with validation.
- Update macros policy status to point here as the approved revisit.
- UGE writer: `subpatternEnabled=true` + write 64 rows from `TickProgram`.
- Reject or warn on unsupported combinations.
- Demo song under `songs/gameboy/instruments/`.

Acceptance:

- Exported `.uge` opens in hUGETracker; noise drums show enabled subpatterns and audible pitch/volume motion.
- Song pattern lengths unchanged.

### Phase 2 — Preview / WAV from the same IR

Deliverables:

- Game Boy WebAudio and PCM paths execute `TickProgram` on instrument trigger.
- Tick timing aligned with hUGE tick semantics as closely as practical; document remaining gaps.
- No separate NES macro player for GB instruments that have a program.

Acceptance:

- Preview and exported UGE are recognizably the same gesture for fixture kits.
- Regression tests for program playback (offsets + volume steps + halt).

### Phase 3 — Duty/wave + richer macros

Deliverables:

- `duty_env` → `9xx` on pulse; wave timbre where representable.
- `arp_env` lowering where it does not fight `pitch_env`.
- Diagnostics for effect-column collisions.

### Phase 4 — Native `subpat` + UI

Deliverables:

- Parser/AST for `subpat` / `halt` / `vol:` / `fx:` / `jump:`.
- Completions, hover, inspector surfacing “has instrument program”.
- Importer path ([`hugetracker-uge-converter.md`](hugetracker-uge-converter.md)) emits `subpat` or macros as appropriate.

---

## Policy Impact

This feature **satisfies** revisit criterion 2 of [`gameboy-instrument-macros-policy.md`](complete/gameboy-instrument-macros-policy.md):

> A formally specified compile-time lowering model is introduced with deterministic, test-covered semantics.

Until Phase 1 lands, Game Boy `*_env` fields remain rejected. After Phase 1, macros are allowed **only** through this lowering path.

---

## Cross-chip note

`*_env` remains the portable authoring idiom where chips already support it (NES, SMS, Spectrum). Game Boy consumes the same syntax but lowers to UGE subpatterns instead of FamiTracker/VGM macro tables.

Do **not** force hUGE-shaped `subpat` onto other chips. A future shared engine IR is optional; this feature only requires a **Game Boy** tick program shared by preview and UGE export.

---

## Test Plan

- Lowerer unit tests: zip/pad, halt encoding, loop jumps, >64 error, empty → disabled.
- UGE export: write → read back subpattern rows (requires reader fix).
- Golden fixtures: kick/snare/hat kits vs expected offsets + `Cxy` params.
- Playback tests: program advances offsets/volumes; halt does not restart.
- Validation: GB macros rejected until flag/path enabled; after enable, unknown macro combos warn.
- Manual: open exported `.uge` in hUGETracker and audition drums.

---

## Risks And Open Questions

1. Exact UGE `rowNote` packing for signed offsets (C6 = `+0` in the tracker UI).
2. Best `env=` vs `vol_env` authoring guidance to avoid clicks.
3. Tick rate alignment between BeatBax GB backend and hUGEDriver when BPM/tempo modes differ.
4. Whether inline macros (`pitch_env:[…]` on a note) are in scope for GB v1 (recommend **instrument-level only** first).
5. How aggressively to support `arp_env` vs telling authors to use `pitch_env` for drums.
6. Priority when pattern-level `arp`/`vib`/`port` conflict with an active instrument program (hUGE: subpattern wins per tick).

---

## References

- [hUGETracker Subpatterns](https://superdisk.github.io/hUGETracker/hUGETracker/subpatterns.html)
- [hUGETracker Effect reference](https://superdisk.github.io/hUGETracker/hUGETracker/effect-reference.html)
- [UGE v6 format](https://superdisk.github.io/hUGETracker/hUGETracker/uge-format.html)
- [`docs/formats/uge-v6-spec.md`](../formats/uge-v6-spec.md)
- [`docs/features/complete/gameboy-instrument-macros-policy.md`](complete/gameboy-instrument-macros-policy.md)
- [`docs/features/complete/gameboy-noise-uge-playback-parity.md`](complete/gameboy-noise-uge-playback-parity.md)
