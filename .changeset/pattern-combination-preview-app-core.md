---
"@beatbax/app-core": patch
---

Add arrangement-slice playback helpers and section-focus keyboard shortcuts (monorepo internal).

Introduce `arrangement-slice.ts` to build a synthetic `.bax` that plays one time-aligned section across all channels without editing the buffer, plus section metadata (`resolveSectionFocus`, `listArrangementSections`, adjacent-section navigation, and cursor-aware anchors for F6). Register `beatbax.playArrangementSlice` and harden `buildMultiPlaySource` so multi-channel pat/seq selection maps instruments correctly.

`PlaybackManager.play` accepts `{ ephemeral: true }` and tags `parse:success` so Pattern Grid and editor context are not replaced during slice or Play Selection playback. BeatBax language services ignore ephemeral parse results so semantic tokens, hovers, and completions stay tied to the editor buffer. Add F5/F6/F8-adjacent section-focus shortcuts (F6 focus at cursor, Esc exit, Alt+←/→) to the desktop-full catalog.
