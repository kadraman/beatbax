---
"@beatbax/app-core": patch
---

Merge imported instrument kits before CodeLens and command-palette preview (monorepo internal).

Pattern, sequence, and effect ▶ Preview re-parsed the buffer and called synchronous `resolveSong`, which throws in the Desktop/web engine bundle whenever the song has `import` lines. Preview now resolves imports the same way Play does, and Alt+P keeps `import` lines plus the channel instrument name.
