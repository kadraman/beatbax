# Tasks: Desktop DMC Remote Sample Loading via Main-Process IPC

**Input**: [spec.md](spec.md), [plan.md](plan.md)

Most phases are already implemented. Remaining work is CSP follow-up and broader e2e coverage.

## Phase 0–4 / 6: Completed

- [x] T001 IPC contract for remote asset fetch
- [x] T002 Main-process fetch service (HTTPS, allowlist, timeout, size, redirects)
- [x] T003 Preload bridge (`window.electronAPI.fetchRemoteAsset`)
- [x] T004 Engine DMC resolver prefers desktop IPC when available
- [x] T005 User-configurable allowlist in Settings → Advanced + persistence
- [x] T006 Unit/integration tests for host policy and allowlist

## Phase 5: CSP review (remaining)

- [ ] T010 Audit renderer network requirements after DMC migration
- [ ] T011 Tighten desktop renderer CSP `connect-src` to least required scope

## Phase 7: Broader verification (remaining)

- [ ] T020 E2E: full DMC playback with remote sample refs (allowed + blocked hosts)
- [ ] T021 Packaged desktop build parity check for allowlist behaviour
- [ ] T022 Move to `specs/complete/019-desktop-dmc-main-process-ipc/` when remaining gates pass
