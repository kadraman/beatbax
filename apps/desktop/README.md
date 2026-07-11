# BeatBax Desktop

BeatBax Desktop is the Electron + React **desktop-full** client — the primary full-featured BeatBax IDE.

Download installers from [GitHub Releases](https://github.com/kadraman/beatbax/releases) (tags `desktop-v*`).

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

The desktop renderer owns the desktop-full shell and React panel implementations:

- **Toolbar** — full export menu, examples, theme/wrap/fold controls
- **Transport bar** — play/pause/stop/apply, BPM LCDs, pattern grid sync
- **Three-pane layout** — resizable editor, Problems/Output tabs, Visualizer/Help tabs
- **Song Visualizer**, **Channel Mixer**, **Pattern Grid** (feature-flag gated)
- **Help panel** — full syntax reference with click-to-insert
- **Settings modal** — Ctrl+,
- **Export** — JSON/MIDI/UGE/WAV via native menu and toolbar
- **Status bar** — cursor position, parse status, chip/BPM, panels menu, diagnostics counts
- **AI Copilot** — right-tab panel (enable in Settings → Features → AI Assistant). Local **Ollama** setup: [copilot-local-ollama.md](../../docs/features/copilot-local-ollama.md)
- **New Song Wizard** — toolbar New / File → New; first-run onboarding
- **Advanced editor** — Monaco diagnostics, code lens previews, glyph margin, command palette (Ctrl+Shift+P)
- **Transport extras** — loop, live, rewind, BPM nudge, master volume
- **MIDI step entry** — record button (requires MIDI input enabled in Settings)
- **Debug overlay** — Settings → Advanced → Show debug overlay

Post-MVP enhancements (native React panels, auto-update, code signing): [desktop-client-enhancements.md](../../docs/features/desktop-client-enhancements.md).

## Releasing

Desktop installers are published via git tags and CI — not npm.

Before tagging, update `apps/desktop/package.json` version (if needed) and edit
`apps/desktop/build/release-notes.body.txt` with bullet points for that release.
`npm run desktop:dist` generates `README.txt` and `RELEASE-NOTES.txt` from the
templates and bundles both next to the application.

```powershell
git tag -a desktop-v0.2.0 -m "BeatBax Desktop v0.2.0"
git push origin desktop-v0.2.0
```

The [Desktop: Build](https://github.com/kadraman/beatbax/actions/workflows/desktop-build.yaml) workflow validates, packages on all three OSes, and publishes installer assets to GitHub Releases.

Full details: [docs/releasing.md](../../docs/releasing.md).

## Related docs

- [docs/features/complete/desktop-first-client-split.md](../../docs/features/complete/desktop-first-client-split.md) — completed master plan
- [docs/features/complete/electron-desktop-client.md](../../docs/features/complete/electron-desktop-client.md) — IPC and packaging reference
- [docs/qa/desktop-release-qa.md](../../docs/qa/desktop-release-qa.md) — QA sign-off
