---
title: "Desktop install for standalone chip plugins"
id: 111
slug: "desktop-user-chip-plugins"
status: "complete"
authors:
  - "kadraman"
created: "2026-11-15"
updated: "2026-11-18"
issue: "https://github.com/kadraman/beatbax/issues/270"
area: "desktop"
related:
  - "specs/complete/037-plugin-system/spec.md"
  - "specs/complete/032-dynamic-chip-loading/spec.md"
  - "specs/complete/005-plugin-starter-template/spec.md"
  - "docs/contributing/creating-plugins.md"
  - "packages/app-core/src/plugins/registry-config.ts"
---

# Feature Specification: Desktop install for standalone chip plugins

## Summary

BeatBax Desktop lets authors **install standalone chip plugins** at runtime from a **local package archive** (`.zip` or `.tgz` / `.tar.gz`, typically from `npm pack` or a GitHub Release asset) without rebuilding the app. Installed plugins live under Desktop `userData`, load into the sandboxed renderer through a privileged scheme that reuses the host `@beatbax/engine`, and appear in Settings → Plugins alongside the pre-bundled catalogue. Desktop does **not** install from the npm registry (publish remains a CLI/`npm install` path). Web-lite stays pre-bundled only. CLI `node_modules` discovery is unchanged. Spec 037 Option B (browser CDN) remains out of scope.

## Problem

1. The CLI auto-discovers `@beatbax/plugin-chip-*` and `beatbax-plugin-chip-*` from `node_modules`, so authors can test the starter template (for example `beatbax-plugin-chip-blip`) with `beatbax list-chips` / `verify` / `play`.
2. Desktop Settings → Plugins only toggles statically imported optional chips (`sms`, `spectrum-128`). There is no install action.
3. The Desktop renderer is sandboxed (`contextIsolation`, no `nodeIntegration`, CSP `script-src 'self' blob:`). A renderer `import()` of an arbitrary folder or of esm.sh cannot succeed.
4. Real plugins import runtime values from `@beatbax/engine`. Loading a second engine copy would break shared registries and AudioContext wiring. Authors still need a Desktop path for local development and for published community packages.

## User scenarios

### User Story 1 — Install a local plugin package archive (Priority: P1)

**Why this priority**: One artifact for local development and GitHub Releases (`npm pack` / release zip), without picking a source tree.

**Independent test**: Build and pack the chip template (`npm run build && npm pack`), use Settings → Plugins → Install from package on the `.tgz` (or a release `.zip` of that package), write `chip blip` (or the plugin’s `name`), and play a short song in Desktop.

**Acceptance scenarios**:

1. **Given** Desktop Settings → Plugins, **When** the user opens the user-plugins section, **Then** they see **Install from package** and a list of already-installed user plugins (empty when none).
2. **Given** a `.zip` or `.tgz` that unpacks to a valid package (`package.json` + built ESM entry) exporting a valid `ChipPlugin`, **When** the user installs from that archive, **Then** Desktop unpacks it into `userData/chip-plugins/` (without keeping a source `node_modules`), records it in a manifest as enabled, reloads, and the chip appears in Settings, New Song chip list, Help, and Instrument Editor contributions for that chip.
3. **Given** a song that uses the installed chip’s `name` (or a registered alias), **When** the user plays or verifies in Desktop, **Then** the chip backend runs with the host engine (single `@beatbax/engine` instance).
4. **Given** the same package name is already installed, **When** the user installs again from an archive, **Then** the previous install is replaced and the app reloads with the new copy.
5. **Given** a source-checkout zip without a built entry (or without `package.json` at the package root / single nested root), **When** install is attempted, **Then** Desktop rejects it with a clear error and does not enable a partial install.

### User Story 2 — Enable, disable, and remove user plugins (Priority: P1)

**Why this priority**: Authors need to iterate and clean up installs without reinstalling the app.

**Independent test**: Install a user plugin, disable it (chip unavailable after reload), enable it again, then remove it (files and manifest entry gone).

**Acceptance scenarios**:

1. **Given** an installed user plugin, **When** the user disables it in Settings, **Then** the manifest marks it disabled, the app reloads, and that chip is not registered (bundled chips unchanged).
2. **Given** a disabled user plugin, **When** the user enables it, **Then** after reload the chip is registered again.
3. **Given** an installed user plugin, **When** the user removes it, **Then** its `userData` directory entry and manifest record are deleted, the app reloads, and the chip is gone from Settings and New Song.
4. **Given** built-in chips (Game Boy, NES) or pre-bundled optional chips (SMS, Spectrum 128), **When** the user views Settings, **Then** those rows remain the existing toggles / built-in labels; they are not presented as removable user installs.

### User Story 3 — Docs for Desktop install (Priority: P2)

**Why this priority**: The starter template and contributing guide must describe the Desktop path once the UI exists.

**Independent test**: Follow the template README Desktop section and the contributing-guide Desktop section without reading this spec.

**Acceptance scenarios**:

1. **Given** this feature has shipped, **When** an author opens the chip starter template `README.md`, **Then** an **Installing into BeatBax Desktop** section covers Install from package (`npm pack` / release zip), states Desktop does not install from the npm registry, and states that CLI and Desktop installs are separate copies.
2. **Given** this feature has shipped, **When** an author opens `docs/contributing/creating-plugins.md`, **Then** a Desktop install section documents the same flows and the package naming / validation expectations.

### Edge cases

- Chip `name` (and aliases) MUST NOT collide with a built-in chip, a bundled optional chip already registered, or another installed user plugin’s chip name. Reinstall of the **same package name** replaces that install; a different package that exports the same chip `name` is rejected.
- `peerDependencies["@beatbax/engine"]` MUST accept the running host engine version; otherwise install fails with a clear message.
- Static import scan rejects `node:`, `fs`, `path`, and any bare specifier other than `@beatbax/engine` (and relative files inside the package). `@beatbax/engine/node` is rejected.
- Optional `exporterPlugins` on an installed chip register through the existing chip-registration path. Standalone exporter packages are out of scope.
- Installing a package is the same trust decision as `npm install` for the CLI: Desktop does not sandbox plugin JS beyond the renderer sandbox.
- A Desktop install does not affect the CLI, and a CLI `node_modules` install does not appear in Desktop.
- Web-lite MUST NOT gain user-plugin install UI or load userData plugins.
- Corrupt or missing on-disk packages listed in the manifest: startup skips them with a diagnostic / Settings warning and continues with the rest.

## Requirements

### Functional requirements

Acquisition

- **FR-001**: Desktop Settings → Plugins MUST provide **Install from package** (file picker for `.zip` and `.tgz` / `.tar.gz` via main process). Desktop MUST NOT offer Install from npm / registry download in Settings.
- **FR-002**: Allowed package names MUST match `@beatbax/plugin-chip-[a-z0-9-]+` or `beatbax-plugin-chip-[a-z0-9-]+`.
- **FR-003**: The main process MUST unpack a validated package into `app.getPath('userData')/chip-plugins/<safe-id>/` and MUST NOT retain a source package’s `node_modules`.
- **FR-005**: A manifest under userData MUST record package name, version, chip name, enabled flag, and install path for each user plugin.
- **FR-006**: Archive install MUST accept npm-pack layout (single top-level folder such as `package/`) and a flat archive with `package.json` at the root; it MUST reject ambiguous multi-package archives.

Loading

- **FR-010**: Before `app.ready`, Desktop MUST register a privileged custom protocol (for example `beatbax-plugin:`) that serves only files under the user chip-plugins directory.
- **FR-011**: Renderer CSP MUST allow that scheme for scripts; the default CSP MUST otherwise remain as restrictive as today for unrelated origins.
- **FR-012**: An import map (or equivalent host bridge) MUST resolve `@beatbax/engine` and its public subpaths used by plugins to the host bundle already loaded by Desktop. A second engine instance MUST NOT be created for user plugins.
- **FR-013**: After `createAppContext()` / `loadPluginsFromStorage()` registers bundled optional chips, Desktop MUST load enabled user plugins and `chipRegistry.register` each default export that is a valid `ChipPlugin`.
- **FR-014**: Validation before enable MUST check: package name pattern, ESM entry exists, default export has `name` string and `createChannel` function, engine peer range compatible, import graph safe (FR scan rules), and chip name / aliases do not collide (except replace of the same package name).

Lifecycle

- **FR-020**: Enable, disable, and remove MUST update the manifest (and on remove, delete the on-disk package) then reload the renderer so `chipRegistry` is rebuilt cleanly.
- **FR-021**: Settings MUST list user plugins separately from Built-in and Optional (pre-bundled) rows, with version, enable toggle, and Remove.
- **FR-022**: Install / load / remove failures MUST surface a user-visible error (Settings or Output) and MUST NOT leave the chip registry in a half-registered state across a successful reload.

Docs

- **FR-030**: When this feature ships, `docs/contributing/creating-plugins.md` MUST document Desktop install from package archive.
- **FR-031**: When this feature ships, the public chip starter template README MUST document **Installing into BeatBax Desktop** (`npm pack` / release zip; no Desktop registry install; CLI vs Desktop as separate copies).

### Non-goals

- Web-lite or browser CDN dynamic plugin loading (spec 037 Option B).
- Standalone exporter plugin install packages.
- Changing CLI discovery, language syntax, AST, ISM, or scheduler semantics.
- Making Desktop read a song project’s `node_modules` for plugins.
- Editing the starter template README in the specification-only PR before Desktop UI exists.
- Installing an unpacked directory via the Settings UI (authors pack first; internal unpack still uses a directory staging path).
- Desktop Install from npm / registry download (authors pack a release artifact; CLI keeps `npm install`).

## Success criteria

- **SC-001**: Installing the packed BLIP starter template (`.tgz` from `npm pack`, or equivalent release `.zip`) makes `chip blip` usable in Desktop New Song and playback without a Desktop rebuild.
- **SC-003**: Rejected packages (bad name, Node imports, peer mismatch, chip name collision, invalid archive) never appear as registered chips after reload.
- **SC-004**: Disable / remove remove the chip from Desktop surfaces after reload; re-enable restores it.
- **SC-005**: Contributing docs and the starter template README describe the Desktop flows once the feature is shipped.

## Assumptions

- Authors run `npm run build` (and pack with `npm pack` or an equivalent release zip of the published files) before Install from package so `dist` (or the package `main` / `exports` entry) exists inside the archive.
- Official chips may still be added to the pre-bundled `AVAILABLE_PLUGINS` catalogue when BeatBax chooses to ship them in-app; this feature does not replace that path.
- The host Desktop engine version is the peer that plugins must satisfy.

## Open questions

- Exact custom-protocol scheme name and CSP wording (implementation detail in plan.md).

## References

- Issue: https://github.com/kadraman/beatbax/issues/270
- Plugin system: specs/complete/037-plugin-system/spec.md
- Dynamic chip loading: specs/complete/032-dynamic-chip-loading/spec.md
- Starter template: specs/complete/005-plugin-starter-template/spec.md
