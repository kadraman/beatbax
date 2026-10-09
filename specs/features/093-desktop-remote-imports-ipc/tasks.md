# Tasks: Desktop remote instrument imports through main-process IPC

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn [P?] [USn?] Description` with **exact repo paths**.

- **[P]**: can run in parallel (different files, no shared-write dependency)
- **[USn]**: maps to a user story in spec.md

## Phase 0: Foundation (blocks stories)

- [ ] T001 New `packages/app-core/src/import/desktop-remote-fetch.ts`: `createDesktopRemoteFetch(api)` (`typeof fetch` adapter over `fetchRemoteAsset`, payload conversion, error passthrough, abort signal); tests in `packages/app-core/tests/desktop-remote-fetch.test.ts`

**Checkpoint**: adapter tested in isolation; no behaviour change yet.

## Phase 1: User Story 1 — Remote imports work in Desktop (P1)

- [ ] T010 [US1] `packages/app-core/src/import/import-resolver-options.ts`: on `desktop-full` with `window.electronAPI.fetchRemoteAsset`, add `remoteOptions.fetchFn` and `httpsOnly: true` unless the caller supplied a `fetchFn` (FR-001, FR-003, FR-006)
- [ ] T011 [US1] Tests in `packages/app-core/tests/import-resolver-options.test.ts` (desktop sets it, web-lite does not, caller override wins) and a `resolveImports` test with a `github:` import and a stubbed bridge (FR-005)
- [ ] T012 [US1] Check that Play (`packages/app-core/src/playback/playback-manager.ts`), diagnostics (`packages/app-core/src/app/create-app-context.ts`), CodeLens preview (`packages/app-core/src/editor/codelens-preview.ts`) and export (`packages/app-core/src/export/export-manager.ts`, `apps/desktop/src/renderer/src/lib/export-handler.ts`) all use `buildImportResolverOptions()`; fix any that do not

**Checkpoint**: SC-003 passes; `remote_import_example.bax` plays in a dev build.

## Phase 2: User Story 2 — Blocked imports explain why (P1)

- [ ] T020 [US2] Confirm allowlist, `http://`, size, timeout and redirect errors reach the `parse:error` / Output path with the main-process text (FR-004); add an app-core test for the allowlist message passthrough
- [ ] T021 [US2] Allowlist changes in Settings → Advanced apply to the next resolve without restart (no caching of the allowlist in the renderer)

## Phase 3: User Story 3 — Example loader fallback (P3)

- [ ] T030 [US3] `apps/desktop/src/renderer/src/lib/load-example-song.ts`: `github:` / `https:` fallback paths go through `fetchRemoteAsset`; relative paths keep `loadRemote` (FR-007)

## Phase 4: End-to-end

- [ ] T040 Main-process E2E hook to serve a fixture `.ins` for an allowlisted URL (resolve the plan's open question); e2e scenario in `apps/desktop/tests/e2e/desktop-integration.spec.ts` resolving a `github:` import with no CSP violation, plus a non-allowlisted host scenario; keep `renderer CSP blocks direct remote fetches` (FR-008, SC-004)

## Polish

- [ ] T900 [P] Desktop section in `docs/grammar/import-security.md`; pointer in `docs/features/complete/remote-imports.md`; mark spec 019 open question 3 resolved
- [ ] T901 [P] Packaged-build QA rows in `docs/qa/desktop-release-qa.md` (SC-001, SC-002)
- [ ] T902 Run `npm test`; move this folder to `specs/complete/093-desktop-remote-imports-ipc/` and update `specs/STATUS.md` when shipped
