---
"@beatbax/cli": patch
---

Use engine `writeExportPayload()` when exporter plugins return payloads from the generic `export` command.

- Replace inline `writeFileSync` payload handling with the shared `writeExportPayload()` adapter for `string`, `Uint8Array`, and `ArrayBuffer` returns.
- Preserve existing CLI `beatbax export <format> ...` behavior and error handling for unsupported payload types.
