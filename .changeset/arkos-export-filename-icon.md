---
"@beatbax/plugin-exporter-arkos": patch
---

Fix Arkos export download naming and toolbar icon.

- Prefer the open `.bax` document stem for UI export filenames (not Title_Case from `song name`).
- Stop plugin `payload.filename` from overriding ExportManager’s chosen name.
- Use `document-text` for the AKS toolbar button (the previous `file-code` icon was missing from the Heroicons set).
