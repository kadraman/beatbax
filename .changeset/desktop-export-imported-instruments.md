---
"@beatbax/app-core": patch
---

Merge imported instrument kits before Desktop/web ExportManager validation (monorepo internal).

Songs that `import` kits had no `inst` lines in the buffer, so Export → UGE/MIDI/WAV/JSON failed with undefined-instrument errors even though Play and CLI export succeeded. Export now resolves imports the same way Play does, then validates and exports the merged song.
