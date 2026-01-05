---
title: Sequence Arrangement
status: complete
authors: ["kadraman"]
created: 2025-12-12
issue: "https://github.com/kadraman/beatbax/issues/10"
---

## Summary

Introduce a first-class `arrange` construct that contains ordered rows of n-slot sequence arrangements. Each row is played in parallel across n channels and rows concatenate in time. Sequences may carry defaults (inst, bpm, speed, transforms) that are applied during expansion rather than at final channel mapping time.

## Goals

- Remove late `channel => inst/seq` mapping by moving mapping earlier in the expansion pipeline.
- Allow concise representation of multiple arrangements (variations) inside a single song.
- Preserve ability to export to existing targets including `.UGE` (hUGETracker v6) and enable deterministic mapping to the 4 GB channels.

## Proposed syntax

Two forms are supported:

- Single-line (short):

  arrange main = lead | bass | wave | drums

- Multi-row (arrangements):

  arrange main {
      lead  | bass  | wave  | drums,
      lead2 | bass  | wave2 | drums
  }

Notes:
- Each slot may be a sequence name or empty (use `.` or `-` to indicate silence when desired).
- Rows are ordered and play sequentially; each row's n slots play in parallel across channels 1..n.

- Deprecation note: legacy `rhs` string fields (pattern/sequence RHS) are deprecated. Prefer structured `tokens` on `PatternDef` and structured `items` on `SequenceDef` when authoring or consuming ASTs. See `docs/ast-schema.md` and `schema/ast.schema.json` for details.

## AST changes

Introduce a first-class arrangement construct (`arrange` keyword preferred to avoid collision with `song` metadata directives) that contains ordered rows of n-slot sequence arrangements. Each row is played in parallel across n channels and rows concatenate in time. Sequences may carry defaults (inst, bpm, speed, transforms) that are applied during expansion rather than at final channel mapping time.

```
{
  type: 'Arrange',
  name: string,
  arrangements: (string | null)[][], // array of rows, each row is length-4 sequence names
  defaults?: { bpm?: number; inst?: string; speed?: string }
}
```

- Accept optional `defaults` for an arrangement (e.g., `arrange main defaults(bpm=100)`).

Only make updates to the default parser (Peggy grammar); do not change the legacy tokenizer.
Structured parsing is now the default path, so target `packages/engine/src/parser/peggy/grammar.peggy` and `packages/engine/src/parser/peggy/index.ts`.
Add an `ArrangeNode`.

1. During resolution, expand each row in order. For each of the n slots:
   - Lookup referenced `seq` by name (error if missing).
   - Merge defaults: channelBase <- arrange.defaults <- seq.defaults.
   - Expand the sequence using merged defaults to produce an event stream for that row-slot.
2. Append each row's per-slot events to the corresponding per-channel stream (channels 1..n) in time order.
3. After expansion, existing ISM validation and export pipelines operate on the per-channel event lists as before.

## UGE export mapping (high-level)

UGE v6 represents 4-channel arrangements with patterns and an order list. Mapping rules:

- Each row corresponds to an order entry mapping to 4 channel pattern references (one per channel). We will emit an order list entry per row.
- If multiple rows reuse the same sequence/pattern for a channel slot across rows, emit shared pattern data to avoid duplication (deduplicate by content/hash).
- Sequence-level `inst` defaults map to instrument table entries; when a sequence references an instrument not present in the instrument table, add it to the song instrument table.

## Compatibility

- Existing `channel` mappings remain supported for backward compatibility. During parsing, prefer `arrange` when present; if both `arrange` and `channel` mappings exist, prefer `arrange` and warn.

## Examples

Example short form:

    arrange main = lead | bass | wave | drums

Example multi-row form:

    arrange main {
        lead  | bass  | wave  | drums,
        lead2 | bass  | wave2 | drums
    }

## Channel `seq` multi-item syntax

Channels may reference multiple sequences in a single `seq` clause. This file's
`Arrange` expansion semantics are compatible with the `channel` syntax extended to
support the following forms on a channel mapping line:

- Comma-separated lists:

  channel 1 => inst lead seq lead,lead2

- Repetition using `*N` (whitespace tolerant):

  channel 1 => inst lead seq lead * 2
  channel 1 => inst lead seq lead*2

- Space-separated lists (convenience form):

  channel 1 => inst lead seq lead lead2

Each sequence item may include the same inline modifiers allowed elsewhere
(`:oct(-1)`, `:inst(name)`, `:slow()`, `:fast()`, `:+2` etc.). When multiple
items are provided the resolver expands each item in order, applies modifiers to
that item, and concatenates the resulting token streams for that channel. This
behavior is consistent with `Arrange` expansion which concatenates per-slot
sequence streams for each row into the per-channel ISM.

## Acceptance criteria

- Parser accepts the new `arrange` syntax (both short and multi-row).
- Resolver produces n per-channel event lists for any `arrange` definition and merges defaults correctly.
- `ugeWriter` can consume the expanded ISM and produce a valid `.UGE` file that reproduces the 4-channel arrangement (tests validate structure and optional audio sanity checks).
- Unit tests added for parser, expansion, and UGE export round-trip (basic cases, tempo/inst overrides).

## Implementation notes

- Minimal approach: add the `ArrangeNode`, parser, and a resolver function that creates per-channel streams by concatenating rows. Keep exporter and playback code paths unchanged by feeding them the produced per-channel ISM.
- Follow-up: add optimizations for pattern deduplication and tempo-effect encoding for UGE.
- Ordering with other work: implement extended instrument AST normalization (`extended-ast-types.md`) first. It is lower-risk, unblocks cleaner effect handling, and avoids rebasing this larger grammar change while the instrument shapes are still in flux.

## Files to add / update

- docs/features/sequence-arrangements.md  (this file)
- parser (Peggy): extend `packages/engine/src/parser/peggy/grammar.peggy` and `parser/peggy/index.ts` to include the arrangement node/keyword (see collision note above) and update `ast.ts` (e.g., `ArrangeNode`).
- resolver: add `resolveArrangementToChannelStreams` in `song/resolver.ts`
- export: update `export/ugeWriter.ts` to accept arranged ISM and map rows -> order list (follow-up)

## Tests

- `packages/engine/tests/arrange-arrangements.test.ts` — parse, expand and verify 4-channel streams for one-row and multi-row arrangements.
- `packages/engine/tests/uge-arrange-export.test.ts` — ensure UGE writer produces expected binary structure for a simple arranged song.
