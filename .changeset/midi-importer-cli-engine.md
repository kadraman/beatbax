---
"@beatbax/engine": minor
"@beatbax/cli": minor
---

Add CLI MIDI → .bax import (`beatbax import midi` / `convert midi2bax`) for Game Boy and NES.

**Engine**

- Convert SMF (format 0/1) via `@tonejs/midi`: quantize, GM family kits, track/role packing with `inst()` multiplex, bar reuse / `*N` compression, and optional NES DMC kick/snare reinforcement.
- Optional `--config` JSON for `trackMappings`, `programFamilies` / `families`, quantize, `drumFlamTicks`, and `sectionBars` (default 8 Pattern Grid sections; `0` = monolithic).
- Per-note MIDI channel resolution (format-0 multi-channel), drum-map-aware DMC reinforcement, and validated config/CLI integers (e.g. reject fractional `--section-bars`).
- Align MIDI export GM program defaults and the Game Boy new-song kit with importer round-trip heuristics.

**CLI**

- Wire `import midi` / `convert midi2bax` with `--chip`, `--config`, quantize/grid, overlap, `--section-bars`, `--dry-run`, `--strict`, and `--title`.
