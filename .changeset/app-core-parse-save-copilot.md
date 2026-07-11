---
"@beatbax/app-core": patch
---

Improve parse validity signaling, save-state atoms, and Copilot/editor integration hooks (monorepo internal).

- Add `valid` on `parse:success` and export `isParseSuccessValid()`; set `parseStatus` before emitting `parse:success` so synchronous listeners (e.g. auto-save) see the correct state.
- Add `documentSaveState` atom and `auto?: boolean` on `editor:saved`; add `copilot:ask-about-error` event for Problems → Copilot flows.
- Gate CodeLens preview on parse validity; add `BeatBaxEditor.cancelPendingChangeNotification()` for tooling edits.
- Persist `replyMode` on chat messages so Ask/Edit action buttons stay correct after mode switches.
