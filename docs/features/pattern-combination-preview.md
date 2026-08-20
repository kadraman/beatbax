---
title: "Pattern Combination Preview (Arrangement Slice)"
status: proposed
authors: ["kadraman"]
created: 2026-08-20
issue: ".github/issues/pattern-combination-preview.md"
related:
  - docs/features/pattern-grid-seek-and-loop.md
  - docs/features/complete/editor-interactive-features.md
  - docs/features/complete/enhanced-command-palette-commands.md
  - docs/features/complete/sequence-arrangements.md
  - docs/features/song-composition-abstractions.md
  - docs/features/complete/daw-channel-mixer.md
---

## Summary

Let BeatBax Desktop play one **time-aligned arrangement slice** across all channels — for example all four `theme_*` parts together — without commenting out other `channel` references or editing the buffer.

v1 is a **Pattern Grid** action that builds a synthetic `.bax` of only the overlapping section and plays it through the existing transport (`PlaybackManager`). There is **no new grammar**.

## Problem Statement

`pat` defines a phrase on one channel. Hearing how parts **combine** means playing the same time window on every channel at once.

Today that is painful:

| Capability | What it actually plays |
|---|---|
| CodeLens `▶ Preview` / `↺ Loop` on `pat` or `seq` | **One** item, one channel. Starting another preview stops the current one. |
| Channel mute / solo | Hides whole channels for the **full** song. Does not isolate a section in time. |
| Grammar `:mute` / `:rest` on a seq/pat ref | Silences that item but **keeps its duration**, so the wanted section still starts after silent bars. Every other token on every channel still needs editing. |
| Play Selection (`Ctrl+Shift+Space`) | Multiple **seq definition** lines can layer on separate channels. Multiple **pats are chained on one channel**. Instrument lookup only sees the **first** `seq` token on a `channel` line. |
| Transport Play | Plays every `channel` line as written. |

The practical workaround is commenting out other pattern/sequence references on each `channel` line. Songs such as [`songs/gameboy/heroes_call.bax`](../../songs/gameboy/heroes_call.bax) make that cost obvious:

```bax
channel 1 => inst hero_bright  seq fanfare_mel  theme_mel  bridge_mel  …
channel 2 => inst chord_bright seq fanfare_harm theme_harm bridge_harm …
channel 3 => inst deep_bass    seq fanfare_bass theme_bass bridge_bass …
channel 4 => inst kick         seq fanfare_perc theme_perc bridge_perc …
```

Hearing only the theme means four coordinated edits, then restoring the lines. Preview combinations are a **session** concern, not song structure, so a `mix` / `preview` directive would be the wrong layer.

## Proposed Solution

### Summary

Treat an arrangement slice as a **temporary channel map** derived from the Pattern Grid timeline. Keep definitions (`chip`, `bpm`, `import`, `inst`, `pat`, `seq`, `effect`). Replace `channel` and `play` with only the overlapping section, then play through transport.

```mermaid
flowchart LR
  click[Shift-click Pattern Grid block]
  window[Resolve seq or pat time window]
  overlap[Collect overlapping blocks per channel]
  synth[Synthetic source with those channel refs]
  play[PlaybackManager play]
  click --> window --> overlap --> synth --> play
```

Click-to-navigate on a Pattern Grid block stays the default. Slice play is an explicit modifier or affordance so existing muscle memory is unchanged.

### Example Syntax

No new `.bax` syntax. The synthetic buffer uses existing `channel` lines:

```bax
# original inst / pat / seq / import lines kept
channel 1 => inst hero_bright  seq theme_mel
channel 2 => inst chord_bright seq theme_harm
channel 3 => inst deep_bass    seq theme_bass
channel 4 => inst kick         seq theme_perc
play auto repeat
```

That is the same shape as commenting out the other seq tokens, without touching the editor.

### Example Usage

1. Open a multi-section song with the Pattern Grid visible.
2. Shift+click (or hover `▶`, or context menu **Play this section**) a block inside the theme.
3. Desktop highlights the column (all overlapping blocks) and plays `theme_mel` + `theme_harm` + `theme_bass` + `theme_perc` from t=0.
4. Mixer mute/solo still apply. Stop returns to the original buffer; source is unchanged.
5. From the editor, **BeatBax: Play Arrangement Slice at Cursor** does the same when the cursor is on a `pat`/`seq` that appears in a channel timeline.

## Scope

### Included (v1)

| Area | Detail |
|---|---|
| Slice definition | Time window of the **containing sequence item** when `seqName` is present (`theme_mel` = all of its pats). Otherwise the single pattern block (`channel N => pat foo`). |
| Other channels | Include blocks whose step range **overlaps** that window. Prefer the original `seq` name when the window matches that seq’s span. |
| Playback path | `onPlayRaw` → `PlaybackManager.play` (same path as Play Selection). **Not** the CodeLens isolated `Player` (mixer mute/solo and Pattern Grid playheads ignore CodeLens). |
| Desktop Pattern Grid | Shift+click and/or hover `▶`; column highlight while playing; context menu Play / Loop / Go to pattern. Plain click still navigates. |
| Command | `beatbax.playArrangementSlice` — slice at cursor when the name is used on a channel. |
| Loop | Optional `play auto repeat` on the synthetic source (context menu **Loop this section**). |
| Misaligned overlap | If a long pat spans the window, include the whole overlapping pat and toast. Step-accurate trim is seek/loop, not this feature. |
| Play Selection hardening | Map **every** seq/pat token on a `channel` line to that channel’s instrument. Layer multiple selected **pats** by resolved channel instead of `seq __multi__ = a b c`. |

### Out of scope (v1)

- New grammar (`section`, `form`, `mix`, `preview`, `cat`).
- Scratch mix of pats that are **not** on the timeline (session-view picker).
- Engine `startStep` / `endStep` seeking (see [pattern-grid-seek-and-loop.md](pattern-grid-seek-and-loop.md)).
- Additive CodeLens (several pats previewing at once on the isolated player).
- Changing default Pattern Grid click away from navigate.

## Implementation Plan

### AST Changes

None. The resolver already expands `channel` seq/pat lists into events with `sourcePattern` / `sourceSequence`.

### Parser Changes

None.

### CLI Changes

None required. Authors can still comment out channel refs for CLI `play`. A later `beatbax play --slice <seq>` is optional, not v1.

### Web UI / Desktop Changes

**App-core** (shared):

- New helper, e.g. `packages/app-core/src/editor/arrangement-slice.ts`: `buildArrangementSliceSource(fullSource, song, ast, range)` returning `{ source, loop? }`.
- Input range: `{ startStep, endStep }` or `{ seqName, channelId }` derived from Pattern Grid segments (`patName`, `seqName`, duration).
- Per channel: overlapping segments → one `seq` or `pat` ref. Instrument is the **channel’s** `inst`.
- Keep lines with the same preserve-set as `buildMultiPlaySource` (`chip`, `bpm`, `import`, `inst`, `pat`, `seq`, `effect`, …). Strip existing `channel` / `play`.
- Harden `buildMultiPlaySource` in [`command-palette.ts`](../../packages/app-core/src/editor/command-palette.ts) (full channel-token inst map; multi-pat layering via `findChannelForNamedItemInSource`).
- Register `beatbax.playArrangementSlice`.

**Desktop** (primary):

- [`DesktopPatternGrid.tsx`](../../apps/desktop/src/renderer/src/components/panels/DesktopPatternGrid.tsx): column highlight, Shift+click / hover `▶`, context menu.
- [`desktop-workspace.ts`](../../apps/desktop/src/renderer/src/lib/desktop-workspace.ts): `onPlaySlice` next to `onNavigate`, wired to `playbackManager.play`.

**Web-lite** (if cheap after the shared builder):

- Same Shift+click on [`apps/web-ui/src/ui/pattern-grid.ts`](../../apps/web-ui/src/ui/pattern-grid.ts).

### Export Changes

None. Slice playback is session-only and must not rewrite the document or change exporters.

### Documentation Updates

- This spec.
- Issue draft: [`.github/issues/pattern-combination-preview.md`](../../.github/issues/pattern-combination-preview.md).
- Cross-link from [pattern-grid-seek-and-loop.md](pattern-grid-seek-and-loop.md): this feature is synthetic-AST “play this column” and does **not** replace engine seek/loop.
- Help / settings copy if a shortcut is added (Shift+click on Pattern Grid).

## Testing Strategy

### Unit Tests

- `buildArrangementSliceSource` with a heroes_call-shaped fixture: clicking `theme_mel` emits four `channel` lines with `theme_*` seqs and the original instruments.
- Direct `channel N => pat foo` (no seq): slice is that one pat window on all overlapping channels.
- Mismatched channel lengths: overlapping whole pats included; no crash.
- `buildMultiPlaySource`: inst map covers later seq tokens on a multi-item `channel` line; two pats on different channels layer, not chain.

### Integration Tests

- Desktop: Shift+click a Pattern Grid block plays audio without changing the editor buffer; plain click still navigates.
- Slice play uses transport (mute/solo still apply). Stop restores the ability to Play the full original source.
- Command palette slice-at-cursor from a `seq theme_mel` line matches the grid result.

## Migration Path

Fully additive. Existing `.bax` files, CodeLens, mute/solo, and transport Play are unchanged. Pattern Grid plain click stays navigate-only.

## Implementation Checklist

- [ ] Spec + issue draft (this file and `.github/issues/pattern-combination-preview.md`).
- [ ] `buildArrangementSliceSource` + unit tests (aligned section, pat-only channel, mismatch).
- [ ] Harden `buildMultiPlaySource` inst map and multi-pat layering + tests.
- [ ] Desktop Pattern Grid: column highlight, Shift+click / hover `▶`, context menu; keep click = navigate.
- [ ] Wire `onPlaySlice` → `playbackManager.play` in desktop workspace.
- [ ] Command `beatbax.playArrangementSlice`.
- [ ] Web-lite Pattern Grid Shift+click if the shared builder is already in place.
- [ ] Desktop e2e: Shift+click does not edit source.

## Future Enhancements

- Engine `startStep` / `endStep` from [pattern-grid-seek-and-loop.md](pattern-grid-seek-and-loop.md) can replace the synthetic buffer with a true timeline range (loop region, pending start).
- Named `section` / `form` from [song-composition-abstractions.md](song-composition-abstractions.md) can label columns explicitly; Play this section would then resolve by section name.
- Scratch-mix picker: audition pats that are **not** yet on `channel` lines (session view). Separate feature.
- CLI `beatbax play --slice theme_mel`.

## Open Questions

1. Shift+click vs hover `▶` vs both for the primary grid gesture? Recommendation: **both** — Shift+click for speed, hover `▶` for discoverability.
2. Should **Loop this section** use `play auto repeat` on the synthetic source, or a UI-only loop that restarts `PlaybackManager`? Recommendation: `play auto repeat` on the synthetic source in v1 (matches song loop).
3. When overlapping seqs have different lengths, play until the **longest** overlapping span or clip to the clicked seq’s window? Recommendation: clip to the clicked window; extra tail on other channels is omitted (toast if a pat was truncated conceptually by using whole overlapping pats instead).

## References

- Issue draft: [`.github/issues/pattern-combination-preview.md`](../../.github/issues/pattern-combination-preview.md)
- [`docs/features/pattern-grid-seek-and-loop.md`](pattern-grid-seek-and-loop.md)
- [`docs/features/complete/editor-interactive-features.md`](complete/editor-interactive-features.md) — CodeLens, Play Selection
- [`docs/features/complete/enhanced-command-palette-commands.md`](complete/enhanced-command-palette-commands.md)
- [`docs/features/complete/sequence-arrangements.md`](complete/sequence-arrangements.md) — `arrange` removed; `channel` lists concatenate in time
- [`docs/features/song-composition-abstractions.md`](song-composition-abstractions.md) — proposed `section` / `form` (not this feature)
- [`packages/app-core/src/editor/command-palette.ts`](../../packages/app-core/src/editor/command-palette.ts) — `buildMultiPlaySource`
- [`packages/app-core/src/editor/codelens-preview.ts`](../../packages/app-core/src/editor/codelens-preview.ts)
- [`packages/app-core/src/editor/preview-channel-resolve.ts`](../../packages/app-core/src/editor/preview-channel-resolve.ts)
- [`apps/desktop/src/renderer/src/components/panels/DesktopPatternGrid.tsx`](../../apps/desktop/src/renderer/src/components/panels/DesktopPatternGrid.tsx)
- [`songs/gameboy/heroes_call.bax`](../../songs/gameboy/heroes_call.bax)

## Additional Notes

CodeLens must stay single-item. Chip channels are scarce; an additive CodeLens mix would fight the isolated preview `Player` and would not participate in mixer mute/solo.

This feature is **Phase 0** relative to Pattern Grid seek/loop: it unblocks “hear this column” with a synthetic AST. Seek/loop remains the right design for play-from-here and loop regions on the **full** song timeline.
