---
"@beatbax/engine": minor
"@beatbax/plugin-chip-nes": minor
"@beatbax/plugin-chip-sms": minor
"@beatbax/plugin-exporter-vgm": patch
---

Removed async chip-exporter auto-resolution and standardized explicit exporter registration.
Chip plugins should register exporters via exporterPlugins (or host/CLI registration), not runtime resolve hooks.
Also includes web-ui build warning cleanup and feature/spec documentation alignment.
