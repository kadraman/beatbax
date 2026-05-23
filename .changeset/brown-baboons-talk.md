---
"@beatbax/engine": patch
---

Log Node audio fallback failures before continuing to the next playback backend, and ensure runtime failures in `speaker` and `play-sound` correctly fall through to the system player.