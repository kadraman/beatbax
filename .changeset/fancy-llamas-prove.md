---
"@beatbax/plugin-exporter-famitracker": patch
"@beatbax/plugin-exporter-vgm": patch
"@beatbax/plugin-chip-nes": patch
"@beatbax/plugin-chip-sms": patch
"@beatbax/engine": patch
---

Refactor shared music utilities into the engine and expose them through the plugin API, then migrate chip/exporter packages to consume the centralized utilities. Improve VGM exporter backend behavior and alias handling, including normalized SN76489-family chip alias validation consistency (for example underscore/hyphen variants), plus regression coverage and SN76489 flush behavior documentation clarification.
