# Tasks: Desktop developer tools opt-in and diagnostics log

**Input**: [spec.md](spec.md), [plan.md](plan.md)

**Format**: `- [ ] Tnnn [P?] [USn?] Description` with **exact repo paths**.

- **[P]**: can run in parallel (different files, no shared-write dependency)
- **[USn]**: maps to a user story in spec.md

All tasks are complete except the remaining manual packaged-build checks in T902 (Windows and Linux, and the forced startup error screen), which are listed in [docs/qa/desktop-release-qa.md](../../../docs/qa/desktop-release-qa.md) for the next release.

## Phase 0: Foundation (blocks stories)

- [x] T001 Resolve the spec's open questions and the plan's open implementation questions (GitHub issue: [#217](https://github.com/kadraman/beatbax/issues/217))
- [x] T002 [P] IPC contract: add channels to `apps/desktop/src/shared/ipc.ts`, methods to `apps/desktop/src/shared/electron-api.ts`, and bridge them in `apps/desktop/src/preload/index.ts` (`getDevToolsState`, `setDevToolsEnabled`, `onDevToolsStateChanged`, `logDiagnostics`, `openLogsFolder`)

**Checkpoint**: foundation complete before user-story work.

## Phase 1: User Story 1 — Turn on developer tools deliberately (P1)

- [x] T010 [US1] `apps/desktop/src/main/devtools-policy.ts`: settings file (`userData/desktop-diagnostics.json`), `--devtools` switch, `getDevToolsState`, `decideShortcut`, `devtools-opened` enforcement, E2E override `BEATBAX_E2E_PACKAGED_DEVTOOLS_POLICY`
- [x] T011 [US1] `apps/desktop/src/main/index.ts`: use `optimizer.watchWindowShortcuts` only in development builds; attach the policy's `before-input-event` handler in packaged builds
- [x] T012 [US1] `apps/desktop/src/main/ipc-handlers.ts`: `get-devtools-state` and `set-devtools-enabled` handlers, `devtools-state-changed` broadcast, and a policy check on `WINDOW_TOGGLE_DEVTOOLS`
- [x] T013 [P] [US1] `apps/desktop/src/main/menu.ts`: macOS View item only when allowed; remove the hidden Windows/Linux accelerator item
- [x] T014 [P] [US1] `apps/desktop/src/renderer/src/components/shell/menu-bar.ts` and `apps/desktop/src/renderer/src/lib/desktop-menu-bar.ts`: conditional View → Toggle Developer Tools, rebuilt on state change
- [x] T015 [P] [US1] `apps/desktop/src/renderer/src/components/settings/advanced.tsx`: Enable developer tools toggle, confirmation, launch-flag and development notes; Reset all settings disables developer tools
- [x] T016 [US1] Tests: `apps/desktop/tests/devtools-policy.test.ts`, `apps/desktop/tests/menu.test.ts` (devtools item), and e2e scenarios 1–3 in `apps/desktop/tests/e2e/desktop-integration.spec.ts`

**Checkpoint**: story independently testable.

## Phase 2: User Story 2 — Attach a log file to a bug report (P1)

- [x] T020 [US2] `apps/desktop/src/main/diagnostics-log.ts`: `app.setAppLogsPath()`, line format, startup line, 1 MiB rotation, redaction, serialized writes, console-only fallback, `BEATBAX_E2E_LOGS_DIR`
- [x] T021 [US2] `apps/desktop/src/main/index.ts` and `apps/desktop/src/main/ipc-handlers.ts`: process-level hooks (`uncaughtException`, `unhandledRejection`, `render-process-gone`, `child-process-gone`), log calls beside existing `console.error`/`console.warn` sites, `diagnostics-log` IPC with validation, truncation, and rate limiting
- [x] T022 [P] [US2] `apps/desktop/src/renderer/src/lib/diagnostics-log.ts`: forward `playback:error`, `export:error`, and warning/error `output:message`; wire `installGlobalErrorHandlers` in `apps/desktop/src/renderer/src/lib/desktop-workspace.ts`
- [x] T023 [P] [US2] Help → Open Logs Folder: `desktop:open-logs-folder` handler, custom Help menu in `menu-bar.ts`, macOS Help menu in `apps/desktop/src/main/menu.ts`
- [x] T024 [US2] Tests: `apps/desktop/tests/diagnostics-log.test.ts` (plus `apps/desktop/tests/renderer-diagnostics-log.test.ts`), and e2e scenarios 4–5 in `apps/desktop/tests/e2e/desktop-integration.spec.ts`

**Checkpoint**: story independently testable.

## Phase 3: User Story 3 — Startup error screen that helps (P2)

- [x] T030 [US3] `apps/desktop/src/renderer/src/components/ErrorBoundary.tsx`: Open logs folder button, conditional Open developer tools button, `--devtools` guidance; forward the error to the log from `componentDidCatch`
- [x] T031 [US3] Test the error screen states (allowed vs not allowed) in a Jest test or e2e (`apps/desktop/tests/error-boundary-screen.test.ts`)

## Polish

- [x] T900 [P] New `docs/ui/desktop-troubleshooting.md`; update `docs/qa/desktop-release-qa.md` and `docs/api/logger.md`
- [x] T901 [P] Changeset for `@beatbax/desktop` (ignored by changesets; add release notes in the desktop release process instead if preferred) and a release-notes line about the macOS View menu change (`apps/desktop/build/release-notes.body.txt`)
- [ ] T902 Manual packaged-build QA (plan.md → Manual / QA). Done on macOS 2026-10-05 against an unsigned `--mac dir` build: off by default (Alt+Cmd+I and the bridge toggle do nothing, no View menu item), Help → Open Logs Folder present, log written to `~/Library/Logs/BeatBax/beatbax.log`, and `--devtools` allows developer tools for the session. Still to do: Windows and Linux, enabling from Settings in a packaged build, and the forced startup error screen.
- [x] T903 Move this folder to `specs/complete/091-desktop-devtools-and-diagnostics/` and update `specs/STATUS.md` when shipped
