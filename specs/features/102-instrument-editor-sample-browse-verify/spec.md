---
title: "Instrument editor DMC sample Browse + Check"
id: 102
slug: "instrument-editor-sample-browse-verify"
status: "planned"
authors:
  - "kadraman"
created: "2026-10-23"
updated: "2026-10-23"
issue: "https://github.com/kadraman/beatbax/issues/234"
area: "desktop"
related:
  - "specs/complete/021-instrument-editor-panel/spec.md"
  - "specs/complete/019-desktop-dmc-main-process-ipc/spec.md"
  - "specs/complete/093-desktop-remote-imports-ipc/spec.md"
  - "specs/features/098-instrument-editor-preview-pitch/spec.md"
  - "specs/features/099-instrument-editor-live-edit/spec.md"
---

# Feature Specification: Instrument editor DMC sample Browse + Check

## Summary

The Desktop Instrument Editor `sample` widget (NES `dmc_sample`) gains **Browse…** for the Local scheme and a **Check** control that resolves Local / HTTPS / GitHub / Bundled refs through the existing Desktop IPC and engine sample path—without full-song playback. Unknown `@nes/<name>` values fail soft validation against `plugin.bundledSamples`. Hover/wizard kit lists are aligned with the real bundled kit. No language or remote-security policy changes.

## Problem

Spec [021](../../complete/021-instrument-editor-panel/spec.md) shipped the sample widget as **scheme + typed value** with an explicit **“No filesystem Browse.”** Authors must hand-type `local:` paths and HTTPS / `github:` remainders. Remote load already works via main-process `fetchRemoteAsset` ([019](../../complete/019-desktop-dmc-main-process-ipc/spec.md), [093](../../complete/093-desktop-remote-imports-ipc/spec.md)); local `local:` uses Desktop FS bridges. Panel validation is **syntax only**—missing files, blocked hosts, and unknown `@nes/` names surface at preload/playback (Output warnings), not in the Instruments tab. Stale hover/wizard docs still list kit names that are not in `BUNDLED_SAMPLES`.

## User scenarios

### User Story 1 — Browse Local sample (Priority: P1)

**Why this priority**: Primary friction for custom DMC kits next to a song.

**Independent test**: Saved NES song; Local scheme; Browse a `.dmc` under the song directory; `dmc_sample` becomes a relative `local:…` ref that validates and Checks OK.

**Acceptance scenarios**:

1. **Given** a local NES DMC instrument and scheme Local, **When** the Instruments tab shows the sample field, **Then** a **Browse…** control is available (disabled for imported read-only instruments).
2. **Given** Browse…, **When** the user picks a `.dmc` file under the saved song directory (or another allowed root that can be expressed as a relative path without `..`), **Then** the field commits a relative `local:` remainder via existing format helpers (spaces percent-encoded as today).
3. **Given** the song is unsaved (no song path), **When** the user chooses Browse…, **Then** the panel shows a clear error and does not invent an absolute `local:` path.
4. **Given** the chosen file cannot be expressed as a relative path without `..` (or would become absolute), **When** Browse completes, **Then** the field is not updated and the panel explains why.
5. **Given** Live edit on/off from [099](../099-instrument-editor-live-edit/spec.md), **When** Browse updates the sample value, **Then** writeback / draft behaviour matches other field edits.

### User Story 2 — Check sample (Priority: P1)

**Why this priority**: Authors need load feedback without playing the whole song.

**Independent test**: Set Local / HTTPS / GitHub / Bundled refs; Check; see OK + byte length or the same class of error as playback (including allowlist remediation).

**Acceptance scenarios**:

1. **Given** a non-empty sample ref (Local, HTTPS, GitHub, or Bundled), **When** the user activates **Check**, **Then** the panel resolves the ref through the existing Desktop/engine path (`resolveSampleAsset` / `resolveRawDMCSample` / `fetchRemoteAsset` as appropriate)—not renderer `fetch`.
2. **Given** Check succeeds, **When** bytes are returned, **Then** the panel shows a non-blocking success status that includes byte length (exact wording is implementation detail).
3. **Given** Check fails for a blocked remote host, **When** the error is shown, **Then** the message includes Settings → Advanced allowlist remediation consistent with [019](../../complete/019-desktop-dmc-main-process-ipc/spec.md) / main-process policy text.
4. **Given** Check fails for missing local file, network/timeout/size, or unknown bundled name, **When** the error is shown, **Then** the panel surfaces a readable message and does not require full-song play.
5. **Given** Check, **When** remote policy runs, **Then** CSP, host allowlist, HTTPS-only, size, timeout, and redirect limits are unchanged from 019/093.

### User Story 3 — Bundled name validity (Priority: P2)

**Why this priority**: Dropdown and validation should agree with the real kit.

**Independent test**: Type or paste `@nes/not_a_real_sample`; field validation and/or Check fail against `bundledSamples` keys.

**Acceptance scenarios**:

1. **Given** scheme Bundled (or a stored `@nes/<name>` ref), **When** `<name>` is not in `plugin.bundledSamples` for NES, **Then** instrument field validation reports an error on `dmc_sample` (write-valid-only still applies).
2. **Given** such an invalid bundled name, **When** Check runs, **Then** Check fails with a clear unknown-sample message.

### User Story 4 — Docs / hover kit alignment (Priority: P2)

**Why this priority**: Stale names mislead authors and Copilot/hover.

**Independent test**: Hover / song-wizard / composition docs list the same names as `BUNDLED_SAMPLES` keys (including aliases that map to real samples, if docs mention aliases).

**Acceptance scenarios**:

1. **Given** NES hover / wizard text that enumerates bundled samples, **When** docs are updated, **Then** listed names match the current kit in `packages/engine/src/chips/nes/dmcSamples.ts` (no obsolete `bass_c1` / `shaker`-style ghosts unless they exist as keys).
2. **Given** composition / instrument-editor help, **When** Browse and Check ship, **Then** a brief note documents Browse for Local and Check for Local/HTTPS/GitHub/Bundled.

### Edge cases

- Imported read-only instruments: Browse and Check may still **Check** (audition/load probe) if preview is allowed today; Browse and value edits stay disabled.
- Empty sample value: Check unavailable or reports “no sample set.”
- HTTPS typed as `http://` remainder: existing format rewrite to `https://` remains; Check uses the composed ref.
- GitHub shorthand still resolves to `main` as today; this feature does not add a branch picker.
- Non-NES chips that reuse the generic `sample` widget later: Browse/Check SHOULD work for any chip with `widget: 'sample'` when Desktop can resolve the ref the same way; NES DMC is the shipping target.
- Web-lite: out of scope (no Browse; `local:` already blocked).

## Requirements

### Functional requirements

- **FR-001**: When scheme is Local on Desktop, the sample widget MUST offer **Browse…** that opens a native open-file dialog (`.dmc` preferred in filters).
- **FR-002**: Browse MUST write only a **relative** `local:` path that passes existing NES validation (no `..` segments, no absolute `local:`).
- **FR-003**: Browse MUST fail clearly when the song has no path or the file cannot be relativized safely.
- **FR-004**: The sample widget MUST offer **Check** for Bundled, Local, HTTPS, and GitHub when a value is set.
- **FR-005**: Check MUST resolve via existing Desktop IPC + engine sample resolution; MUST NOT use renderer network fetch or loosen CSP / allowlist / size / timeout.
- **FR-006**: Check success MUST show non-blocking feedback including byte length; Check failure MUST show a readable panel message, including allowlist remediation when the host is blocked.
- **FR-007**: Unknown `@nes/<name>` (name not in `plugin.bundledSamples`) MUST fail soft instrument validation on `dmc_sample`.
- **FR-008**: Live / Apply / Revert from [099](../099-instrument-editor-live-edit/spec.md) MUST apply to Browse-updated sample values like other fields.
- **FR-009**: No new `.bax` language syntax, schemes, or remote policy defaults.
- **FR-010**: User-facing NES kit lists in hover/wizard/docs MUST match the real bundled sample keys.

### Non-goals

- Web-lite Instrument Editor sample UX.
- In-panel `wav2dmc` / WAV→DMC conversion (CLI remains; future enhancement).
- GitHub ref branch other than `main`.
- Sample cache invalidation when file/URL content changes under the same ref.
- Changing remote allowlist defaults or max size/timeout.
- SNES BRR / other chip sample bank browsers.
- Language or AST changes.

## Success criteria

- **SC-001**: Author can Browse a `.dmc` beside a saved song and get a validating relative `local:` `dmc_sample` without hand-typing the path.
- **SC-002**: Check reports OK or failure for Local / HTTPS / GitHub / Bundled without full-song play.
- **SC-003**: Blocked remote hosts show allowlist remediation in the panel.
- **SC-004**: Unknown bundled names fail validation / Check.
- **SC-005**: Unit (and/or desktop) tests cover relative-path Browse outcomes and Check success/failure messaging hooks; manual QA on a NES DMC demo song passes.

## Assumptions

- Specs 019/093 remote fetch IPC and Desktop `local:` FS bridges remain the sole load paths.
- `formatInstrumentSampleRef` / `parseInstrumentSampleRef` in app-core remain the composition API.
- Song directory is the primary relativization root (same mental model as `local:` resolve candidates).
- Feature 099 Live edit is available (or lands) for draft/writeback gating of Browse updates.

## Open questions

None blocking (Browse + Check + bundled validation + docs locked).

## References

- Issue: https://github.com/kadraman/beatbax/issues/234
- [021 instrument-editor-panel](../../complete/021-instrument-editor-panel/spec.md)
- [019 desktop-dmc-main-process-ipc](../../complete/019-desktop-dmc-main-process-ipc/spec.md)
- [093 desktop-remote-imports-ipc](../../complete/093-desktop-remote-imports-ipc/spec.md)
- [098 instrument-editor-preview-pitch](../098-instrument-editor-preview-pitch/spec.md)
- [099 instrument-editor-live-edit](../099-instrument-editor-live-edit/spec.md)
- [docs/chips/nes/composition_guide.md](../../../docs/chips/nes/composition_guide.md)
- [docs/grammar/import-security.md](../../../docs/grammar/import-security.md)
