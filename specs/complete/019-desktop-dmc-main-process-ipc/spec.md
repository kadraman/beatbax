---
title: "Desktop DMC Remote Sample Loading via Main-Process IPC"
id: 19
slug: "desktop-dmc-main-process-ipc"
status: "complete"
authors:
  - "kadraman"
created: "2026-07-15"
updated: "2026-10-02"
issue: "https://github.com/kadraman/beatbax/issues/203"
area: "desktop"
related:
  - "docs/features/complete/electron-desktop-client.md"
  - "docs/features/desktop-client-enhancements.md"
  - "docs/features/complete/builtin-nes-chip-plugin.md"
---
## Summary

Move NES DMC remote sample loading in Desktop from renderer-side network fetch to Electron main-process IPC.

This fixes desktop playback failures caused by strict renderer CSP and preserves sandbox security boundaries while keeping engine behavior deterministic across Desktop, Web UI, and CLI.

---

## Implementation Progress

### Completed

- Added desktop IPC channel and API surface for remote asset fetching.
- Added main-process remote asset fetch with security policy enforcement:
  - https-only URLs
  - allowlist host checks
  - redirect validation per hop
  - timeout and payload limits
  - early Content-Length size rejection
- Added engine DMC resolver support for desktop `window.electronAPI.fetchRemoteAsset` path while preserving web/Node behavior.
- Added user-configurable allowlist management through Desktop Settings -> Advanced.
- Added allowlist persistence in desktop user data and strict host normalization/validation.
- Added unit and integration coverage for host policy and allowlist behavior.

- Audited renderer network use and made the renderer CSP `connect-src 'self'` explicit (see [plan.md](plan.md) Phase 5).
- Blocked-host errors now tell users where to add the host (Settings → Advanced → Remote host allowlist).
- DMC sample-load failures (blocked host, HTTP error, timeout, and so on) appear as warnings in the Output panel during playback, not only in the DevTools console, which packaged builds do not expose.
- E2E coverage for DMC playback with allowed and blocked remote samples, and for the renderer CSP.

- Packaged desktop build parity check for allowlist behaviour (manual, 2026-10-02).

---

## Problem Statement

Desktop currently preloads DMC samples through the NES plugin path in the engine, and remote sample references eventually resolve through renderer fetch.

In Desktop, renderer CSP is strict and sandboxed. Outbound remote requests for DMC sample URLs can be blocked, producing preload warnings such as failed to fetch. This causes missing DMC percussion in songs that depend on remote samples.

Root cause:

- Desktop renderer network policy and fetch location are mismatched.
- Security-sensitive networking is being done in renderer context instead of controlled main-process IPC.

---

## Goals

1. Eliminate renderer fetch dependency for desktop DMC remote samples.
2. Keep desktop sandboxing and strict CSP intact.
3. Enforce centralized security policy for remote sample retrieval.
4. Preserve existing behavior in Web UI and CLI paths.
5. Maintain deterministic preload and playback semantics.

---

## Non-Goals

- Refactoring all engine remote fetch paths in one change.
- Changing DMC decoding or mixer semantics.
- Broad redesign of desktop settings UX.
- Introducing silent fallback behavior for blocked sample URLs.

---

## Proposed Solution

### Summary

Add a dedicated main-process remote asset fetch IPC path in Desktop and route desktop DMC remote sample resolution through that path.

- Renderer requests remote sample bytes through window.electronAPI.
- Main process validates URL and policy, performs network request, and returns bytes.
- Engine DMC resolver uses IPC-backed bytes when desktop capability is present at runtime.
- Existing web and node paths remain unchanged.

### Security Model

Main process enforces:

1. HTTPS-only scheme.
2. Hostname allowlist.
3. Request timeout.
4. Maximum payload size.
5. Bounded redirects.
6. Sanitized error surfaces to renderer.

No renderer direct file access and no renderer arbitrary network bypass are introduced.

### Allowlist Policy

Baseline:

- Built-in default allowlist in desktop main process.
- Start with required hosts for existing DMC usage.

Implemented enhancement:

- Advanced user-configurable host allowlist extension with strict validation (hostnames only, no wildcard/path/scheme).

---

## Relevant Files

- apps/desktop/src/shared/ipc.ts
- apps/desktop/src/shared/electron-api.ts
- apps/desktop/src/preload/index.ts
- apps/desktop/src/main/ipc-handlers.ts
- apps/desktop/src/renderer/index.html
- apps/desktop/src/renderer/src/components/settings/advanced.tsx
- packages/engine/src/chips/nes/dmc.ts
- packages/engine/src/chips/nes/plugin.ts
- packages/engine/src/chips/types.ts
- packages/engine/src/audio/playback.ts
- packages/app-core/src/playback/playback-manager.ts
- apps/desktop/tests/ipc-handlers.test.ts
- apps/desktop/tests/e2e/desktop-integration.spec.ts

---

## Acceptance Criteria

1. Desktop no longer relies on renderer fetch for DMC remote sample loading.
2. DMC remote sample playback works for approved hosts in desktop dev and packaged builds.
3. Disallowed hosts fail with explicit policy error, not generic failed to fetch.
4. Web and CLI behavior remains unchanged.
5. Security guardrails are covered by automated tests.

Current status against criteria:

- Criteria 1, 3, and 5 are satisfied by implemented code and automated tests.
- Criteria 4 remains satisfied (web/CLI behavior preserved in engine tests).
- Criteria 2 is satisfied in desktop dev builds (e2e: DMC playback with allowed and blocked hosts) and was verified manually in a packaged build on 2026-10-02.

---

## Open Questions

1. Should the built-in allowlist include only raw.githubusercontent.com initially, or additional trusted hosts by default?
   - **Resolved (2026-10-02):** only `raw.githubusercontent.com`. `github:` refs and `https://github.com/.../blob/...` URLs both resolve to that host; users add others in Settings → Advanced.
2. Should blocked-host diagnostics include direct remediation guidance in output/status UI (for example, Settings -> Advanced -> Remote host allowlist)?
   - **Resolved (2026-10-02):** yes. The error reads "Remote asset host '<host>' is not in the Desktop allowlist. Add it under Settings → Advanced → Remote host allowlist." It is shown in the Output panel as a `[playback]` warning, prefixed with `NES DMC: failed to load sample '<ref>':`, once per play.
3. Should this IPC remote fetch contract be generalized for other remote asset consumers beyond DMC in a follow-up feature?
   - **Deferred:** remote instrument imports are the first other consumer and are currently blocked by the renderer CSP. Tracked in [#216](https://github.com/kadraman/beatbax/issues/216) and specified in [spec 093](../../features/093-desktop-remote-imports-ipc/spec.md).
