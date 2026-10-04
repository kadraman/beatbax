---
"@beatbax/app-core": patch
"@beatbax/desktop": patch
"@beatbax/web-ui": patch
---

Per-category CodeLens preview settings (monorepo internal).

Settings → Editor keeps the **Show CodeLens previews** master toggle and adds sub-toggles for pattern, sequence, instrument and effect previews (`beatbax:editor.codelens.patterns`, `.sequences`, `.instruments`, `.effects`). All default to on, so existing installs see no change. Turning a category off removes its ▶ Preview / ↺ Loop / note lenses without touching the others, e.g. hide `seq` lenses when you audition arrangements in Pattern Grid but keep `inst` note buttons.
