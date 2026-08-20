# Release notes: payload-first export (workspace packages)

These packages are listed in `.changeset/config.json` `ignore` and are not versioned on npm. They ship with the monorepo apps only.

## @beatbax/app-core

- Route all built-in exports (JSON, MIDI, UGE, WAV) through `ExportManager.exportViaPlugin()`; remove per-format special cases and `midi-builder.ts`.
- Wire `browser-exporter-registry` to engine built-in exporter plugins instead of stub throwers.
- Make `downloadBinary` / `downloadText` async; await desktop `electronAPI.saveFile()` before emitting `export:success`; emit `export:cancelled` when the save dialog is dismissed.
- Pass format-specific `extension` to the desktop save dialog; fix `ensureExtension()` to replace existing extensions (e.g. `.bax` → `.vgm`).
- Remove unused `write-capture.ts`; add Jest mock for `@beatbax/engine/export`.
- Add `export-manager.test.ts` and extend `download-helper.test.ts`.

## @beatbax/desktop

- Add format-specific file filters and default extension to IPC `saveFile` for exports.
- Show Output panel on successful export; keep Problems panel for export warnings.
- Pass `showOutput` from `desktop-workspace` into `export-handler`.

## @beatbax/web-ui

- Simplify `browser-fs.ts` to a minimal `fs` alias stub (no write-capture); UI exports use payload-returning plugins only.
- Show Output panel on successful export in `main.ts`.

## Related changesets

- `.changeset/payload-first-export-engine.md` — `@beatbax/engine` (minor)
- `.changeset/payload-first-export-cli.md` — `@beatbax/cli` (patch)

See also [Exporter buffer return cleanup](../features/exporter-buffer-return-cleanup.md).
