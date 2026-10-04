# Implementation Plan: Desktop DMC Remote Sample Loading via Main-Process IPC

**Spec**: [spec.md](spec.md) | **Migrated**: 2026-09-03

## Constitution Check

GATE: complete before implementation. Re-check after design changes.

- [x] No invented syntax or undocumented language behavior
- [x] AST / ISM / scheduler / expansion impact identified: N/A (sample loading transport only)
- [x] Plugins remain isolated; core does not gain plugin dependencies (engine detects `window.electronAPI.fetchRemoteAsset` at runtime)
- [x] Determinism and compatibility preserved: web and CLI paths unchanged
- [x] Tests planned for new behavior

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

### Phase 5: CSP Review (completed 2026-10-02)

Renderer network audit (calls to `fetch` reachable from the Desktop renderer):

| Caller | Desktop path | Needs renderer network? |
| --- | --- | --- |
| `packages/engine/src/chips/nes/dmc.ts` | `electronAPI.fetchRemoteAsset` (main process) | No |
| `apps/desktop/src/renderer/src/components/settings/ai.tsx` (validate key, list models) | `validateAIAPIKey` / `listAIModels` IPC | No (renderer `fetch` is the web fallback) |
| `apps/desktop/src/renderer/src/components/panels/DesktopCopilotPanel.tsx` (chat completion) | `createAIChatCompletion` IPC | No (renderer `fetch` is the web fallback) |
| `apps/desktop/src/renderer/src/lib/load-example-song.ts` | `openBundledExample` IPC; `loadRemote('/songs/...')` fallback is same-origin in dev | No |
| `packages/engine/src/import/remoteCache.ts` (remote `import "github:..."` / `https://`) | Renderer `fetch` | Yes, currently blocked; tracked in [#216](https://github.com/kadraman/beatbax/issues/216) |

Outcome:

- `connect-src 'self'` is now explicit. It matches the previous effective policy (`default-src 'self'`), keeps same-origin dev-server requests and the Vite HMR websocket working, and blocks direct remote requests.
- The CSP was not widened for remote imports. The intended fix is to route them through the same main-process fetch (open question 3), as a separate feature.

### Phase 6: User-Configurable Allowlist (completed)

- Added desktop API methods to read/write user allowlist.
- Persisted user allowlist in desktop userData.
- Added Advanced settings UI to edit/reset hosts.
- Merged persisted user allowlist with built-in defaults at runtime.

### Phase 7: Show sample-load failures in the UI (completed 2026-10-02)

Packaged builds block DevTools (`@electron-toolkit/utils` cancels Ctrl+Shift+I in production), so a console-only warning is invisible to users. Changes:

- `ChipPlugin.preloadForPCM(insts, options?)` gains an optional `{ onWarn }` argument (`packages/engine/src/chips/types.ts`, recorded in [specs/complete/037-plugin-system/spec.md](../037-plugin-system/spec.md)). Without it, plugins keep logging to the console, so the CLI and WAV export are unchanged.
- `preloadDMCSamples` reports `NES DMC: failed to load sample '<ref>': <reason>` with component `nes-dmc`.
- `Player.onWarn` (`packages/engine/src/audio/playback.ts`) is passed to `preloadForPCM` during `playAST`.
- `PlaybackManager.play` (`packages/app-core/src/playback/playback-manager.ts`) emits each warning once per play as `output:message` (`type: 'warning'`, `source: 'playback'`, `focus: true`), so it appears in the Output panel in Desktop and web.

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
3. `preloadForPCM` reports failed samples through `onWarn`, and falls back to `console.warn` without it.

App-core tests:

1. `PlaybackManager` forwards `Player.onWarn` warnings to `output:message` once per play.

### Integration Tests

Completed targeted integration:

1. Desktop renderer -> preload -> main-process bridge fetch behavior validated.
2. Disallowed host is blocked by policy.
3. Adding a host through allowlist settings enables fetch for that host.

4. DMC playback preloads an allowlisted `github:` sample through the main process, and the blocked host's allowlist error appears as a `[playback]` warning in the Output panel (no generic "failed to fetch").
5. Renderer CSP contains `connect-src 'self'` and blocks a direct remote `fetch`.

Manual check (done 2026-10-02):

1. Packaged desktop build parity check for allowlist behavior (T021): a sample on a non-allowlisted host produced the allowlist warning in the packaged build.

---
