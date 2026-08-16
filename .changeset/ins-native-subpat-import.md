---
"@beatbax/engine": minor
---

Allow native `subpat` tables in `.ins` imports and merge them into the song.

Instrument libraries may declare `subpat name = …` next to `inst` / `import`. Named tables merge on import (last-wins), then `subpat=` is bound onto `subpatRows`, so a `.bax` can attach a library name (`subpat=bass_pluck`) without copying the block. `chip` / `pat` / `bpm` and other song directives in `.ins` files are still rejected. Missing `subpat=` is a parse warning when the file has imports, and an error otherwise.
