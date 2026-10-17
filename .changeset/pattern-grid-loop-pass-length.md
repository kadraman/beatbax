---
"@beatbax/engine": minor
---

Add optional `PlayASTOptions.lengthSteps` to `Player.playAST`. When set, one pass lasts exactly that many steps at the song bpm (including trailing rests) instead of ending at the last scheduled note. Used by Pattern Grid loop ranges so `[startStep, endStep)` repeats for the full window. Omitted calls keep the previous last-note pass length; `stop()` clears the override.
