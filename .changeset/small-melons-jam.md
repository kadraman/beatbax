---
"@beatbax/engine": minor
"@beatbax/cli": patch
---

Split engine runtime entrypoints and move Node playback internals into engine Node API.

- Add @beatbax/engine/node with playFile, playAudioBuffer, and Node runtime helpers.
- Move nodeAudioPlayer ownership from CLI into engine and update CLI to consume engine Node APIs.
- Keep CLI command behavior the same while removing internal engine-to-CLI runtime coupling.
- Update docs and tests for the runtime boundary and Node playback fallback behavior.
