---
"@beatbax/app-core": patch
---

Pattern Grid section focus and arrangement-slice playback (monorepo internal).

**Arrangement slice & section focus**

- Add `arrangement-slice.ts`: build a synthetic `.bax` for one time-aligned section across channels (`buildArrangementSliceSource`), section metadata (`listArrangementSections`, `resolveSectionFocus`, adjacent-section navigation), cursor-aware anchors (F6), and stable keys for repeated top-level channel seq items (`channelItemIndex`, `sectionGroupKey`).
- Harden `buildMultiPlaySource` instrument mapping; register `beatbax.playArrangementSlice`.
- `PlaybackManager.play({ ephemeral: true })` tags `parse:success` so slice/selection playback does not replace editor UI; add `isEphemeralParseSuccess()` guards across panels and language services.
- Register section-focus shortcuts (F6 at cursor, Esc exit, Alt+←/→) without Monaco triple-firing; global catalog skips Monaco unless `allowInMonaco`.

**Layout detection & source transforms**

- Detect arrangement layouts (`structured` / `phased` / `monolithic` / `mixed`) and emit info-level diagnostics on the first channel line.
- Command palette: **Restructure Phased Sections**, **Split Monolithic Channel Sequences**, **Add Section Markers** — with `restructurePhasedSections` (preserve per-channel comments and unreferenced helper seqs), `splitMonolithicChannelSeqs` (honour `name * N` repetition slots), and `mergeSectionMarkersFromCopilotTexts` (place markers by section number, not filtered index).
- Copilot arrangement-layout fix flow proposes/applies restructure or monolithic split via command palette.

**Problems panel**

- Preserve `ValidationIssue.level` when publishing validation events: info hints (e.g. phased layout) show on Problems without incrementing the warning badge.

**Desktop / web-lite wiring (internal)**

- Desktop Pattern Grid section lane, Shift+click / hover play, section-focus controller and editor overlay; web-lite Pattern Grid Shift+click slice play.
