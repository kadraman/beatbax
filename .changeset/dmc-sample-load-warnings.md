---
"@beatbax/engine": minor
---

Report DMC sample-load failures to the host instead of only the console.

- `ChipPlugin.preloadForPCM` accepts an optional second argument `{ onWarn }` (new exported types `ChipPreloadOptions` and `ChipWarning`). The NES plugin reports each sample that fails to load through it; without `onWarn` it still logs to the console, so the CLI and WAV export behave as before.
- `Player` has a new `onWarn` callback that receives these warnings during `playAST`. Desktop and web show them in the Output panel, so blocked or missing remote DMC samples are visible in packaged builds without DevTools.
