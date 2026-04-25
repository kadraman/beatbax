---
"@beatbax/plugin-chip-nes": patch
"@beatbax/plugin-exporter-famitracker": patch
---

- Normalize NES DMC WebAudio loudness to match normalized channel playback without affecting hardware-scaled PCM rendering.
- Warn when FamiTracker export patterns use non-power-of-2 row counts to avoid silent boundary rows and improve export diagnostics.
