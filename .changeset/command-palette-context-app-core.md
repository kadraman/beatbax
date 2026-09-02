---
"@beatbax/app-core": patch
---

Improve command palette discoverability and context-aware BeatBax actions (monorepo internal).

**Command registry & labels**

- Add shared `COMMAND_REGISTRY` / `command-labels.ts` for flat or `Category: Command` titles, keybindings, preconditions, and Monaco context-menu metadata (standalone vs VS Code via `formatCommandLabel`).
- Drive palette / editor actions from registry keys so Desktop and web-lite stay consistent.

**Cursor & feature context**

- Add `command-context.ts` with BeatBax when-clause keys (`beatbax.hasPatIdent`, `beatbax.arrangementFixable`, Pattern Grid / Copilot / MIDI flags, etc.) kept in sync on cursor, selection, content, and feature toggles.
- Cache `arrangementFixable` per source string so cursor moves do not re-parse large songs.

**Monaco F1 cleanup**

- Hide noisy built-in Monaco actions from the command palette (`hide-monaco-actions.ts`) while leaving useful keybindings intact.

**Clipboard export (Desktop)**

- Merge local import kits in `handleDesktopExportData` the same way as `ExportManager` so JSON / FamiTracker clipboard exports work for songs that use `local:` imports.
