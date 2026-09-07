---
"@beatbax/app-core": patch
"@beatbax/desktop": patch
---

Make Instrument Editor writes undoable.

Adding Envelope, Sweep, or macro tabs (and other panel writeback) now uses Monaco `executeEdits` instead of `setValue`, so Undo restores the previous `inst` line and removes the tab. macOS Edit → Undo/Redo routes to the song editor so Cmd+Z works while the panel is focused.
