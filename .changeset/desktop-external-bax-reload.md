---
"@beatbax/app-core": patch
---

Watch the open `.bax` on disk and reload it in Desktop (monorepo internal).

Add `beatbax:editor.fileReload` (`reloadIfUnmodified` by default) so a clean buffer silently picks up external saves (VS Code, git) while a dirty buffer shows a non-modal Reload / Keep editing banner. BeatBax Save and auto-save are ignored so they do not look like someone else’s edit.
