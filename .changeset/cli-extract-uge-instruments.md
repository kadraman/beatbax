---
"@beatbax/cli": minor
"@beatbax/engine": patch
---

Add `beatbax extract instrument` to turn hUGETracker `.uge` files into a BeatBax `.ins` kit.

The command infers UGE from the path (or `--from uge`), merges files/directories with clash renaming, and writes a valid `.ins` (optional trailing `output.ins` / `--out`, plus `--stdout`, `--summary`, `--demo`, `--type`, and `--strict`). Engine extract helpers now accept `kinds` and `kitFileName` so `--type` and `--demo` use the real kit basename without pulling Node `path` into the browser-safe root entry.
