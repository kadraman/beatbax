---
"@beatbax/app-core": patch
"@beatbax/desktop": patch
---

Show DMC sample-load warnings in the Output panel (monorepo internal).

- `PlaybackManager` forwards the engine's new `Player.onWarn` warnings to the Output panel (`output:message`, source `playback`), once per message per play, so loop restarts do not repeat them.
- Desktop: remote asset errors no longer carry Electron's `Error invoking remote method '…':` prefix, and a blocked host's message says where to add it (Settings → Advanced → Remote host allowlist).
