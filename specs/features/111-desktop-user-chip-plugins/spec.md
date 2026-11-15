---
title: "Desktop install for standalone chip plugins"
id: 111
slug: "desktop-user-chip-plugins"
status: "planned"
authors:
  - "kadraman"
created: "2026-11-15"
updated: "2026-11-15"
issue: "https://github.com/kadraman/beatbax/issues/270"
area: "desktop"
related:
  - "specs/complete/037-plugin-system/spec.md"
  - "specs/complete/032-dynamic-chip-loading/spec.md"
  - "specs/features/005-plugin-starter-template/spec.md"
  - "docs/contributing/creating-plugins.md"
  - "packages/app-core/src/plugins/registry-config.ts"
---

# Feature Specification: Desktop install for standalone chip plugins

## Summary

BeatBax Desktop lets authors **install standalone chip plugins** at runtime — from a **local built package folder** or by **npm package name** — without rebuilding the app. Installed plugins live under Desktop `userData`, load into the sandboxed renderer through a privileged scheme that reuses the host `@beatbax/engine`, and appear in Settings → Plugins alongside the pre-bundled catalogue. Web-lite stays pre-bundled only. CLI `node_modules` discovery is unchanged. Spec 037 Option B (browser CDN) remains out of scope.

## Problem

1. The CLI auto-discovers `@beatbax/plugin-chip-*` and `beatbax-plugin-chip-*` from `node_modules`, so authors can test the starter template (for example `beatbax-plugin-chip-blip`) with `beatbax list-chips` / `verify` / `play`.
2. Desktop Settings → Plugins only toggles statically imported optional chips (`sms`, `spectrum-128`). There is no install action.
3. The Desktop renderer is sandboxed (`contextIsolation`, no `nodeIntegration`, CSP `script-src 'self' blob:`). A renderer `import()` of an arbitrary folder or of esm.sh cannot succeed.
4. Real plugins import runtime values from `@beatbax/engine`. Loading a second engine copy would break shared registries and AudioContext wiring. Authors still need a Desktop path for local development and for published community packages.

## User scenarios

### User Story 1 — Install a built local plugin folder (Priority: P1)

**Why this priority**: This is the starter-template developer loop after `npm run build`.

**Independent test**: Build the chip template package, use Settings → Plugins → Install from folder on that package directory, write `chip blip` (or the plugin’s `name`), and play a short song in Desktop.

**Acceptance scenarios**:

1. **Given** Desktop Settings → Plugins, **When** the user opens the user-plugins section, **Then** they see **Install from folder** and a list of already-installed user plugins (empty when none).
2. **Given** a package directory with valid `package.json` and a built ESM entry (`exports["."].import` or `main`) that exports a valid `ChipPlugin`, **When** the user installs from that folder, **Then** Desktop copies the package into `userData/chip-plugins/` (without copying that package’s `node_modules`), records it in a manifest as enabled, reloads, and the chip appears in Settings, New Song chip list, Help, and Instrument Editor contributions for that chip.
3. **Given** a song that uses the installed chip’s `name` (or a registered alias), **When** the user plays or verifies in Desktop, **Then** the chip backend runs with the host engine (single `@beatbax/engine` instance).
4. **Given** the same package name is already installed, **When** the user installs again from a folder, **Then** the previous install is replaced and the app reloads with the new copy.

### User Story 2 — Install a published npm chip package (Priority: P1)

**Why this priority**: Published community / official plugins must work without a local clone.

**Independent test**: From Settings → Plugins, enter a published `@beatbax/plugin-chip-*` or `beatbax-plugin-chip-*` name, install, and confirm the chip registers after reload.

**Acceptance scenarios**:

1. **Given** Settings → Plugins, **When** the user enters an allowed package name (optional version) and chooses Install from npm, **Then** the main process downloads the npm tarball, unpacks it into `userData/chip-plugins/`, validates it the same way as a folder install, enables it, and reloads.
2. **Given** a package name that is not `@beatbax/plugin-chip-*` or `beatbax-plugin-chip-*`, **When** Install from npm is attempted, **Then** Desktop rejects it before any network request and shows a clear error.
3. **Given** network or registry failure, or a tarball that fails validation, **When** install is attempted, **Then** no partial install remains enabled and the user sees an actionable error.

### User Story 3 — Enable, disable, and remove user plugins (Priority: P1)

**Why this priority**: Authors need to iterate and clean up installs without reinstalling the app.

**Independent test**: Install a user plugin, disable it (chip unavailable after reload), enable it again, then remove it (files and manifest entry gone).

**Acceptance scenarios**:

1. **Given** an installed user plugin, **When** the user disables it in Settings, **Then** the manifest marks it disabled, the app reloads, and that chip is not registered (bundled chips unchanged).
2. **Given** a disabled user plugin, **When** the user enables it, **Then** after reload the chip is registered again.
3. **Given** an installed user plugin, **When** the user removes it, **Then** its `userData` directory entry and manifest record are deleted, the app reloads, and the chip is gone from Settings and New Song.
4. **Given** built-in chips (Game Boy, NES) or pre-bundled optional chips (SMS, Spectrum 128), **When** the user views Settings, **Then** those rows remain the existing toggles / built-in labels; they are not presented as removable user installs.

### User Story 4 — Docs for Desktop install (Priority: P2)

**Why this priority**: The starter template and contributing guide must describe the Desktop path once the UI exists.

**Independent test**: Follow the template README Desktop section and the contributing-guide Desktop section without reading this spec.

**Acceptance scenarios**:

1. **Given** this feature has shipped, **When** an author opens the chip starter template `README.md`, **Then** the old “Desktop does not install plugins via npm” note is replaced by an **Installing into BeatBax Desktop** section covering Install from folder (after `npm run build`) and Install from npm, and stating that CLI and Desktop installs are separate copies.
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

- **FR-001**: Desktop Settings → Plugins MUST provide **Install from folder** (directory picker via main process) and **Install from npm** (package name + optional version).
- **FR-002**: Allowed package names MUST match `@beatbax/plugin-chip-[a-z0-9-]+` or `beatbax-plugin-chip-[a-z0-9-]+`.
- **FR-003**: The main process MUST copy a validated package into `app.getPath('userData')/chip-plugins/<safe-id>/` and MUST NOT copy the source package’s `node_modules`.
- **FR-004**: Install from npm MUST download the package tarball from the npm registry in the main process (no npm CLI, no esm.sh) and then follow the same validation and storage path as a folder install.
- **FR-005**: A manifest under userData MUST record package name, version, chip name, enabled flag, and install path for each user plugin.

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

- **FR-030**: When this feature ships, `docs/contributing/creating-plugins.md` MUST document Desktop install (folder and npm).
- **FR-031**: When this feature ships, the public chip starter template README MUST replace the Desktop limitation note with **Installing into BeatBax Desktop** steps (folder after build; npm by package name; CLI vs Desktop as separate copies). That README change lands with implementation, not before the Settings actions exist.

### Non-goals

- Web-lite or browser CDN dynamic plugin loading (spec 037 Option B).
- Standalone exporter plugin install packages.
- Changing CLI discovery, language syntax, AST, ISM, or scheduler semantics.
- Making Desktop read a song project’s `node_modules` for plugins.
- Editing the starter template README in the specification-only PR before Desktop UI exists.

## Success criteria

- **SC-001**: Installing the built BLIP starter template from a local folder makes `chip blip` usable in Desktop New Song and playback without a Desktop rebuild.
- **SC-002**: Installing a published allowed npm chip package name registers that chip after reload.
- **SC-003**: Rejected packages (bad name, Node imports, peer mismatch, chip name collision) never appear as registered chips after reload.
- **SC-004**: Disable / remove remove the chip from Desktop surfaces after reload; re-enable restores it.
- **SC-005**: Contributing docs and the starter template README describe the Desktop flows once the feature is shipped.

## Assumptions

- Authors run `npm run build` before Install from folder so `dist` (or the package `main` / `exports` entry) exists.
- Official chips may still be added to the pre-bundled `AVAILABLE_PLUGINS` catalogue when BeatBax chooses to ship them in-app; this feature does not replace that path.
- The host Desktop engine version is the peer that plugins must satisfy.

## Open questions

- Exact custom-protocol scheme name and CSP wording (implementation detail in plan.md).
- Whether optional version pin UI for npm install is a text field (`@1.2.3`) or a separate control — either is acceptable if FR-004 is met.

## References

- Issue: https://github.com/kadraman/beatbax/issues/270
- Starter template: https://github.com/kadraman/beatbax-plugin-chip-template
- CLI discovery: `packages/cli/src/cli.ts` (`discoverPlugins`)
- Bundled catalogue: `packages/app-core/src/plugins/registry-config.ts`
- Constitution § V Plugin Isolation: `specs/constitution.md`
