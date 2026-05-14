---
"@beatbax/engine": minor
"@beatbax/plugin-exporter-vgm": patch
---

Expose `midiToFreqForNote` through the engine public API and update the VGM exporter to use the consolidated engine utilities. Tighten the exporter’s engine peer range accordingly and add regression coverage for the shared music utility contract and VGM backend behavior.
