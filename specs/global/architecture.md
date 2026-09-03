# Architecture and clients

## Pipeline

Parse (Peggy) → AST → expansion / transforms → channel event streams (ISM) → tick scheduler → Web Audio (or export).

`channel N => inst … seq …` assigns patterns/sequences and instruments to a chip channel. Per-item modifiers (for example `:inst(name)`, `:oct(-1)`) apply during expansion.

## Clients

| Package | Profile | Role |
|---------|---------|------|
| `apps/desktop` | `desktop-full` | Primary IDE (Electron). Native I/O, export, Copilot, mixer, pattern grid |
| `apps/web-ui` | `web-lite` | Browser try/edit/play. No export, Copilot, or advanced editor |
| `packages/app-core` | — | Shared stores, playback, editor, export/import, `createAppContext()`, profile gating |
| `packages/engine` | — | Parser, expansion, scheduler, ISM, audio, import/export core |
| `packages/cli` | — | `play`, `verify`, `export`, `inspect`, conversion |

Capability gating: `packages/app-core/src/client-profile.ts`. Do not use Node.js APIs in browser or renderer-unsafe modules.

## MUST

- Keep engine and app-core platform-agnostic except at explicit native bridges (Electron main, CLI).
- Gate desktop-only features with the client profile / feature flags, not by copying logic.

## Pointers

- [DEVNOTES.md](../../DEVNOTES.md)
- Shipped split: [docs/features/complete/desktop-first-client-split.md](../../docs/features/complete/desktop-first-client-split.md)
- Export architecture: [docs/exports/export-architecture.md](../../docs/exports/export-architecture.md)
