# @beatbax/app-core

> Shared application logic for BeatBax web and desktop clients.

**Private workspace package** — not published to npm. Consumed by `apps/web-ui` (web-lite) and `apps/desktop` (desktop-full).

## Overview

`@beatbax/app-core` holds framework-agnostic client logic extracted from the original monolithic web UI:

- **Stores** — editor, playback, channel, settings, theme, chat, UI state
- **Playback** — transport, `PlaybackManager`, audio routing
- **Editor** — Monaco setup, diagnostics, completions; advanced features gated by client profile
- **Export / import** — export manager, drag-drop, import resolver options
- **Plugins** — browser exporter registry and plugin configuration
- **App bootstrap** — `createAppContext()` wires event bus, stores, playback, export, and parse pipeline
- **Client profiles** — `web-lite` vs `desktop-full` capability matrix

Each app may provide a Vite `fs` alias stub for legacy engine imports. **UI exports do not use filesystem capture** — `ExportManager` calls `ExporterPlugin.export()` without `outputPath` and downloads or saves returned payloads (`download-helper.ts`). Desktop uses native save dialogs; web-lite does not expose export UI (use CLI or desktop).

## Client profiles

Build-time profile is set via Vite `define`:

| App | Profile | Capabilities |
|-----|---------|--------------|
| `apps/web-ui` | `web-lite` | Edit, validate, play; no export menu, CoPilot, mixer, pattern grid, or advanced editor |
| `apps/desktop` | `desktop-full` | Full IDE — export, CoPilot, mixer, pattern grid, advanced Monaco, MIDI step entry, native menu |

```typescript
import { getCurrentCapabilities, getClientProfile } from '@beatbax/app-core/client-profile';

const profile = getClientProfile(); // 'web-lite' | 'desktop-full'
const caps = getCurrentCapabilities();
if (caps.export) { /* show export UI */ }
```

## Usage

From a workspace app (development uses source aliases; production uses built `dist/`):

```typescript
import { createAppContext } from '@beatbax/app-core/app/create-app-context';
import { getCurrentCapabilities } from '@beatbax/app-core/client-profile';

const ctx = createAppContext({ /* host-specific options */ });
```

## Scripts

From the repository root:

```bash
npm -w @beatbax/app-core run build   # compile TypeScript
npm -w @beatbax/app-core run test    # Jest unit tests
```

## Related docs

- [Export architecture](../../docs/exports/export-architecture.md) — payload builders and UI/CLI flow
- [Desktop-first client split](../../docs/features/complete/desktop-first-client-split.md) — master plan
- [Electron desktop client](../../docs/features/complete/electron-desktop-client.md) — IPC and packaging
- [apps/web-ui README](../../apps/web-ui/README.md) — web-lite browser client
- [apps/desktop README](../../apps/desktop/README.md) — Electron desktop client
