---
title: Game Boy UGE Instrument Subpatterns
status: proposed
authors:
  - kadraman
created: 2026-06-29T00:00:00.000Z
related:
  - docs/features/gameboy-noise-uge-playback-parity.md
  - docs/features/song-timing-pattern-grid-inspector.md
issue: https://github.com/kadraman/beatbax/issues/150
---

## Summary

Add BeatBax grammar and export support for Game Boy instrument subpatterns, focusing first on hUGETracker-compatible noise/percussion subpatterns.

hUGETracker instruments can contain a short internal pattern that plays when the instrument is triggered. This is especially useful for drums: one `kick` hit can perform a tiny pitch/noise/volume shape instead of being a single static noise event. Supporting this in BeatBax would make exported Game Boy drums closer to idiomatic hUGETracker songs and improve kick/snare/hat quality.

---

## Problem Statement

Current BeatBax Game Boy noise instruments are mostly single-trigger definitions:

```bax
inst kick type=noise gb:width=7 env=14,down,1 uge_note=C-6
```

This works, but it cannot express the short internal motion common in hUGETracker percussion instruments, such as:

- Kick drops that step through several noise pitches.
- Snares that combine a bright transient with a lower tail.
- Hats that use a short stepped volume/noise shape.
- Toms or explosions that change noise frequency over a few ticks.

Without subpatterns, BeatBax exports can sound flatter than hand-authored hUGETracker instruments.

---

## Goals

1. Add author-friendly syntax for reusable instrument subpatterns.
2. Export subpatterns into hUGETracker UGE instrument subpattern rows.
3. Start with Game Boy `type=noise`, while leaving room for duty/wave subpatterns later.
4. Keep normal song `pat` semantics separate from instrument-internal subpatterns.
5. Provide clear fallback behavior for playback before full subpattern preview support exists.

---

## Non-Goals

- Full tracker editing in BeatBax.
- Supporting every hUGETracker subpattern feature in the first implementation.
- Replacing normal song patterns with subpatterns.
- Implementing subpatterns for non-Game Boy chips initially.
- Perfect local playback parity in phase 1.

---

## Proposed Grammar

### Recommended Initial Syntax

Use a dedicated `subpat` declaration and reference it from an instrument:

```bax
subpat kick_drop =
  C-6:1
  B-5:1
  A-5:1
  G-5:1

inst kick type=noise gb:width=7 env=14,down,1 subpat=kick_drop
```

This keeps instrument subpatterns distinct from timeline `pat` blocks.

### Per-Step Parameter Syntax

For better drums, subpattern steps should eventually allow local parameter overrides:

```bax
subpat kick_drop =
  C-6:1 { width=7  divisor=7 shift=5 vol=15 }
  B-5:1 { width=7  divisor=7 shift=6 vol=12 }
  A-5:1 { width=15 divisor=3 shift=6 vol=8  }
  G-5:1 { width=15 divisor=3 shift=7 vol=4  }

inst kick type=noise subpat=kick_drop
```

Alternative compact form:

```bax
subpat kick_drop = [
  C-6 {width=7 divisor=7 shift=5 vol=15},
  B-5 {width=7 divisor=7 shift=6 vol=12},
  A-5 {width=15 divisor=3 shift=6 vol=8},
  G-5 {width=15 divisor=3 shift=7 vol=4}
]
```

### Instrument-Embedded Syntax

This is shorter, but less reusable:

```bax
inst kick type=noise gb:width=7 env=14,down,1 subpat=[
  C-6:1
  B-5:1
  A-5:1
  G-5:1
]
```

Recommendation: defer embedded syntax until named `subpat` blocks are proven.

---

## Example Drum Kit

```bax
chip gameboy
bpm 140

subpat kick_drop =
  C-6:1 { width=7  divisor=7 shift=5 vol=15 }
  B-5:1 { width=7  divisor=7 shift=6 vol=12 }
  A-5:1 { width=15 divisor=3 shift=6 vol=8  }
  G-5:1 { width=15 divisor=3 shift=7 vol=4  }

subpat snare_snap =
  C-7:1 { width=7  divisor=3 shift=4 vol=12 }
  C-7:1 { width=15 divisor=2 shift=4 vol=8  }
  C-6:1 { width=15 divisor=3 shift=5 vol=4  }

subpat hat_tick =
  C-8:1 { width=15 divisor=1 shift=2 vol=5 }
  C-8:1 { width=15 divisor=1 shift=3 vol=2 }

inst kick  type=noise subpat=kick_drop
inst snare type=noise subpat=snare_snap
inst hat   type=noise subpat=hat_tick

pat drums = kick hat snare hat
channel 4 => inst kick pat drums
```

---

## Semantics

### Triggering

When a named instrument token is used in a normal song pattern:

```bax
pat drums = kick . snare .
```

The instrument's subpattern is triggered at that row. The subpattern plays internally inside the instrument; it does not expand the song timeline or change the length of `pat drums`.

### Length

Subpattern length should be limited to hUGETracker's supported instrument subpattern rows. If UGE stores 64 rows per instrument, BeatBax can accept up to 64 subpattern steps/rows, but examples should keep drums short.

Recommended validation:

- Empty subpattern: warning or error.
- More than 64 rows: error for UGE export.
- Non-1-step durations: either expand to rows or reject in phase 1.

### Interaction With `uge_note`

If an instrument has both `uge_note=` and `subpat=`, the subpattern should define the exported subpattern rows. `uge_note=` can remain useful as:

- The default pattern-row note when subpattern export is unavailable.
- A display/default note for preview or fallback.
- The first subpattern note if the subpattern omits note values.

Recommended warning:

```text
Instrument 'kick' has both uge_note and subpat; UGE export will use subpat rows for the instrument body.
```

### Playback Fallback

Phase 1 can export subpatterns to UGE and use a simple local fallback:

- Trigger the instrument's first subpattern row during web/desktop playback.
- Show a warning that full subpattern playback is not yet supported.

Later phases should make local playback run the subpattern internally for preview parity.

---

## Implementation Plan

### Phase 1 - UGE Export Only

Deliverables:

- Parser support for named `subpat` declarations.
- AST/song model support for subpatterns.
- Validation for subpattern references on Game Boy noise instruments.
- UGE writer support for writing noise instrument subpattern rows.
- Docs and one `songs/gameboy/instruments` demo.

Acceptance criteria:

- A BeatBax `subpat kick_drop` exports into the UGE noise instrument subpattern.
- Normal song pattern length remains unchanged.
- hUGETracker opens the exported file and plays the subpatterned drum instrument.

### Phase 2 - Local Playback Preview

Deliverables:

- WebAudio/PCM playback executes subpattern rows when an instrument is triggered.
- Playback uses the same note/width/divisor/shift/volume semantics planned by the Game Boy noise parity feature.
- Add a preview warning or badge if playback falls back.

Acceptance criteria:

- A subpatterned kick audibly changes over its short internal rows in web/desktop playback.
- Exported UGE and local preview are closer than the single-hit fallback.

### Phase 3 - UI / Pattern Grid Integration

Deliverables:

- Hover/completion docs for `subpat`.
- Pattern Grid Inspector shows subpattern presence on named hits.
- Instrument details panel displays subpattern rows.
- Diagnostics for long/invalid subpatterns.

Acceptance criteria:

- Users can see which hits trigger subpatterns without opening the exported UGE file.

---

## Parser And AST Sketch

Potential AST node:

```ts
interface SubPatternNode {
  nodeType: 'SubPattern';
  name: string;
  rows: SubPatternRowNode[];
  loc?: SourceLocation;
}

interface SubPatternRowNode {
  note?: string;
  duration?: number;
  props?: Record<string, string | number | boolean>;
  loc?: SourceLocation;
}
```

Song model:

```ts
interface SongModel {
  subpatterns?: Record<string, SubPattern>;
}

interface InstrumentNode {
  subpat?: string;
}
```

---

## Export Mapping

For UGE v6, instrument records already include subpattern rows. BeatBax should map:

- `note` / `uge_note` -> UGE note index.
- `vol` -> subpattern volume/effect if supported by UGE row format.
- `width`, `divisor`, `shift` -> either instrument-level noise settings or encoded per-row effects if hUGE supports them.
- Unsupported per-row properties -> warnings.

Open technical detail: confirm exactly which hUGETracker instrument subpattern row fields affect noise frequency/volume and how they are represented in UGE v6.

---

## Test Plan

- Parser tests for named `subpat` declarations.
- Resolver tests for instrument `subpat` references.
- Validation tests:
  - missing subpattern reference,
  - too many rows,
  - unsupported property.
- UGE export tests that read the `.uge` back and verify subpattern rows are present.
- Example song export smoke test.
- Later: playback tests for subpattern-triggered noise variation.

---

## Risks And Open Questions

1. How much of hUGETracker's subpattern behavior is encoded in UGE v6 and how much is tracker/runtime interpretation?
2. Can per-row noise `width/divisor/shift` be represented directly, or do we need to approximate using notes/effects?
3. Should `subpat` be Game Boy-only grammar, or generic grammar with chip-specific validation?
4. Should subpattern durations support `:2`, `:4`, etc., or only one row per item initially?
5. How should subpatterns interact with normal effects like `arp`, `vib`, `port`, and `cut`?
6. Should `subpat` definitions be reusable across instruments with different base parameters?

