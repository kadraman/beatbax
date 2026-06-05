---
"@beatbax/engine": minor
"@beatbax/cli": patch
"@beatbax/plugin-exporter-famitracker": patch
---

Move the NES Ricoh 2A03 APU into `@beatbax/engine` as a built-in chip alongside Game Boy.

### @beatbax/engine

- Register `nesPlugin` automatically via `BUILTIN_CHIP_PLUGINS`; `chip nes` and `chip famicom` work without a separate plugin install.
- Add `@beatbax/engine/chips/nes` package export for NES utilities (period tables, DMC encode/decode, channel backends, validation).
- Move NES implementation and tests from the former standalone plugin into `packages/engine/src/chips/nes/` and `packages/engine/tests/nes/`.
- Parser chip-region diagnostics mention `chip famicom` where relevant.

### @beatbax/cli

- Drop dependency on `@beatbax/plugin-chip-nes`; NES DMC helpers import from `@beatbax/engine/chips/nes`.
- Plugin auto-discovery no longer special-cases the removed NES shim package.

### @beatbax/plugin-exporter-famitracker

- Accept `chip famicom` for FamiTracker Text export via `chipRegistry.resolve()` (not strict `chip === 'nes'`).
- Advertise `famicom` in `supportedChips` and raise minimum `@beatbax/engine` peer dependency to `>=0.18.0`.

### Removed: `@beatbax/plugin-chip-nes`

The standalone NES plugin package has been **removed from the monorepo** (no compatibility shim). Migrate imports:

- `import nesPlugin from '@beatbax/plugin-chip-nes'` → `import { nesPlugin } from '@beatbax/engine/chips'`
- Utility imports → `@beatbax/engine/chips/nes`

After release, run `npm deprecate @beatbax/plugin-chip-nes@"*" "..."` on npm for any previously published versions.
