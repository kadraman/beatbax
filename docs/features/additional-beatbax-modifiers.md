---
title: "Additional BeatBax language modifiers"
status: proposed
authors: ["kadraman"]
created: 2026-05-16
issue:
---

## Summary

Sequence and pattern references accept colon-chained transforms applied at **parse/expansion time** to a flat token array (notes, rests, sustain tokens, inline effects). Core implementation lives in [`packages/engine/src/expand/refExpander.ts`](packages/engine/src/expand/refExpander.ts).

### Implemented modifiers (current)

| Modifier | Aliases | Role |
|----------|---------|------|
| `oct(N)` | — | Octave transpose |
| `+N` / `-N` | `semitone(N)`, `st(N)`, `trans(N)`, `transpose(N)` | Semitone transpose |
| `rev` | — | Reverse token order |
| `rot(N)` | `rotate(N)` | Rotate token order left by N |
| `pal` | `palindrome` | Palindrome expansion (`tokens + reverse(tokens without pivot)`) |
| `slow(N)` | `slow` (defaults to 2) | Repeat each token N times (lengthen) |
| `fast(N)` | `fast` (defaults to 2) | Keep every Nth token (shorten) |
| `arp(a,b,...)` | — | Add inline `arp:` effect to each note token |
| `clamp(MIN,MAX)` | — | Clamp note pitch to range |
| `fold(MIN,MAX)` | — | Fold note pitch into range by octaves |
| `mute` | `rest` | Replace note tokens with rests (`.`), preserving rhythm skeleton |
| `inst(name)` | — | Override instrument for that slot |
| `pan(value)` | — | Wrap pattern in sequence-level pan |
| `presetName` | — | Apply named `effect` preset to every note (e.g. `melody:wobble`) |

Pattern syntax already covers **`*N` repetition**, **groups**, **durations** (`C4:4`), and **per-note effects** (`arp`, `vib`, `cut`, `port`, etc.) — see [`docs/features/complete/effects-system.md`](docs/features/complete/effects-system.md).

**Note:** `:arp(4,7)` is implemented as a sequence modifier (expands to inline `arp:` on each note). Omit leading `0` — root is implicit in playback and UGE `0xy` export.

```mermaid
flowchart LR
  subgraph today [Current pipeline]
    Pat[pat / seq ref] --> Tokens[token array]
    Tokens --> Mods[applyModsToTokens]
    Mods --> Resolver[resolver + effects]
  end
```

New modifiers should stay in the **token-transform** layer unless they need tick-level scheduling (those belong in effects or BPM/time directives).

---

## Tier 1 — High value, fits the current model

These mirror how chip musicians already work in trackers and in your SMS/GB composition guides (variation from a small pattern vocabulary).

### `rot(N)` / `rotate(N)` — cyclic shift

Rotate the pattern left by N steps. Pairs naturally with `rev` and comma-separated `seq` items on a `channel` line.

```bax
seq verse = bass_a bass_b bass_c
seq verse_shifted = bass_a:rot(1) bass_b:rot(2)  # same motif, different downbeat
```

**Chiptune use:** pickup bars, polyrhythmic bass against straight drums, evolving ostinatos without rewriting notes.

### `pal` / `palindrome` — play forward then backward

`rev` only; palindrome is `tokens + tokens.reverse().slice(1)` (avoid duplicating the pivot note).

```bax
seq fill = lick:pal
```

**Chiptune use:** classic “mirror” fills, symmetrical lead runs, tension/release in one line.

### `arp(4,7)` — pattern-level arpeggiate

For each **note** token, emit a mini-cycle of transposed copies (or append `<arp:…>` to each note — prefer matching existing `arp` effect semantics for export).

```bax
seq pad = chord_bar:arp(4,7):slow(2)
```

**Chiptune use:** one held chord pattern becomes duty-cycle arps on GB pulse; harmonized bass without duplicating `pat` definitions. Align with [`docs/features/complete/arpeggio-effect.md`](docs/features/complete/arpeggio-effect.md).

### `clamp(C3,C6)` / `fold(C2,C7)` — range safety

- **clamp:** transpose notes below/above range to min/max (critical for GB noise index mapping and UGE export — see [`TUTORIAL.md`](TUTORIAL.md) noise section).
- **fold:** wrap out-of-range notes by octaves (musical “fold” rather than hard clip).

```bax
seq drums_safe = noise_groove:clamp(C2,C7)
```

**Chiptune use:** reusable melodic patterns across sections without breaking export; percussion templates that must stay in noise range.

### `mute` / `rest` — replace notes with rests

Map every note token to `.` (preserve rhythm skeleton, drop pitch).

```bax
seq rhythm_only = melody:mute
```

**Chiptune use:** rhythm-only channel layouts, reference channels without pitch, teaching/drafting layouts before harmony is written.

### `preset` shorthand — global articulation

Apply a fixed effect preset to all notes (you already support named presets; explicit sugar helps discoverability):

```bax
effect stacc = cut:2
seq stabs = stab_pat:stacc
```

**Chiptune use:** section-wide staccato, uniform tremolo on a reused `pat` without editing every note.

---

## Tier 2 — High leverage, token-local next steps

### `invert` / `inv` — interval inversion

Invert around the first note (or pattern centroid). Complements `rev` (time) vs invert (pitch contour).

```bax
seq answer = motif:invert
```

**Chiptune use:** call-and-response bass, mirrored countermelodies on limited channels.

### `every(N, MOD)` — conditional transform (Tidal-style)

Apply `MOD` only to every Nth token (1-based or 0-based — pick one and document).

```bax
seq bass = line:every(2,oct(+1))   # octave hop on offbeats
```

**Chiptune use:** alternating octave bass (SMS/GB classic), highlight backbeats, cheap variation via per-channel `seq` items.

### `off(N)` / `lag(N)` — insert rests before pattern

Prepend N sustain/rest tokens (or delay first note) — useful when chaining short `pat`s in a `seq`.

```bax
seq late_entry = fill:off(4)
```

**Chiptune use:** pickup timing, aligning a 1-bar lick to bar 2 without empty `pat` definitions.

### `pick(1,3,5)` — index selection

Keep only selected token indices (sparse extraction; a generalized form of `fast`).

```bax
seq sparse_hook = riff:pick(1,3,5)
```

**Chiptune use:** reduce dense motifs into accent patterns, skeletonize riffs for call/answer layering.

### `chunk(N)` — local grouping transform

Split tokens into chunks of N and apply a deterministic operation per chunk (for example, reverse each chunk).

```bax
seq broken_up = riff:chunk(4)
```

**Chiptune use:** generate phrase-level variation without rewriting source patterns.

### `shuffle(seed)` — deterministic reordering

Seeded-only shuffle for reproducible variation (`shuffle` without a seed remains out-of-scope for deterministic exports).

```bax
seq alt_take = riff:shuffle(42)
```

**Chiptune use:** controlled variation between sections while keeping exact replay/export determinism.

---

## Tier 3 — Cross-pattern, chip-specific, or higher complexity

### `scale(major)` / `quantize(minor)` — snap to scale

Snap each note to nearest scale degree (optionally preserve rhythm). Live-coders use this heavily; chip composers use it for “wrong” transposed patterns that still sound in-key.

```bax
seq hook = riff:+7:scale(minor)
```

**Why moved later:** requires explicit key/scale policy and tie-breaking behavior for predictable results.

### `zip(other)` / `alt(other)` — interleave two patterns

Alternate tokens from two patterns (pad shorter one with rests). Enables call-response in one sequence line.

```bax
seq call_response = lead_a:zip(lead_b)
```

**Why moved later:** references another pattern/sequence and needs strict length/padding semantics.

### `duty(+1)` / `widen` — pulse timbre shift (chip-aware)

For pulse instruments only, bump duty or apply a duty_env step — maps to GB/NES hardware vocabulary. Could be implemented as “apply effect preset `duty_env:…`” under the hood.

**Why moved later:** backend/chip specific; better as preset/plugin mapping than core transform semantics.

These need **duration-aware** tokens (`_` sustain from `C4:4`) or tick metadata, cross-pattern semantics, or chip-specific policy — worth a separate design pass.

| Modifier | Idea | Why harder |
|----------|------|------------|
| `swing(66)` | Delay every 2nd event | Needs step grid / durations |
| `euclid(p,s)` | Euclidean rest mask | Needs fixed pattern length in steps |
| `humanize(5)` | Small random timing | Non-deterministic export |
| `stretch(2)` | Double each note’s written duration | Must rewrite `:N` suffixes and `_` runs |

If you add any of these, consider a **tick-native transform** phase after pattern expansion rather than extending `applyModsToTokens` only.

---

## Tier 4 — Nice-to-have / live-coding flourishes

Lower priority unless you want a more “pattern language” feel:

- **`echo_pat(N)`** — duplicate pattern with `oct(-1)` and implicit quieter preset (handy when chaining `seq` items on a channel)
- **`chord(3,7)`** — duplicate each note as extra tokens at offsets (static harmony vs time-multiplexed `arp`)

---

## Recommended implementation order (if you build later)

1. **`every(...)`** — strong variation payoff with token-local semantics.
2. **`off` / `lag`** — simple alignment utility for sequencing.
3. **`pick(...)`** — sparse extraction with deterministic behavior.
4. **`chunk(...)`** — deterministic phrase-shape variation.
5. **`shuffle(seed)`** — deterministic reorder only (seed required).
6. **`invert`** — useful musical contrast after the above ergonomic wins.
7. **Scale/quantize and timing modifiers** — separate design pass for theory/tick semantics.

Each new modifier should:

- Preserve rests (`.`, `_`, `-`) and non-note tokens unchanged (same rule as [`transposePattern`](packages/engine/src/patterns/expand.ts)).
- Merge into `parseSeqTransforms` / [`grammar.peggy`](packages/engine/src/parser/peggy/grammar.peggy) and `applyModsToTokens`.
- Update the warning string in `refExpander.ts`, command palette, and `TUTORIAL.md` transforms list.
- Add tests beside [`packages/engine/tests/transforms.test.ts`](packages/engine/tests/transforms.test.ts) and [`packages/engine/src/tests/refExpander.test.ts`](packages/engine/src/tests/refExpander.test.ts).

---

## What to avoid duplicating

Don’t add modifiers that overlap existing features without clear benefit:

| Already covered | Instead of new modifier |
|-----------------|-------------------------|
| Per-note pitch wobble | `vib`, `bend`, `port` effects |
| Time-multiplexed chords | `<arp:…>` on notes or `arp_env` on instrument |
| Double/half pattern length | `slow` / `fast` or `pat*2` |
| Section timbre | `:inst(name)` + instrument defs |
| Global loudness | channel gain / `volSlide` / `vol_env` |

---

## Summary pick list (best bang for next implementation wave)

If you only add five next, these maximize value while staying token-local and deterministic:

1. **`every(N, MOD)`** — alternating octave/instrument tricks in bass and leads
2. **`off(N)` / `lag(N)`** — easy timing alignment for pickups and late entries
3. **`pick(1,3,5)`** — sparse extraction from dense motifs
4. **`chunk(N)`** — phrase-shape variation without rewriting source patterns
5. **`shuffle(seed)`** — controlled variation with deterministic replay/export
