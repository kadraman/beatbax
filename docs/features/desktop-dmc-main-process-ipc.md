---
title: "Desktop DMC Remote Sample Loading via Main-Process IPC"
status: proposed
authors: ["kadraman"]
created: 2026-07-15
updated: 2026-07-15
related:
  - docs/features/complete/electron-desktop-client.md
  - docs/features/desktop-client-enhancements.md
  - docs/features/complete/builtin-nes-chip-plugin.md
issue: ""
---

## Summary

Move NES DMC remote sample loading in Desktop from renderer-side network fetch to Electron main-process IPC.

This fixes desktop playback failures caused by strict renderer CSP and preserves sandbox security boundaries while keeping engine behavior deterministic across Desktop, Web UI, and CLI.

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

Optional enhancement:

- Advanced user-configurable host allowlist extension with strict validation.

---

## Implementation Plan

### Phase 1: IPC Contract

- Add remote asset IPC channel constants.
- Add typed request/response contracts to desktop shared API.
- Keep contract generic for reuse beyond DMC.

### Phase 2: Main-Process Fetch Service

- Implement fetch service module under desktop main process.
- Add URL parsing and policy checks.
- Add timeout, payload-size guard, and redirect guard.
- Register ipcMain handler in desktop IPC registration.

### Phase 3: Preload Bridge

- Add typed invoke wrapper in preload.
- Expose method in window.electronAPI.
- Keep contextIsolation and sandbox compatibility unchanged.

### Phase 4: Engine DMC Integration

- Update NES DMC resolver to prefer desktop IPC path when available.
- Preserve existing web fetch path and node local path behavior.
- Keep local sample browser restrictions unchanged.

### Phase 5: CSP Review

- After migration, tighten desktop renderer CSP connect policy to least required scope.
- Avoid broad connect-src where not needed.

---

## Relevant Files

- apps/desktop/src/shared/ipc.ts
- apps/desktop/src/shared/electron-api.ts
- apps/desktop/src/preload/index.ts
- apps/desktop/src/main/ipc-handlers.ts
- apps/desktop/src/renderer/index.html
- packages/engine/src/chips/nes/dmc.ts

---

## Testing Strategy

### Unit Tests

Desktop main-process tests:

1. Allows approved host over HTTPS.
2. Blocks disallowed host.
3. Rejects non-HTTPS schemes.
4. Enforces timeout.
5. Enforces max payload size.

Engine tests:

1. Desktop capability branch in DMC resolver uses IPC provider.
2. Existing web and node branches remain unchanged.

### Integration Tests

1. Desktop playback of songs/nes/iron_keep.bax loads remote DMC samples without failed-to-fetch.
2. Disallowed remote host yields policy-blocked diagnostic and silent DMC channel only.
3. Packaged desktop build matches dev behavior.

---

## Acceptance Criteria

1. Desktop no longer relies on renderer fetch for DMC remote sample loading.
2. DMC remote sample playback works for approved hosts in desktop dev and packaged builds.
3. Disallowed hosts fail with explicit policy error, not generic failed to fetch.
4. Web and CLI behavior remains unchanged.
5. Security guardrails are covered by automated tests.

---

## Open Questions

1. Should the built-in allowlist include only raw.githubusercontent.com initially, or additional trusted hosts?
2. Should blocked-host diagnostics include remediation text with settings path when configurable allowlist ships?
3. Should the IPC remote fetch contract be reused immediately for other remote assets, or only DMC in first scope?
