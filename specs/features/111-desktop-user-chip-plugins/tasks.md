# Tasks: Desktop install for standalone chip plugins

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn [P?] [USn?] Description` with **exact repo paths**.

- **[P]**: can run in parallel (different files, no shared-write dependency)
- **[USn]**: maps to a user story in spec.md

## Phase 0: Foundation (blocks stories)

- [ ] T001 Add package-name / peer / import-scan / ChipPlugin-shape validators (prefer a pure module under `apps/desktop/src/main/` or `packages/app-core/src/plugins/` if reuse is clean) with Jest coverage for FR-002 and FR-014.
- [ ] T002 Define manifest schema and read/write helpers for `userData/chip-plugins` + `chip-plugins-manifest.json` under `apps/desktop/src/main/` (list, upsert, set-enabled, remove + delete directory; never copy source `node_modules`).
- [ ] T003 Register privileged `beatbax-plugin:` (or chosen) protocol in `apps/desktop/src/main/index.ts` before `app.ready`; path-traversal-safe serve from chip-plugins root only.
- [ ] T004 [P] Extend `apps/desktop/src/shared/ipc.ts`, `apps/desktop/src/shared/electron-api.ts`, and `apps/desktop/src/preload/index.ts` with list / install-folder / install-npm / set-enabled / remove APIs.

**Checkpoint**: validators + manifest + protocol + IPC types exist; unit tests green for validators/manifest.

## Phase 1: User Story 1 — Install from folder (P1)

- [ ] T010 [US1] Implement main-process Install from folder in `apps/desktop/src/main/ipc-handlers.ts` (directory dialog, validate, copy into `userData/chip-plugins/`, update manifest, signal reload).
- [ ] T011 [US1] Add host `@beatbax/engine` bridge + import map wiring under `apps/desktop/src/renderer/src/`; update CSP in `apps/desktop/src/renderer/index.html` for the plugin scheme (`script-src`).
- [ ] T012 [US1] After `createAppContext()` in `apps/desktop/src/renderer/src/App.tsx` (or desktop startup), load enabled user plugins via the protocol and `chipRegistry.register`; surface load failures without aborting startup.
- [ ] T013 [US1] Extend `apps/desktop/src/renderer/src/components/settings/plugins.tsx` with Install from folder and a User plugins list (version, enable, Remove stub wired in later stories as needed for replace).
- [ ] T014 [US1] Tests: folder install copies without `node_modules`; replace same package name; invalid folder rejected (`apps/desktop/tests/`).

**Checkpoint**: built BLIP template folder installs and `chip blip` plays in Desktop (SC-001).

## Phase 2: User Story 2 — Install from npm (P1)

- [ ] T020 [US2] Implement main-process npm tarball download + unpack in `apps/desktop/src/main/` (FR-004); reuse folder validation/storage path.
- [ ] T021 [US2] Add Install from npm UI (name + optional version) in `apps/desktop/src/renderer/src/components/settings/plugins.tsx`; reject disallowed names before invoke when possible.
- [ ] T022 [US2] Tests for name guard before fetch, failed download cleanup, and successful install updating the manifest (`apps/desktop/tests/`).

**Checkpoint**: published allowed package name installs and registers after reload (SC-002).

## Phase 3: User Story 3 — Enable, disable, remove (P1)

- [ ] T030 [US3] Wire enable / disable toggles to manifest + reload in Settings (`apps/desktop/src/renderer/src/components/settings/plugins.tsx` + IPC).
- [ ] T031 [US3] Wire Remove to delete on-disk package + manifest entry + reload.
- [ ] T032 [US3] Ensure Built-in and Optional (pre-bundled) rows in `plugins.tsx` stay distinct from User plugins; collision rules reject chip names that match built-ins / `AVAILABLE_PLUGINS` / other user chips.
- [ ] T033 [US3] Tests for disable (not loaded), enable, remove (disk + manifest), and collision rejection (SC-003, SC-004).

**Checkpoint**: lifecycle flows work without touching bundled catalogue behaviour.

## Phase 4: User Story 4 — Docs (P2)

- [ ] T040 [US4] Add Desktop install section to `docs/contributing/creating-plugins.md` (folder + npm, trust model, peer dependency, CLI vs Desktop separate copies).
- [ ] T041 [US4] In the external repo `beatbax-plugin-chip-template`, update `README.md`: replace the Desktop limitation note under Installing into the BeatBax CLI with **Installing into BeatBax Desktop** (Install from folder after `npm run build`; Install from npm by package name; CLI and Desktop are separate copies). Keep existing CLI `npm link` / path / publish steps.
- [ ] T042 [US4] Manual QA checklist: follow template README against a Desktop build that includes this feature (SC-005).

**Checkpoint**: docs match shipped Settings actions; template README no longer claims Desktop cannot install plugins.

## Polish

- [ ] T900 [P] Add or extend Desktop QA notes (for example `docs/qa/desktop-release-qa.md`) for user chip plugin install smoke.
- [ ] T901 Confirm web-lite path still only uses `packages/app-core/src/plugins/registry-config.ts` pre-bundled catalogue (no user install).
- [ ] T902 Move this folder to `specs/complete/111-desktop-user-chip-plugins/` and update `specs/STATUS.md` when shipped.
