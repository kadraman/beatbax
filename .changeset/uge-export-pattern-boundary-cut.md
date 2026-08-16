---
"@beatbax/engine": patch
---

Stop UGE export from inserting E00 note-cuts on the last row of every 64-row pattern.

Notes that fill through a pattern boundary now keep ringing when the next event (the following order, or a `play auto repeat` wrap on a full-length song) is another note or sustain. Padded short patterns and one-shots without `repeat` still auto-cut so empty tail rows do not ring. Authored `.` rests are unchanged.
