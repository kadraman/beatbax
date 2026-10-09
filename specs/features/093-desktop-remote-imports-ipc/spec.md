---
title: "Desktop remote instrument imports through main-process IPC"
id: 93
slug: "desktop-remote-imports-ipc"
status: "specified"
authors:
  - "kadraman"
created: "2026-10-08"
updated: "2026-10-08"
issue: "https://github.com/kadraman/beatbax/issues/216"
area: "desktop"
related:
  - "specs/complete/019-desktop-dmc-main-process-ipc/spec.md"
  - "specs/complete/048-remote-imports/spec.md"
  - "specs/complete/083-desktop-export-imported-instruments/spec.md"
  - "specs/complete/084-codelens-preview-imported-instruments/spec.md"
---

# Feature Specification: Desktop remote instrument imports through main-process IPC

## Summary

Remote instrument imports (`import "github:owner/repo/path.ins"`, `import "https://…/kit.ins"`) do not work in BeatBax Desktop. The engine fetches them from the renderer, and the renderer Content Security Policy (`connect-src 'self'`) blocks every cross-origin request. This spec routes Desktop remote imports through the main-process remote fetch that spec 019 added for NES DMC samples, with the same security policy, and keeps the renderer CSP strict.

## Problem

- `RemoteInstrumentCache` (`packages/engine/src/import/remoteCache.ts`) calls `fetch` in the renderer. Desktop's CSP (`apps/desktop/src/renderer/index.html`) only allows `connect-src 'self'`, so the request is blocked and the import fails. This is not a regression: before spec 019 the CSP fell back to `default-src 'self'`, which blocks the same requests. The e2e test `renderer CSP blocks direct remote fetches` shows the block.
- Every Desktop surface that merges imports is affected: Play, the editor diagnostics, CodeLens previews (spec 084) and export (spec 083). The bundled example `songs/features/remote_import_example.bax` cannot be played in Desktop.
- Widening the CSP would let any renderer code (including a compromised dependency or pasted console code) reach arbitrary hosts, which spec 019 deliberately avoided.
- Spec 019 open question 3 deferred "generalise the IPC remote fetch for other consumers"; remote instrument imports are the first other consumer.

## User scenarios

### User Story 1 — Remote instrument imports work in Desktop (Priority: P1)

**Why this priority**: Remote imports are a documented language feature (spec 048) that is broken on the primary client.

**Independent test**: Open `songs/features/remote_import_example.bax` in Desktop and press Play.

**Acceptance scenarios**:

1. **Given** a song with `import "github:kadraman/beatbax-instruments/main/melodic.ins"` (host `raw.githubusercontent.com`, allowed by default), **When** the user plays, exports, or previews a pattern with CodeLens in Desktop, **Then** the instruments resolve and the song plays or exports as it does in the CLI.
2. **Given** the same song, **When** it is opened, **Then** the editor shows no "instrument is not defined" diagnostics for instruments that come from the remote kit.
3. **Given** a remote import is resolved, **When** the renderer network activity is inspected, **Then** no direct request to the remote host is made from the renderer and no CSP violation is reported.

### User Story 2 — A blocked or failing remote import says why (Priority: P1)

**Why this priority**: The Desktop policy is stricter than the CLI (HTTPS-only, allowlisted hosts), so users need to know how to fix a refused import.

**Independent test**: Import from a host that is not in the allowlist and read the error.

**Acceptance scenarios**:

1. **Given** `import "https://example.com/kits/lead.ins"` and `example.com` is not allowlisted, **When** imports are resolved, **Then** the import fails with the message *Remote asset host 'example.com' is not in the Desktop allowlist. Add it under Settings → Advanced → Remote host allowlist.*, reported through the same error path as any other import failure (parse status and Output panel; Play, export and CodeLens preview show the same message).
2. **Given** the user adds `example.com` under Settings → Advanced → Remote host allowlist, **When** imports are resolved again, **Then** the import succeeds without restarting the app.
3. **Given** `import "http://…/kit.ins"`, **When** imports are resolved in Desktop, **Then** the import fails with *Only https:// remote assets are allowed in Desktop.*
4. **Given** a remote file larger than 1 MiB, a fetch that takes more than 10 seconds, or more than 5 redirects, **When** imports are resolved, **Then** the import fails with the corresponding size, timeout or redirect message from the main process.

### User Story 3 — Example loader fallback does not hit the CSP (Priority: P3)

**Why this priority**: Only used when the bundled-example IPC fails, but today it can produce a confusing CSP error.

**Acceptance scenarios**:

1. **Given** `openBundledExample` fails for a `github:` or `https:` example path, **When** the loader falls back, **Then** it fetches through the main-process remote fetch with the same policy, not with a renderer `fetch`.
2. **Given** a relative example path (`/songs/...`) in a development build, **When** the loader falls back, **Then** behaviour is unchanged (same-origin fetch from the Vite dev server).

### Edge cases

- A remote `.ins` that itself contains `import` lines is rejected, as today (spec 048: remote `.ins` files may not import).
- The engine's `.ins` validation (allowed declarations only) still runs in the renderer on the returned text; the main process only transports bytes.
- `github:` refs and `https://github.com/.../blob/...` URLs normalise to `raw.githubusercontent.com` before the request, so they use the default allowlist entry.
- Each resolve (Play, diagnostics refresh, CodeLens preview, export) may fetch the same URL again; this matches today's web behaviour and is not changed here.
- Untitled (unsaved) songs can still use remote imports; only `local:` imports need a saved song.

## Requirements

### Functional requirements

- **FR-001**: In the `desktop-full` client profile, remote instrument imports (`github:`, `https://`, `http://`) MUST be fetched through the main-process remote asset IPC (`window.electronAPI.fetchRemoteAsset`). The renderer MUST NOT issue a direct network request for them.
- **FR-002**: The renderer CSP MUST keep `connect-src 'self'`. This spec MUST NOT add hosts to the CSP.
- **FR-003**: Remote imports in Desktop MUST use the spec 019 policy unchanged: HTTPS only, no credentials or explicit port, hostname in the effective allowlist (built-in `raw.githubusercontent.com` plus the user list under Settings → Advanced → Remote host allowlist, shared with DMC samples), 10 s timeout, 1 MiB maximum size, at most 5 redirects, each redirect target re-checked against the policy.
- **FR-004**: Policy and network errors MUST reach the user with the main-process message text (no Electron IPC prefix), through the existing import error paths (the `parse:error` status and Output panel, Play, export and CodeLens preview). Adding a per-line marker on the `import` line is out of scope.
- **FR-005**: The engine's remote `.ins` rules (spec 048: allowed declarations only, no nested imports, size limit) MUST still apply to the fetched text.
- **FR-006**: Web (`web-lite`) and CLI remote import behaviour MUST be unchanged.
- **FR-007**: The Desktop example loader fallback MUST NOT perform a renderer `fetch` to a cross-origin URL; `github:` and `https:` paths MUST use the main-process remote fetch.
- **FR-008**: The e2e coverage MUST keep proving that a direct renderer fetch is blocked by the CSP, and MUST add a case where a remote import resolves through the IPC path.

### Non-goals

- Widening or relaxing the renderer CSP.
- A persistent or session-wide remote import cache, or offline use of previously fetched kits.
- Changing the allowlist defaults, or adding a separate allowlist for imports.
- Allowing `http://` imports in Desktop.
- Changing CLI or web remote import behaviour.

## Success criteria

- **SC-001**: `songs/features/remote_import_example.bax` plays and exports in a Desktop dev build and a packaged build with no CSP violation.
- **SC-002**: An import from a non-allowlisted host fails with the allowlist message in the Output panel; after adding the host in Settings it succeeds without a restart.
- **SC-003**: Unit tests cover the Desktop fetch adapter (success, policy error passthrough, payload conversion) and that web/CLI resolver options are unchanged.
- **SC-004**: The e2e suite still shows a direct renderer fetch blocked by `connect-src`, and shows a remote import resolved through the IPC with the main-process fetch stubbed.

## Assumptions

- The default allowlist (`raw.githubusercontent.com`) covers the documented `github:` kits; other hosts are rare and users can add them.
- Remote `.ins` files are small text files, well under 1 MiB.

## Open questions

None. Decisions taken on 2026-10-08 (from #216 and spec 019 open question 3): route through the existing IPC rather than widen the CSP; share the existing allowlist; keep `http://` refused in Desktop.

## References

- [#216](https://github.com/kadraman/beatbax/issues/216)
- [Spec 019 — Desktop DMC main-process IPC](../../complete/019-desktop-dmc-main-process-ipc/spec.md) (policy, allowlist, open question 3)
- [Spec 048 — Remote imports](../../complete/048-remote-imports/spec.md)
- [Spec 083 — Desktop export with imported instruments](../../complete/083-desktop-export-imported-instruments/spec.md), [Spec 084 — CodeLens preview with imported instruments](../../complete/084-codelens-preview-imported-instruments/spec.md)
- [Import security](../../../docs/grammar/import-security.md)
