# @beatbax/web-ui

> BeatBax browser client — **web-lite** profile.

**Private workspace package.** Deployed to [app.beatbax.com](https://app.beatbax.com) as a lightweight try-in-browser experience. The full IDE lives in [BeatBax Desktop](../desktop/README.md).

## Web-lite scope

The web UI builds with `__CLIENT_PROFILE__ = "web-lite"`. Capabilities are gated via `@beatbax/app-core` (`getCurrentCapabilities()`).

### Included

- Toolbar — Open, New, Save (downloads `.bax`), Verify, theme, word wrap, fold, examples
- Monaco editor — syntax highlighting, diagnostics, completions, folding (no code lens, glyph margin, or command palette)
- Transport bar — play, pause, stop, apply, BPM, volume
- **Visualizer** panel (right pane)
- **Help** panel (right pane) — syntax reference
- **Problems** and **Output** panels (bottom pane)
- Status bar with Window menu
- Web-lite header — BeatBax text logo + social icon links
- File open via hidden input and `?song=` URL loading
- localStorage auto-save

### Not included (desktop-only)

| Feature | Use desktop instead |
|---------|---------------------|
| Export menu (JSON, MIDI, UGE, WAV, …) | `apps/desktop` |
| BeatBax CoPilot | Desktop Settings → Features → AI Assistant |
| Channel mixer | Desktop |
| Pattern grid | Desktop |
| Advanced editor (code lens, glyph margin, command palette) | Desktop |
| MIDI step entry | Desktop |
| Settings modal | Theme via toolbar / `Alt+Shift+L`; word wrap via toolbar |
| Native Open/Save dialogs | Desktop |

Save in web-lite triggers a `.bax` file download; it does not write to a user-chosen path on disk.

## Development

From the repository root:

```bash
npm run web-ui:dev      # Vite dev server → http://localhost:5173
npm run web-ui:build    # production build to dist/
npm -w @beatbax/web-ui run test
```

## Architecture

- **UI shell** — vanilla TypeScript + DOM (`src/main.ts`, `src/app/`, `src/ui/`, `src/panels/`)
- **Shared logic** — `@beatbax/app-core` (stores, playback, editor core, parse pipeline)
- **File I/O** — `src/utils/browser-fs.ts` (Vite `fs` alias for legacy path-writing engine helpers; UI exporters prefer returned payloads for downloads)
- **Profile** — `vite.config.ts` sets `__CLIENT_PROFILE__: '"web-lite"'`

Desktop reuses many panel implementations via Vite `@web-ui` aliases in its React shell; web-ui does not import desktop code.

## Related docs

- [Desktop-first client split](../../docs/features/complete/desktop-first-client-split.md)
- [packages/app-core README](../../packages/app-core/README.md)
