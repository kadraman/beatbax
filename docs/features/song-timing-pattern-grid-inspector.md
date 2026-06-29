---
title: "Song Timing Pattern Grid Inspector"
status: proposed
authors: ["kadraman"]
created: 2026-06-28
related:
  - docs/features/pattern-grid-seek-and-loop.md
issue: ""
---

## Summary

Add a Pattern Grid diagnostics mode that visualizes resolved song timing across channels and highlights pattern/sequence length problems before playback or export.

The goal is to make sync issues visible in the UI instead of requiring manual inspection of `.bax` source or exported tracker files. This feature complements the proposed Pattern Grid seek/loop work by using the same timeline representation for validation, debugging, and authoring feedback.

---

## Problem Statement

BeatBax songs can be musically valid but still confusing after playback or export when channels do not resolve to the same number of steps, patterns are not full bars, or percussion assumes a downbeat from another channel.

Recent examples:

- A melody coda was 15 steps while other channels were 16 or 32 steps, causing loop drift.
- A drum pattern comment said snare was on beats 2 and 4, but the actual hits were one 16th late.
- A song split percussion across wave-channel `wavekick` plus noise snare/hat; sections without `wavekick` sounded like the drum groove slipped.
- hUGETracker export exposed tracker-specific issues such as flats being converted, slow portamento on short notes, and missing downbeat anchors.

These problems are hard to spot in source because the relevant information is distributed across `pat`, `seq`, channel assignments, transforms, named instrument hits, and export behavior.

---

## Goals

1. Show resolved channel lengths and highlight mismatches.
2. Show pattern and sequence blocks aligned to bars/steps for all channels.
3. Warn when patterns or section sequences are not multiples of `stepsPerBar`.
4. Surface common percussion timing issues on the grid.
5. Surface UGE export-relevant timing/effect warnings near the affected rows.
6. Reuse Pattern Grid timeline data so this can later combine with seek/loop playback.

---

## Non-Goals

- Full tracker editing in the first implementation.
- Automatic rewriting of song patterns.
- Perfect musical intent detection for every genre.
- Replacing parser diagnostics; this should augment them with timing-specific context.
- Step-accurate audio seeking unless implemented by the related Pattern Grid seek/loop feature.

---

## User Experience

### Timing Overview

Add a "Timing" or "Inspector" view beside the existing editor diagnostics.

Example summary:

```text
Resolved Lengths
Ch1 Melody      272 steps  17 bars
Ch2 Harmony     272 steps  17 bars
Ch3 Bass        272 steps  17 bars
Ch4 Percussion  271 steps  16 bars + 15 steps  WARNING
```

When a channel length differs, the affected row in the Pattern Grid should extend shorter or longer than the others and show a red end marker.

### Pattern Grid Blocks

Render each resolved channel as timeline blocks:

```text
Bar          1        2        3        4
Ch1 Mel      fan_a    fan_b    hook_a   hook_b
Ch2 Harm     harm_a   harm_b   harm_c   harm_d
Ch3 Bass     bass_a   bass_b   bass_a   bass_b
Ch4 Drums    drums_a  drums_b  drums_a  drums_b
```

Useful block metadata:

- Pattern name.
- Sequence name and section name if available.
- Start/end step.
- Length in steps and bars.
- Export pattern/order index when inspecting UGE output.

### Inline Diagnostics

Overlay warnings directly on blocks or rows:

- `pat coda_end` is 15 steps; expected 16.
- `seq outro_mel` is 1 bar; `seq outro_perc` is 2 bars in the same section.
- Channel 4 ends 1 step after Channel 1.
- `drums_march`: snare hits at steps 6 and 14, not beats 2 and 4.
- `build_perc` has hats/snares but no kick/downbeat anchor.
- `phrase_c`: `port:16` on 2-step notes may be too slow for UGE.
- `Eb5` will export as `D#5` in hUGETracker.

### Step Drilldown

Clicking a block should open a step table:

```text
pat drums_a, 16 steps
Step  Beat  Event
1     1     .
2     e     hat
3     &     .
4     a     .
5     2     snare
...
```

For drum-focused inspection, named hits can use per-instrument labels and colors:

- Kick: low blue markers.
- Snare: red markers on expected backbeats.
- Hat: yellow markers on offbeats/subdivisions.

---

## How Pattern Grid Can Help

The Pattern Grid already wants a mapping from source structures to resolved timeline positions. The Timing Inspector should make that mapping explicit and reusable.

Recommended shared data model:

```ts
interface ResolvedTimelineBlock {
  channelId: number;
  sequenceName?: string;
  patternName?: string;
  sourceRange?: { line: number; column: number };
  startStep: number;
  endStep: number;
  lengthSteps: number;
  sectionName?: string;
}

interface TimingDiagnostic {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  channelId?: number;
  patternName?: string;
  sequenceName?: string;
  startStep?: number;
  endStep?: number;
  sourceRange?: { line: number; column: number };
}
```

Once the grid has `ResolvedTimelineBlock[]`, it can support:

- Visual length comparisons across channels.
- Click-to-source navigation from a block to the `pat` or `seq` definition.
- Click-to-play or loop selected sections once seek/loop support lands.
- Export-aware overlays, such as UGE pattern/order boundaries.
- "Why does this sound out of sync?" diagnostics grounded in the same timeline users hear.

The seek/loop feature and this inspector can share the same global step coordinate system. Seek/loop makes the grid interactive for playback; the Timing Inspector makes it explanatory.

---

## Diagnostic Rules

### Phase 1 - Structural Timing

- `channel-length-mismatch`: channels resolve to different total step counts.
- `pattern-non-bar-length`: pattern length is not a multiple of `stepsPerBar`.
- `sequence-section-mismatch`: grouped section sequences resolve to different lengths across channels.
- `empty-channel-tail`: one or more channels are silent while others continue.

### Phase 2 - Percussion Grid

- `snare-off-backbeat`: common snare instruments are not on beats 2/4 in 4/4-style grids.
- `missing-downbeat-anchor`: percussion section has hats/snares but no kick or low transient on beat 1.
- `split-kit-anchor-missing`: a pattern relies on a kick from another channel, but the paired section does not contain it.
- `dense-hats-no-backbeat`: hats imply pulse but no strong beat/backbeat marker exists.

These rules should be configurable or shown as warnings, not hard errors. Many genres intentionally use syncopation.

### Phase 3 - UGE Export Readiness

- `uge-flat-note-conversion`: flat notes will be converted to sharp equivalents.
- `uge-slow-portamento-short-note`: `port` speed is low on short notes.
- `uge-first-note-portamento`: first note in a channel/section uses `port`, but hUGETracker needs an active previous pitch.
- `uge-unsupported-effect`: effect will be omitted or approximated.
- `uge-wave-low-arp`: low wave-channel arpeggios may be unclear after UGE wave transpose.

---

## Implementation Plan

### Engine / App-Core

1. Add a resolver-side timeline extraction helper.
   - Input: parsed AST and resolved `SongModel`.
   - Output: channel lengths, pattern/sequence blocks, event rows, and source references where possible.
2. Add timing diagnostics that run after resolution.
3. Expose diagnostics through existing editor/app-core validation plumbing.
4. Add optional exporter-readiness diagnostics for UGE.

### UI

1. Add a Pattern Grid Inspector tab or diagnostics mode.
2. Render channel rows with block widths proportional to `lengthSteps`.
3. Add bar/step ruler using `stepsPerBar` or default 16-step bars.
4. Overlay diagnostic badges on affected blocks.
5. Add a block details panel with:
   - source `pat` / `seq`,
   - length,
   - step table,
   - diagnostics,
   - quick links to source.

### Tests

Add focused fixtures for:

- 15-step pattern in one channel.
- Channel length mismatch at song end.
- Section sequence mismatch.
- Split percussion kit where wave kick disappears in one section.
- Slow portamento on 2-step notes for UGE readiness.
- Flat-note UGE conversion warning.

---

## Acceptance Criteria

- Users can see all resolved channel lengths without exporting or asking an assistant.
- A one-step-short pattern is highlighted with the pattern name and source location.
- A section with mismatched channel sequence lengths is highlighted across all affected channel rows.
- Percussion timing warnings identify the relevant pattern and steps.
- UGE readiness warnings appear before export and match exporter behavior.
- Existing Pattern Grid playback visualization remains unchanged unless the inspector mode is enabled.

---

## Open Questions

1. Should percussion timing heuristics be chip-specific, configurable per song, or only opt-in?
2. How should the inspector infer kick/snare/hat roles: instrument names, type metadata, GM mappings, or explicit tags?
3. Should UGE readiness diagnostics live in the exporter, app-core, or a shared diagnostics module?
4. Should quick fixes be offered, such as "pad pattern to 16 steps" or "align snare to beats 2/4"?
5. Should the Pattern Grid show source pattern blocks or exported tracker pattern blocks by default?
