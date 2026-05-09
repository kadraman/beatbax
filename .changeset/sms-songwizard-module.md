---
"@beatbax/plugin-chip-sms": patch
---

Move SMS New Song wizard metadata/templates into a dedicated `songWizard` module and wire it through the plugin `newSongWizard` field.

Keep SMS `ui-contributions` focused on Copilot prompt, hover docs, and Help panel content to improve maintainability.
