---
title: "Standalone cross-platform BeatBax CLI executable"
id: 106
slug: "cli-standalone-executable"
status: "planned"
authors:
  - "kadraman"
created: "2026-11-06"
updated: "2026-11-06"
issue: "https://github.com/kadraman/beatbax/issues/244"
area: "cli"
related:
  - "docs/release/releasing.md"
  - "packages/cli/README.md"
  - "docs/release/desktop-release-checksums.md"
  - "specs/complete/041-playback-via-cli/spec.md"
  - "specs/complete/031-cli-audio-export/spec.md"
---

# Feature Specification: Standalone cross-platform BeatBax CLI executable

## Summary

BeatBax ships **per-OS CLI executables** that run without a user-installed Node.js, npm, or npx. The release **version matches BeatBax Desktop** (for example `0.4.0`), not the npm `@beatbax/cli` package version. **Stable** CLI assets are attached to the existing `desktop-vX.Y.Z` GitHub Release alongside Desktop installers. **Development** uses a separate rolling pre-release on tag `cli-dev`. npm publishing of `@beatbax/cli` continues unchanged. No new CLI commands or language behavior.

## Problem

1. Authors who only need the CLI (CI, scripting, export, verify, headless play) must install Node and use `npm install -g` or `npx`.
2. Desktop already offers versioned downloads on GitHub Releases (`desktop-v*` / `desktop-dev`) without npm; the CLI has no equivalent download path.
3. The npm package version (`@beatbax/cli`) and Desktop app version diverge; users comparing Desktop and CLI downloads need a shared product version for stable releases.

## User scenarios

### User Story 1 — Download and run a stable CLI without Node (Priority: P1)

**Why this priority**: Stable release downloads are the primary distribution ask; Development builds on the same packaging.

**Independent test**: From a `desktop-vX.Y.Z` GitHub Release, download the CLI asset for the current OS, run it on a machine (or container) without Node installed, and confirm `--version` plus one real command succeed.

**Acceptance scenarios**:

1. **Given** a published `desktop-vX.Y.Z` GitHub Release, **When** a user opens that release page, **Then** CLI assets for Windows x64, macOS arm64, and Linux amd64 are listed alongside Desktop installers.
2. **Given** a downloaded stable CLI asset for that OS, **When** the user runs `beatbax --version` (or the platform equivalent) with no Node/npm/npx on `PATH`, **Then** the first line is the Desktop product version for that tag (for example `0.4.0`) and a second line identifies the embedded `@beatbax/cli` package version.
3. **Given** that same executable and a valid `.bax` file, **When** the user runs `verify`, `export`, or `play`, **Then** the command behaves as the npm CLI at that commit for the same inputs (subject to the play audio fallback rules in this spec).
4. **Given** the stable release `SHA256SUMS`, **When** the user verifies a CLI asset hash, **Then** that file is listed with the Desktop installer checksums for the same release.

### User Story 2 — Rolling CLI Development pre-release (Priority: P1)

**Why this priority**: Authors and CI need current CLI binaries without waiting for a Desktop stable tag, and without forcing every engine/CLI change through the full Desktop path filter.

**Independent test**: After a qualifying `main` push that touches CLI, engine, or bundled-plugin paths, open the `cli-dev` pre-release, download a `beatbax-dev-*` asset, and run `--version` without Node.

**Acceptance scenarios**:

1. **Given** a push to `main` that changes `packages/cli/**`, `packages/engine/**`, a bundled CLI plugin package, the CLI packaging workflow, or a lockfile change that affects those packages, **When** CI completes, **Then** the `cli-dev` pre-release is replaced in place with new assets (prerelease, not GitHub Latest).
2. **Given** a `cli-dev` download, **When** the user runs `--version`, **Then** the release version is `<desktopVersion>-dev.<shortsha>` using the Desktop `package.json` version from that commit.
3. **Given** Development download names, **When** successive `cli-dev` publishes occur, **Then** artifact names stay stable (`beatbax-dev-win-x64.exe`, `beatbax-dev-mac-arm64.zip`, `beatbax-dev-linux-amd64`).
4. **Given** a commit already tagged `desktop-v*`, **When** that commit is processed, **Then** it does not also publish `cli-dev` for that commit.
5. **Given** `cli-dev` release notes, **When** they are generated, **Then** they list changes since the previous `desktop-v*` tag, not since the previous `cli-dev` pointer.

### User Story 3 — Command and plugin parity with npm CLI (Priority: P1)

**Why this priority**: A downloadable CLI that omits commands or built-in plugins would surprise users moving from `npx @beatbax/cli`.

**Independent test**: On a packaged executable, `list-chips` / `list-exporters` show the same bundled set as a global install of `@beatbax/cli` at that commit, and each documented top-level command is present in `--help`.

**Acceptance scenarios**:

1. **Given** the packaged CLI at a commit, **When** the user runs `--help`, **Then** the same top-level commands exist as `@beatbax/cli` at that commit (`play`, `verify`, `export`, `inspect`, `extract`, `convert`, `import`, `wav2dmc`, `list-chips`, `list-exporters`).
2. **Given** a packaged CLI with no project `node_modules`, **When** the user lists chips and exporters, **Then** engine built-ins plus `@beatbax/plugin-chip-sms`, `@beatbax/plugin-exporter-famitracker`, and `@beatbax/plugin-exporter-vgm` are available (matching `@beatbax/cli` dependencies at that commit).
3. **Given** a project directory that has additional discoverable chip or exporter plugins in `node_modules`, **When** the packaged CLI runs from that cwd, **Then** existing discovery still loads those extra plugins.
4. **Given** Spectrum / Arkos plugins that are not `@beatbax/cli` dependencies, **When** the packaged CLI ships, **Then** they are not bundled solely for this feature.

### Edge cases

- What happens when macOS Gatekeeper warns on an unsigned build because Apple secrets were absent in CI? The release notes document the Desktop-aligned signing policy; when secrets are present, macOS CLI assets are Developer ID signed and notarized.
- What happens when Windows SmartScreen warns on the unsigned `.exe`? Behavior matches Desktop unsigned Windows policy; the release notes point users at the same workaround pattern.
- What happens when `play` cannot load the optional native `speaker` addon inside the package? Playback falls through to `play-sound` then a system audio player, as today; release notes state whether `speaker` is included.
- What happens when a user still prefers npm? `npm install -g @beatbax/cli` and Changesets publishing remain available; executable and npm versions may differ.

## Requirements

### Functional requirements

- **FR-001**: System MUST publish per-OS CLI downloads that run without a user-installed Node.js, npm, or npx.
- **FR-002**: Stable CLI assets MUST be attached to the existing `desktop-vX.Y.Z` GitHub Release for the tagged commit. The project MUST NOT create a separate `cli-v*` stable tag or a second stable GitHub Release for the CLI.
- **FR-003**: The stable CLI release version string MUST equal the Desktop app version on that commit (`apps/desktop/package.json`).
- **FR-004**: Development MUST use tag `cli-dev` as a rolling pre-release (`prerelease: true`, not GitHub Latest), deleted and recreated on each qualifying publish, with the same Immutable Releases constraint as `desktop-dev`.
- **FR-005**: Development embedded version MUST be `<desktopVersion>-dev.<shortsha>` from that commit’s Desktop `package.json` version.
- **FR-006**: Development download names MUST remain `beatbax-dev-win-x64.exe`, `beatbax-dev-mac-arm64.zip`, and `beatbax-dev-linux-amd64`.
- **FR-007**: Stable download names MUST be `beatbax-<version>-win-x64.exe`, `beatbax-<version>-mac-arm64.zip`, and `beatbax-<version>-linux-amd64`.
- **FR-008**: OS/arch coverage MUST match current Desktop coverage: Windows x64, macOS arm64, Linux amd64. Intel macOS and Linux arm64 MUST NOT be required until Desktop ships those.
- **FR-009**: macOS MUST ship as a zip containing the executable (to support the same notarization path as Desktop’s macOS `.zip` artifact).
- **FR-010**: `cli-dev` MUST publish when `main` changes `packages/cli/**`, `packages/engine/**`, bundled plugin packages (`packages/plugins/chip-sms`, `packages/plugins/export-famitracker`, `packages/plugins/export-vgm`), the CLI packaging workflow, or lockfile changes that affect those packages. The Desktop path filter MUST NOT be required for `cli-dev`.
- **FR-011**: A commit already tagged `desktop-v*` MUST NOT also publish `cli-dev`.
- **FR-012**: `cli-dev` release notes MUST compare against the previous `desktop-v*` tag, not the previous `cli-dev` pointer.
- **FR-013**: `beatbax --version` on a packaged executable MUST print the release version on the first line and the embedded `@beatbax/cli` package version on a second line.
- **FR-014**: Packaged CLI commands MUST match `@beatbax/cli` at that commit; this feature MUST NOT add or remove user-facing command behavior or invent language syntax.
- **FR-015**: Bundled plugins MUST equal a global npm install of `@beatbax/cli` at that commit (engine built-ins plus SMS chip, Famitracker exporter, VGM exporter). Spectrum and Arkos MUST stay out until they are CLI dependencies.
- **FR-016**: Existing cwd / `node_modules` plugin discovery MUST continue to load additional plugins when present.
- **FR-017**: `play` MUST keep the engine audio fallback order (`speaker` → `play-sound` → system player). The optional native `speaker` addon MUST be included only if the packager can do so without requiring a user Node install; otherwise later fallbacks are acceptable and release notes MUST say so.
- **FR-018**: `cli-dev` MUST publish `SHA256SUMS`. On `desktop-v*`, the release `SHA256SUMS` MUST include both Desktop installers and CLI assets (hashing after both sets exist). Optional GPG detach-sign MUST follow the same secrets policy as Desktop.
- **FR-019**: Signing policy MUST match Desktop: macOS Developer ID + notarize when Apple secrets exist; Windows unsigned; Linux integrity via checksums / optional GPG.
- **FR-020**: The `desktop-v*` release body MUST name the CLI assets and state that they do not require Node.
- **FR-021**: npm publish of `@beatbax/cli` via Changesets MUST continue; the executable channel MUST NOT replace it.

### Non-goals

- Replacing or retiring npm distribution of `@beatbax/cli`
- itch.io distribution for the CLI
- Auto-update for the CLI
- A separate `cli-v*` stable tag or GitHub Release
- New CLI commands, flags, or language features
- Bundling plugins that are not `@beatbax/cli` dependencies at that commit
- Windows Authenticode signing
- Expanding OS/arch matrix beyond current Desktop coverage

## Success criteria

- **SC-001**: A user without Node can download the CLI from a `desktop-v*` release and from `cli-dev`, run `--version`, and successfully run `verify` or `export` on a sample song on Windows x64, macOS arm64, and Linux amd64.
- **SC-002**: Stable CLI version on a `desktop-vX.Y.Z` release equals Desktop `X.Y.Z` for that tag.
- **SC-003**: `cli-dev` updates on qualifying `main` pushes and never becomes GitHub Latest.
- **SC-004**: Checksums cover CLI assets; macOS signing/notarization occurs when Desktop’s Apple secrets are present.
- **SC-005**: npm `@beatbax/cli` remains installable and independently versioned.

## Assumptions

- Desktop continues to use annotated tags `desktop-v*` for stable and `desktop-dev` for rolling Development.
- Repository Immutable Releases remain off so rolling pre-releases can replace assets.
- `@beatbax/cli` dependency set at ship time defines the bundled plugin set; adding Spectrum/Arkos later is a dependency change, not this feature’s non-goal.

## Open questions

- **OQ-1**: If Node SEA cannot package the ESM graph or dynamic plugin imports, is an embedded-Node zip (still no user-installed Node) acceptable? Proposed: yes; record the choice in `research.md` during implementation if SEA is rejected.
- **OQ-2**: Should `cli-dev` path filters include `package-lock.json` always, or only when a lockfile diff touches the listed packages? Proposed: include lockfile changes that affect those packages (implementation may use a broad `package-lock.json` trigger if fine-grained detection is unreliable).

## References

- [docs/release/releasing.md](../../../docs/release/releasing.md)
- [packages/cli/README.md](../../../packages/cli/README.md)
- [docs/release/desktop-release-checksums.md](../../../docs/release/desktop-release-checksums.md)
- [specs/complete/041-playback-via-cli/spec.md](../../complete/041-playback-via-cli/spec.md)
- [specs/complete/031-cli-audio-export/spec.md](../../complete/031-cli-audio-export/spec.md)
- GitHub issue: https://github.com/kadraman/beatbax/issues/244
