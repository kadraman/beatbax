---
"@beatbax/engine": patch
---

Fix per-token source metadata for sequence-level length modifiers.

Apply `pal`, `slow`, `fast` (and order modifiers) to the full expanded leaf-attribution stream before recompressing counts in `tokenSourceMeta`, matching resolver playback. Pass outer seq-ref modifiers from `resolver` / `resolver.browser` into `buildTokenSourceMeta` so channel refs like `group:fast(2)` attribute steps correctly (e.g. palindrome order `a, b, a`).
