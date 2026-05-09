---
"@beatbax/engine": patch
---

Extract Game Boy New Song wizard metadata/templates into a dedicated `songWizard` module and wire it through the built-in Game Boy plugin via `newSongWizard`.

Keep Game Boy `ui-contributions` focused on editor prompt/hover/help content while preserving chip-aware New Song onboarding defaults.
