---
title: "Desktop external .bax file reload"
status: complete
authors: ["kadraman"]
created: 2026-08-16
completed: 2026-08-16
related:
  - docs/features/complete/desktop-client-enhancements.md
  - docs/features/complete/settings-panel.md
  - docs/features/complete/electron-desktop-client.md
---

## Summary

BeatBax Desktop watches the open `.bax` file on disk and refreshes the editor when another program (VS Code, git, etc.) writes it.

Default policy is VS Code hybrid: silent reload when the buffer is unmodified; a non-modal banner when it is dirty. Settings → Editor can switch to always-ask, always-reload, or ignore.

## Behaviour

- Watches the parent directory of the current absolute document path (survives VS Code atomic save). Untitled songs are not watched.
- BeatBax Save / auto-save is ignored (`markSelfWrite`) so own writes do not look external.
- Reload applies disk text, clears dirty, re-parses, and does **not** stop playback.
- Deleted or moved files never clear the editor; a Keep editing banner is shown.
- Storage key: `beatbax:editor.fileReload` (`reloadIfUnmodified` | `alwaysAsk` | `alwaysReload` | `off`).

## Implementation

- Main: [`apps/desktop/src/main/file-watcher.ts`](../../apps/desktop/src/main/file-watcher.ts)
- IPC: `desktop:watch-document`, `desktop:unwatch-document`, `desktop:document-changed`
- Renderer: [`apps/desktop/src/renderer/src/App.tsx`](../../apps/desktop/src/renderer/src/App.tsx), [`file-reload-banner.ts`](../../apps/desktop/src/renderer/src/lib/file-reload-banner.ts)
- Policy: [`apps/desktop/src/shared/file-reload-policy.ts`](../../apps/desktop/src/shared/file-reload-policy.ts)

## Out of scope

- Watching imported `.ins` files
- Re-reading `LAST_DOCUMENT_PATH` from disk on startup vs localStorage
- Hot-patching playback when the file reloads
