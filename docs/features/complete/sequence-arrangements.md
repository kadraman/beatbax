---
title: Sequence Arrangement
status: removed
authors: ["kadraman"]
created: 2025-12-12
removed: 2026-05
issue: "https://github.com/kadraman/beatbax/issues/10"
---

The `arrange` directive and its `defaults(...)` modifier were **removed** from the language. Multi-channel song layout is expressed with `channel` mappings only.

Historical design notes and the old syntax live in [sequence-arrangements-spec.md](../archive/sequence-arrangements-spec.md).

## Migration

Use one `channel` line per chip channel. For layouts that previously used multiple `arrange` rows, list sequences in **comma-separated** order on each channel — rows concatenate in time per channel, matching the old per-column behavior.

### Before (`arrange`)

```beatbax
arrange main defaults(inst=leadA|leadB|wave1|perc) {
   lead_seq  | bass_seq | wave_seq | drums_seq
   lead2_seq | bass_seq | wave_seq:oct(-1) | drums_seq
}
```

### After (`channel`)

```beatbax
channel 1 => inst leadA seq lead_seq, lead2_seq
channel 2 => inst leadB seq bass_seq, bass_seq
channel 3 => inst wave1 seq wave_seq, wave_seq:oct(-1)
channel 4 => inst perc  seq drums_seq, drums_seq
```

See `songs/features/sequence_demo.bax` for a working example.

### Mapping table

| Former `arrange` feature | Replacement |
|--------------------------|-------------|
| `defaults(inst=a\|b\|c\|d)` | `inst` on each `channel N =>` line |
| `defaults(bpm=…)` | top-level `bpm` directive |
| `defaults(speed=…)` | per-channel `speed` where supported |
| Multi-row block (rows concatenate in time) | comma-separated `seq` items on one channel |
| Empty slot `.` / `-` | omit the channel or use a silent sequence |
| Short form `arrange main = a \| b \| c \| d` | four `channel` lines with one `seq` item each |
| Per-slot modifiers (`seq:oct(-1)`) | same modifiers on `channel` `seq` items |

## What changed in the engine

- Parser: `arrange` is no longer a keyword; using it produces a parse error.
- AST: `arranges` / `ArrangeNode` removed from `schema/ast.schema.json` and `packages/engine/src/parser/ast.ts`.
- Resolver: no arrange→channel synthesis; only `ast.channels` is consumed.

## References

- Tutorial: `TUTORIAL.md` (channel and extended `seq` syntax)
- Demo song: `songs/features/sequence_demo.bax`
- Archived spec: [docs/features/archive/sequence-arrangements-spec.md](../archive/sequence-arrangements-spec.md)
