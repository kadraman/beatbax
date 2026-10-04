# Tasks: Desktop DMC Remote Sample Loading via Main-Process IPC

**Input**: [spec.md](spec.md), [plan.md](plan.md)

All tasks are complete, including the manual packaged-build check (T021).

## Phase 0–4 / 6: Completed

- [x] T001 IPC contract for remote asset fetch
- [x] T002 Main-process fetch service (HTTPS, allowlist, timeout, size, redirects)
- [x] T003 Preload bridge (`window.electronAPI.fetchRemoteAsset`)
- [x] T004 Engine DMC resolver prefers desktop IPC when available
- [x] T005 User-configurable allowlist in Settings → Advanced + persistence
- [x] T006 Unit/integration tests for host policy and allowlist

## Phase 5: CSP review (remaining)

- [x] T010 Audit renderer network requirements after DMC migration (findings in [plan.md](plan.md) Phase 5)
- [x] T011 Explicit `connect-src 'self'` in `apps/desktop/src/renderer/index.html`; blocked-host errors name Settings → Advanced → Remote host allowlist (`apps/desktop/src/main/ipc-handlers.ts`)
- [x] T012 Show DMC sample-load failures in the Output panel: optional `onWarn` on `preloadForPCM`, `Player.onWarn`, `PlaybackManager` emits `output:message` once per play (see [plan.md](plan.md) Phase 7); engine and app-core unit tests

## Phase 7: Broader verification (remaining)

- [x] T020 E2E: DMC playback with an allowlisted `github:` sample and a blocked `https://example.com` sample (warning shown in the Output panel); renderer CSP blocks direct remote fetch (`apps/desktop/tests/e2e/desktop-integration.spec.ts`)
- [x] T021 Packaged desktop build parity check for allowlist behaviour (manual, passed 2026-10-02: a sample on `somewhere.com` showed "NES DMC: failed to load sample '…': … Remote asset host 'somewhere.com' is not in the Desktop allowlist. Add it under Settings → Advanced → Remote host allowlist.")
- [x] T022 Move to `specs/complete/019-desktop-dmc-main-process-ipc/` when remaining gates pass
