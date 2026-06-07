---
"@beatbax/app-core": minor
---

Introduce `@beatbax/app-core`, a private workspace package that holds shared client logic extracted from `apps/web-ui` for the desktop-first client split (Phases 1–2).

- Add `client-profile` with `web-lite` / `desktop-full` capability gating
- Add `createAppContext()` bootstrap (event bus, playback, export, parse pipeline)
- Add `FileIOAdapter` I/O abstraction
- Move stores, playback, editor, export, import, plugins, utils, and types from web-ui
- Use explicit `.js` extensions on relative ESM import/re-export specifiers for Node/Electron resolution
- Align `jest-environment-jsdom` to `^29.7.0` (Jest 29.x)
- Add workspace root scripts: `app-core:build`, `app-core:test`
