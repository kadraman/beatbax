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

The desktop renderer bridges the web-ui panel implementations via `@web-ui` imports:

- **Toolbar** — full export menu, examples, theme/wrap/fold controls
- **Transport bar** — play/pause/stop/apply, BPM LCDs, pattern grid sync
- **Three-pane layout** — resizable editor, Problems/Output tabs, Visualizer/Help tabs
- **Song Visualizer**, **Channel Mixer**, **Pattern Grid** (feature-flag gated)
- **Help panel** — full syntax reference with click-to-insert
- **Settings modal** — Ctrl+, 
- **Export** — JSON/MIDI/UGE/WAV via native menu and toolbar
- **Status bar** — cursor position, parse status, chip/BPM, panels menu, diagnostics counts
- **AI Copilot** — right-tab ChatPanel (enable in Settings → Features → AI Assistant)
- **New Song Wizard** — toolbar New / File → New; first-run onboarding
- **Advanced editor** — Monaco diagnostics, code lens previews, glyph margin, command palette (Ctrl+Alt+P)

Still planned: MIDI step entry, debug overlay, native React rewrites of Visualizer/Mixer (Phase 5).
