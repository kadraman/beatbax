---
"@beatbax/engine": patch
---

Improve Game Boy UGE export compatibility and authoring clarity.

UGE export now supports `uge_note` on named Game Boy noise instruments using hUGETracker display notation, converts BeatBax flat notes to hUGETracker sharp equivalents with export warnings, and accepts 32-nibble hUGETracker hex strings in Game Boy wave validation. Game Boy example songs and docs were updated to use explicit `uge_note` values, add a focused `gb_uge_note_demo.bax`, and improve hUGETracker-friendly timing for affected Game Boy songs. Editor metadata and hover help now include the new `uge_note` property.
