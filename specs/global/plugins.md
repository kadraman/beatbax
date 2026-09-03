# Chip and exporter plugins

## MUST

- Keep **core independent of plugins**; plugins depend on core.
- Load plugins dynamically; they MUST be optional, discoverable, and side-effect free on import.
- Chip plugins: isolated audio backends only.
- Export plugins: consume **validated ISM only**; fail loudly on unsupported features.
- Validate unsupported chip or export features explicitly.

## MUST NOT

- Change core AST, scheduler, or ISM semantics from a plugin.
- Add scheduler hooks for a single plugin.
- Patch or extend core AST from a plugin.
- Assume a fixed set of chips or exporters in core.
- Assume undocumented timing guarantees.

## Pointers

- Chip plugin spec (shipped): [docs/features/complete/plugin-system.md](../../docs/features/complete/plugin-system.md)
- Exporter plugin spec (shipped): [docs/features/complete/exporter_plugin_system.md](../../docs/features/complete/exporter_plugin_system.md)
- Authoring guide: [docs/contributing/creating-plugins.md](../../docs/contributing/creating-plugins.md)
- Dynamic loading (shipped): [docs/features/complete/dynamic-chip-loading.md](../../docs/features/complete/dynamic-chip-loading.md)
