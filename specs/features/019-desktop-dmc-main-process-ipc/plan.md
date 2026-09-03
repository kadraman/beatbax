# Implementation Plan: Desktop DMC Remote Sample Loading via Main-Process IPC

**Spec**: [spec.md](spec.md) | **Migrated**: 2026-09-03

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [ ] No invented syntax or undocumented language behavior
- [ ] AST / ISM / scheduler / expansion impact identified (or N/A)
- [ ] Plugins remain isolated; core does not gain plugin dependencies
- [ ] Determinism and compatibility preserved (or migration documented)
- [ ] Tests planned for new behavior

## Implementation Plan

### Phase 1: IPC Contract (completed)

- Add remote asset IPC channel constants.
- Add typed request/response contracts to desktop shared API.
- Keep contract generic for reuse beyond DMC.

### Phase 2: Main-Process Fetch Service (completed)

- Implement fetch service module under desktop main process.
- Add URL parsing and policy checks.
- Add timeout, payload-size guard, and redirect guard.
- Register ipcMain handler in desktop IPC registration.

### Phase 3: Preload Bridge (completed)

- Add typed invoke wrapper in preload.
- Expose method in window.electronAPI.
- Keep contextIsolation and sandbox compatibility unchanged.

### Phase 4: Engine DMC Integration (completed)

- Update NES DMC resolver to prefer desktop IPC path when available.
- Preserve existing web fetch path and node local path behavior.
- Keep local sample browser restrictions unchanged.

### Phase 5: CSP Review (pending)

- After migration, tighten desktop renderer CSP connect policy to least required scope.
- Avoid broad connect-src where not needed.

### Phase 6: User-Configurable Allowlist (completed)

- Added desktop API methods to read/write user allowlist.
- Persisted user allowlist in desktop userData.
- Added Advanced settings UI to edit/reset hosts.
- Merged persisted user allowlist with built-in defaults at runtime.

---

## Testing Strategy

### Unit Tests

Desktop main-process tests:

1. Allows approved host over HTTPS.
2. Blocks disallowed host.
3. Rejects non-HTTPS schemes.
4. Enforces timeout.
5. Enforces max payload size.
6. Enforces redirect host validation and redirect limit.
7. Validates and persists user-configurable allowlist hosts.

Engine tests:

1. Desktop capability branch in DMC resolver uses IPC provider.
2. Existing web and node branches remain unchanged.

### Integration Tests

Completed targeted integration:

1. Desktop renderer -> preload -> main-process bridge fetch behavior validated.
2. Disallowed host is blocked by policy.
3. Adding a host through allowlist settings enables fetch for that host.

Planned additional integration:

1. Full DMC playback scenario assertion using remote sample refs (allowed and blocked host variants).
2. Packaged desktop build parity check for allowlist behavior.

---
