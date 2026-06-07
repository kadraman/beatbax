# BeatBax Desktop

BeatBax Desktop is the Electron + React desktop client for the desktop-first client split.

## Scripts

From the repository root:

- `npm run desktop:dev` — start the desktop app with hot reload
- `npm run desktop:build` — build the Electron main, preload, and renderer bundles
- `npm run desktop:test` — run desktop unit tests
- `npm run desktop:dist` — create installable desktop artifacts with electron-builder

## Notes

- The desktop renderer builds with `__CLIENT_PROFILE__ = "desktop-full"`.
- `apps/desktop` consumes `@beatbax/app-core` directly for shared playback, parsing, and editor logic.
- Native file dialogs, recent files, and file associations are handled in the Electron main process.

## Current scope

This first implementation adds the desktop package scaffold, native file I/O plumbing, a React editor shell, and distribution automation. Mixer/visualizer panel bridges and richer export workflows will continue in follow-up iterations.
