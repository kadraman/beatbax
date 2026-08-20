---
"@beatbax/engine": minor
---

Reuse HugeTracker patterns on UGE export instead of writing a unique 64-row chunk per bar.

When every channel’s expanded `pat` runs share a length of 16, 32, or 64, the order list repeats pattern IDs (`seq s = p * 4` is one body, four order entries). Shorter pats get D01 so padded rows are not played. Songs that are not on that grid still pack 64-row windows and hash-dedupe identical ones.
