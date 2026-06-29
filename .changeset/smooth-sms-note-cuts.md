---
"@beatbax/engine": patch
"@beatbax/plugin-chip-sms": patch
---

Fix SMS note-cut clicks by preserving scheduled gain levels when applying cut effects.

SMS WebAudio gain scheduling now records envelope metadata so the engine cut effect can ramp down from the actual scheduled gain instead of jumping to the AudioParam default value.
