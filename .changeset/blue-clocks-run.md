---
"@beatbax/cli": minor
---

The CLI now auto-discovers and registers `@beatbax/plugin-chip-*` and `beatbax-plugin-chip-*` npm packages at startup. Added a `list-chips` command to list all available chip backends (built-in and plugin-discovered), with a `--json` flag for machine-readable output.
