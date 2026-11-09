---
"@beatbax/engine": patch
---

Keep a Game Boy pulse portamento run on one oscillator. Contiguous `port` notes no longer fade out and restart at every step, and the glide uses the same pulse level as a normal note. A note without `port` still attacks on its own.
