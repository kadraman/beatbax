# Tasks: Standalone cross-platform BeatBax CLI executable

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn [P?] [USn?] Description` with **exact repo paths**.

- **[P]**: can run in parallel (different files, no shared-write dependency)
- **[USn]**: maps to a user story in spec.md

## Phase 0: Foundation (blocks stories)

- [ ] T001 Spike Node SEA packaging for `packages/cli` ESM entry plus dynamic plugin imports and optional `speaker` on one OS; document pass/fail. If SEA fails, choose embedded-Node zip and add `specs/features/106-cli-standalone-executable/research.md` with the decision.
- [ ] T002 Add packaging scripts under `packages/cli/scripts/` (or `scripts/`) that produce platform artifacts named per FR-006 / FR-007, bundling `@beatbax/cli` dependencies including `packages/engine`, `packages/plugins/chip-sms`, `packages/plugins/export-famitracker`, and `packages/plugins/export-vgm`.
- [ ] T003 Inject dual `--version` output (Desktop release version from `apps/desktop/package.json`, then `@beatbax/cli` version from `packages/cli/package.json`) for packaged builds in `packages/cli/src/cli.ts` (or a small helper module under `packages/cli/src/`).
- [ ] T004 [P] Unit tests in `packages/cli/` for version formatting and for bundled chip/exporter availability without a host project `node_modules`.

**Checkpoint**: local packaging script produces a runnable artifact on the developer OS; `--version` shows both lines; bundled plugins resolve.

## Phase 1: User Story 1 — Stable assets on `desktop-v*` (P1)

- [ ] T010 [US1] Extend `.github/workflows/desktop-build.yaml` (or a sibling workflow triggered by `desktop-v*`) to build CLI assets for win-x64, mac-arm64, and linux-amd64 from the tagged commit after Desktop installers exist.
- [ ] T011 [US1] Upload stable CLI assets to the same GitHub Release as the `desktop-v*` tag; regenerate `SHA256SUMS` to include Desktop installers and CLI files; apply optional GPG when Desktop secrets are present.
- [ ] T012 [US1] Apply Desktop-aligned signing: macOS Developer ID + notarize when Apple secrets exist; Windows unsigned; document SmartScreen in release notes.
- [ ] T013 [US1] Update the `desktop-v*` release body / notes path (for example `apps/desktop/build/release-notes.body.txt` merge or publish script) so CLI assets are named and “no Node required” is stated.
- [ ] T014 [US1] CI smoke on the stable matrix: run the built executable `--version` and `verify` (or `export`) against a fixture under `songs/`.

**Checkpoint**: a dry-run or tagged pipeline attaches CLI assets and checksums to a `desktop-v*` release.

## Phase 2: User Story 2 — Rolling `cli-dev` (P1)

- [ ] T020 [US2] Add `.github/workflows/` job(s) that on qualifying `main` path filters (`packages/cli/**`, `packages/engine/**`, `packages/plugins/chip-sms/**`, `packages/plugins/export-famitracker/**`, `packages/plugins/export-vgm/**`, the CLI packaging workflow, and lockfile policy per OQ-2) package all three OS targets and replace the `cli-dev` pre-release in place (`prerelease: true`, not Latest).
- [ ] T021 [US2] Set Development artifact names to `beatbax-dev-*` and embedded version to `<desktopVersion>-dev.<shortsha>` from `apps/desktop/package.json`.
- [ ] T022 [US2] Skip `cli-dev` publish when the commit is already tagged `desktop-v*`; generate release notes since the previous `desktop-v*` tag; publish `SHA256SUMS` (+ optional GPG).
- [ ] T023 [US2] CI smoke for `cli-dev` artifacts: `--version` and one real command without relying on a host Node install in the smoke step beyond invoking the packaged binary.

**Checkpoint**: a path-filtered `main` push updates https://github.com/kadraman/beatbax/releases/tag/cli-dev.

## Phase 3: User Story 3 — Parity and play fallbacks (P1)

- [ ] T030 [US3] Assert packaged `--help` lists the same top-level commands as `packages/cli/src/cli.ts` at that commit; assert `list-chips` / `list-exporters` include the bundled set without host `node_modules`.
- [ ] T031 [US3] Confirm cwd `node_modules` discovery in `packages/cli/src/cli.ts` still loads extra plugins when present (test or documented manual check).
- [ ] T032 [US3] Decide and document `speaker` inclusion for packaged `play` in release notes / `packages/cli/README.md`; keep engine fallback order in `packages/engine/src/node/nodeAudioPlayer.ts`.

**Checkpoint**: parity checklist green; play policy documented.

## Polish

- [ ] T900 [P] Update `docs/release/releasing.md` with CLI executable channels (`desktop-v*` assets + `cli-dev`), artifact table, version vs npm, and Immutable Releases note.
- [ ] T901 [P] Update `packages/cli/README.md` with download instructions for stable and Development executables.
- [ ] T902 [P] Add `docs/qa/cli-executable-release-qa.md` checklist for first stable ship.
- [ ] T903 Move this folder to `specs/complete/106-cli-standalone-executable/` and update `specs/STATUS.md` when shipped.
