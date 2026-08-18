---
"@beatbax/engine": patch
"@beatbax/app-core": patch
---

Follow nested sequences in the playback gutter so section seqs light up, not only the form seq.

`channel => seq mel` with `seq mel = deep land …` used to tag every event as `mel`, so the amber ▶ sat only on the form line. Events now carry the innermost seq (`deep`) plus the outer-to-inner path (`mel → deep`). The gutter marks every named seq in that path; the pattern grid splits on the same inner names.
