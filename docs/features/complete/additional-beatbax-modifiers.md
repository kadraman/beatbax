---
title: "Additional BeatBax language modifiers"
status: complete
authors: ["kadraman"]
created: 2026-05-16
issue:
---

## Summary

BeatBax supports colon-chained modifiers on sequence/pattern references. They are applied at expansion time over a flat token array (notes, rests, sustain tokens, inline-effect tokens).

Primary implementation: `packages/engine/src/expand/refExpander.ts` (`applyModsToTokens`).
Parser mapping: `packages/engine/src/parser/structured.ts` (`parseSeqTransforms`).

## Implemented Modifiers

The table below reflects all currently implemented modifiers.

| Modifier | Aliases | Behavior |
|----------|---------|----------|
| `oct(N)` | - | Adds octave transpose (`N * 12` semitones) |
| `+N` / `-N` | `semitone(N)`, `st(N)`, `trans(N)`, `transpose(N)` | Adds semitone transpose |
| `rot(N)` | `rotate(N)` | Cyclic left rotation by `N` tokens |
| `rev` | - | Reverse token order |
| `pal` | `palindrome` | Palindrome: `tokens + reverse(tokens without last pivot)` |
| `slow(N)` | `slow` (default `2`) | Repeat each token `N` times |
| `fast(N)` | `fast` (default `2`) | Keep every `N`th token (`idx % N === 0`) |
| `arp(a,b,...)` | - | Appends/merges inline `arp:` effect on each note token |
| `clamp(MIN,MAX)` | - | Clamp note pitch to range |
| `fold(MIN,MAX)` | - | Fold note pitch into range by octaves |
| `mute` | `rest` | Replace note tokens with `.` (rests), preserve rhythm skeleton |
| `inst(name)` | - | Sets sequence-level instrument override |
| `pan(value)` | - | Applies pan override for the transformed segment |
| `invert` | `inv` | Invert pitch contour around the first note (pivot) |
| `every(N,MOD)` | - | Apply inner modifier only on positions `N, 2N, 3N, ...` (1-based) |
| `off(N)` | `lag(N)` | Prepend `N` rest tokens (`.`) |
| `pick(i,j,...)` | - | Keep only listed 1-based token positions |
| `chunk(N)` | - | Split into chunks of `N`, reverse each chunk |
| `shuffle(seed)` | - | Deterministic seeded shuffle (LCG + Fisher-Yates) |
| `presetName` | any defined `effect` name | Apply named effect preset to all notes (type-aware merge, inline wins) |

## Semantics Notes

- Modifiers are applied left-to-right.
- Transpose family (`oct`, `+N`, `semitone`, etc.) accumulates and is applied once at the end of the chain.
- Non-note tokens are preserved by pitch transforms (e.g. `.`, `_`, `-`).
- `:arp(4,7)` normalizes offsets so root `0` is implicit; users should not include a leading `0`.
- `pan(value)` injects `pan(value)` at segment start and `pan()` at segment end.
- `inst(name)` injects `inst(name)` at segment start.
- Unknown modifiers are ignored with a warning.

## Constraints

- `every(N,MOD)` must remain token-local:
  - The inner modifier must produce exactly one token.
  - It must not introduce `inst` or `pan` overrides.
  - If invalid, token is left unchanged and a warning is emitted.
- `shuffle` requires an explicit seed to preserve deterministic export behavior.

## Examples

```bax
# Core transforms
seq a = lead:rot(1):pal:transpose(+2)
seq b = bass:clamp(C2,C5):slow(2)

# Tier-2 style transforms (implemented)
seq c = motif:invert
seq d = motif:every(2,oct(+1))
seq e = fill:lag(2)
seq f = riff:pick(1,3,5)
seq g = riff:chunk(4)
seq h = riff:shuffle(42)

# Preset-as-modifier
effect stacc = cut:2
seq stabs = chord_pat:stacc
```

## Not Modifiers

- Pattern repetition is `pattern*2` (or grouped repeats), not a sequence modifier.
- Per-note expressive behavior should use inline/preset effects (`vib`, `port`, `cut`, `arp`, etc.).
