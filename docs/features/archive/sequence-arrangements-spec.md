---
title: Sequence Arrangement (historical spec)
status: archived
authors: ["kadraman"]
created: 2025-12-12
removed: 2026-05
issue: "https://github.com/kadraman/beatbax/issues/10"
---

This document preserves the original design for the `arrange` directive, which was **removed** from BeatBax. For current authoring guidance, see [sequence-arrangements.md](../complete/sequence-arrangements.md).

## Summary

Introduce a first-class `arrange` construct that contains ordered rows of n-slot sequence arrangements. Each row is played in parallel across n channels and rows concatenate in time. Sequences may carry defaults (inst, bpm, speed, transforms) that are applied during expansion rather than at final channel mapping time.

## Goals

- Remove late `channel => inst/seq` mapping by moving mapping earlier in the expansion pipeline.
- Allow concise representation of multiple arrangements (variations) inside a single song.
- Preserve ability to export to existing targets including `.UGE` (hUGETracker v6) and enable deterministic mapping to the 4 GB channels.

## Syntax (removed)

Two forms were supported:

- Single-line (short):

  ```beatbax
  arrange main = lead | bass | wave | drums
  ```

- Multi-row (arrangements):

  ```beatbax
  arrange main {
      lead  | bass  | wave  | drums,
      lead2 | bass  | wave2 | drums
  }
  ```

Notes:

- Each slot could be a sequence name or empty (`.` or `-` for silence).
- Rows played sequentially; each row's n slots played in parallel across channels 1..n.
- Optional `defaults(...)` modifier (e.g. `arrange main defaults(bpm=100)` or `defaults(inst=leadA|leadB|wave1|perc)`).

## AST (removed)

```ts
{
  type: 'arrange',
  name: string,
  arrangements: (string | null)[][], // rows of slot names; null = empty slot
  defaults?: { bpm?: number; inst?: string; speed?: string }
}
```

The resolver expanded rows into per-channel streams before ISM validation and export.

## UGE export mapping (historical)

- Each row corresponded to an order entry with one pattern reference per channel.
- Shared pattern data was deduplicated when rows reused the same slot content.

## Channel `seq` multi-item syntax (still supported)

The following `channel` forms remain valid and are the replacement for multi-row layouts:

- Comma-separated lists: `channel 1 => inst lead seq lead,lead2`
- Repetition: `channel 1 => inst lead seq lead*2`
- Space-separated lists: `channel 1 => inst lead seq lead lead2`

Per-item modifiers (`:oct(-1)`, `:inst(name)`, etc.) apply during expansion as before.
