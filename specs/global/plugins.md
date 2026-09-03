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

- Chip plugin spec (shipped): [specs/complete/037-plugin-system/spec.md](../complete/037-plugin-system/spec.md)
- Exporter plugin spec (shipped): [specs/complete/026-exporter_plugin_system/spec.md](../complete/026-exporter_plugin_system/spec.md)
- Authoring guide: [docs/contributing/creating-plugins.md](../../docs/contributing/creating-plugins.md)
- Dynamic loading (shipped): [specs/complete/032-dynamic-chip-loading/spec.md](../complete/032-dynamic-chip-loading/spec.md)
