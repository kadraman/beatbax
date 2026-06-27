---
title: "Desktop Web UI Retirement"
status: proposed
authors: ["kadraman"]
created: 2026-06-24
related:
  - docs/features/desktop-client-enhancements.md
  - docs/features/complete/desktop-first-client-split.md
---

## Summary

Retire the transitional `apps/desktop/src/renderer/src/desktop-web-ui` directory by replacing its remaining DOM-oriented web-ui copies with desktop-owned React components, shared utilities, or small desktop renderer modules.

This is a follow-on cleanup after Phase 5b's native React panel migration. The goal is not to change desktop behavior or visuals; it is to remove the compatibility layer that was copied from `apps/web-ui/src` when the desktop renderer stopped importing `@web-ui/*` directly.

## Problem Statement

`desktop-web-ui` still contains copied shell and utility code that desktop depends on:

- Settings section builders used by `DesktopSettingsModal`.
- Shell helpers for tabs, layout, menus, status bar, shortcuts, modals, theme management, loading overlays, and full IDE setup.
- Small utility modules for icons, meter display, chip resolution, asset URLs, keyboard shortcuts, and error handling.
- Legacy CSS imported by the desktop renderer.

This keeps the desktop build independent from `apps/web-ui`, but it also leaves a confusing boundary: the folder name implies web-ui ownership even though the code now lives inside the desktop app. It also makes it harder to see which pieces are native React, which are copied legacy DOM code, and which should become shared packages.

## Goals

- Delete `apps/desktop/src/renderer/src/desktop-web-ui`.
- Preserve the current desktop UI behavior, keyboard shortcuts, panel visibility, persistence, and Playwright coverage.
- Move reusable non-UI helpers into clearly named shared or desktop-owned modules.
- Convert remaining user-facing shell pieces to native desktop React where practical.
- Avoid reintroducing direct desktop imports from `apps/web-ui/src` or `@web-ui/*`.

## Non-Goals

- Do not redesign the desktop UI.
- Do not flatten `apps/desktop/src/renderer/src` as part of this work.
- Do not merge desktop and web-lite UI implementations back together.
- Do not publish new shared packages unless a module is genuinely reusable outside desktop.

## Proposed Solution

Treat `desktop-web-ui` as a temporary migration source and retire it in small slices. Each slice should move one category of modules to its final home, update imports, and remove the old files once unused.

Prefer these destinations:

| Current content | Target destination |
|-----------------|--------------------|
| Tiny renderer helpers used only by desktop | `apps/desktop/src/renderer/src/lib` or `apps/desktop/src/renderer/src/utils` |
| React-friendly shared design metadata | `packages/ui-tokens` |
| Desktop shell UI | `apps/desktop/src/renderer/src/components` |
| Desktop shell orchestration | `apps/desktop/src/renderer/src/lib` |
| Legacy settings DOM builders | React components under `apps/desktop/src/renderer/src/components/settings` |
| Legacy CSS | Component-scoped desktop CSS plus `@beatbax/ui-tokens/tokens.css` |

## Implementation Plan

### Phase 1 — Inventory and Boundaries

Create a short inventory of every `desktop-web-ui` import and classify it as:

- `move`: small utility or type that can be relocated without behavioral change.
- `convert`: DOM UI code that should become React.
- `delete`: unused module.
- `defer`: module that is still entangled with shell orchestration and needs a later slice.

Acceptance criteria:

- A tracked checklist exists in this document or the implementation PR.
- `rg "desktop-web-ui" apps/desktop/src/renderer/src` is the source of truth for remaining dependencies.
- No new `desktop-web-ui` imports are added during the migration.

Current inventory:

| Dependency area | Current imports | Classification | Target / status |
|-----------------|-----------------|----------------|-----------------|
| Small desktop utility helpers | `utils/icons.ts`, `utils/meter-display.ts`, `utils/keyboard-shortcuts.ts`, `utils/error-boundary.ts` | `done` | Moved to `apps/desktop/src/renderer/src/utils`; direct desktop-owned imports updated and old copied utility files removed. |
| Shell asset/chip helpers | `utils/app-asset-url.ts`, `utils/chip-resolve.ts`, `utils/icons.ts` via desktop shell modules | `done` | Shell modules now import desktop-owned utility paths; old copied helper files removed. |
| Settings sections | `components/settings/*.tsx` from `DesktopSettingsModal.tsx` | `done` | Converted to desktop-owned React components; no DOM builders remain in the desktop settings modal. |
| Shell tabs/modals/layout/status/theme/menu/loading/debug overlay | `components/shell/*`, `components/workspace/rotary-knob.ts`, `lib/theme-manager.ts` | `done` | Relocated from `desktop-web-ui`; desktop shell imports updated. |
| Full IDE/editor wiring | `lib/full-ide-setup.ts`, `lib/editor-view-prefs.ts` | `done` | Moved into desktop renderer services; callers no longer import copied web-ui paths. |
| MIDI step entry | `lib/midi-step-entry-controller.ts` | `done` | Moved with desktop editor integration; `full-ide-setup` wires it through explicit dependencies. |
| Legacy stylesheet | `main.tsx` imports desktop-owned `styles.css` | `done` | Moved copied stylesheet rules into `apps/desktop/src/renderer/src/styles.css`; no `desktop-web-ui` stylesheet import remains. |
| Phase 4 copied utility and shell leftovers | `utils/icons.ts`, `utils/app-asset-url.ts`, `utils/chip-resolve.ts`, `ui/debug-overlay.ts` | `done` | Deleted or relocated; no Phase 4 shell/helper files remain under `desktop-web-ui`. |

### Phase 2 — Move Small Utilities

Move low-risk helpers first:

- `utils/icons.ts`
- `utils/meter-display.ts`
- `utils/app-asset-url.ts`
- `utils/chip-resolve.ts`
- type-only shortcut descriptors if separable

Suggested destinations:

- `apps/desktop/src/renderer/src/utils/icons.ts`
- `apps/desktop/src/renderer/src/utils/meter-display.ts`
- `apps/desktop/src/renderer/src/utils/app-asset-url.ts`
- `apps/desktop/src/renderer/src/utils/chip-resolve.ts`

Acceptance criteria:

- Native React panels import utilities from desktop-owned `utils` paths.
- No behavior changes in Visualizer, Channel Mixer, Toolbar, or Copilot.
- Desktop typecheck passes.

### Phase 3 — React Settings Sections

Replace the settings section DOM builders with React components owned by the desktop renderer.

Current dependency:

- Historical: `DesktopSettingsModal.tsx` imported builders from `desktop-web-ui/panels/settings-sections/*`.
- Current: settings sections are desktop-owned React components rendered directly by `DesktopSettingsModal.tsx`.

Target shape:

- `components/settings/general.tsx`
- `components/settings/editor.tsx`
- `components/settings/playback.tsx`
- `components/settings/features.tsx`
- `components/settings/plugins.tsx`
- `components/settings/ai.tsx`
- `components/settings/advanced.tsx`

Acceptance criteria:

- Settings tabs remain visually equivalent.
- Reset defaults behavior still works per section.
- AI API key remains stored via desktop secure IPC and never persisted in `localStorage`.
- Feature toggles still update panels, menus, shortcuts, and persisted flags.
- Existing settings/copilot Playwright coverage passes.

### Phase 4 — Desktop Shell Components

Replace or relocate shell UI currently copied from web-ui:

- `app/tabs.ts`
- `app/modals.ts`
- `ui/layout.ts`
- `ui/menu-bar.ts`
- `ui/status-bar.ts`
- `ui/panels-menu.ts`
- `ui/theme-manager.ts`
- `ui/loading-overlay.ts`
- `utils/keyboard-shortcuts.ts`
- `utils/error-boundary.ts`

Target shape:

- React shell components live under `components/workspace` and `components/shell`.
- Imperative orchestration lives under `lib`.
- Keyboard shortcut registration exposes typed descriptors and handlers independent of DOM classes.

Acceptance criteria:

- Desktop menu actions and shortcuts still work.
- Right/bottom tab state, close buttons, active tab persistence, and panel toggles remain stable.
- Theme switching and status bar updates remain stable.
- Help, About, New Song Wizard, and shortcut modal behavior remains covered by e2e or focused unit tests.

Status:

- Relocated `tabs`, `modals`, `about-modal`, `new-song-wizard`, `layout`, `menu-bar`, `status-bar`, `panels-menu`, `loading-overlay`, and `debug-overlay` to `components/shell`.
- Relocated `theme-manager` to `lib/theme-manager.ts`.
- Relocated `rotary-knob` to `components/workspace/rotary-knob.ts` so the React transport bar no longer imports from `desktop-web-ui`.
- Desktop shortcut metadata now lives in `lib/desktop-shortcut-descriptors.ts`; `register-shortcuts.ts` attaches desktop-specific handlers separately so keybindings remain client-specific.
- Remaining `desktop-web-ui` import after Phase 5 is the Phase 6 stylesheet ownership work.

### Phase 5 — Full IDE Setup and Editor Integration

Untangle the largest orchestration module:

- `app/full-ide-setup.ts`
- `app/editor-view-prefs.ts`
- `input/midi-step-entry-controller.ts`

Move editor and playback wiring into desktop-owned renderer services with explicit dependencies passed in from `DesktopWorkspaceShell` or `desktop-workspace.ts`.

Acceptance criteria:

- Playback, live mode, loop mode, BPM, master volume, and transport display updates remain synchronized.
- Editor view preferences and comments folding remain stable.
- MIDI step entry still works when enabled.
- No renderer service depends on copied web-ui paths.

Status:

- Moved `full-ide-setup.ts`, `editor-view-prefs.ts`, and `midi-step-entry-controller.ts` into `apps/desktop/src/renderer/src/lib`.
- Updated desktop workspace, editor setup, and menu bar callers to use desktop-owned `lib` imports.
- Deleted the old copied Phase 5 files from `desktop-web-ui`; only the Phase 6 stylesheet remains in that folder.

### Phase 6 — CSS Retirement

Remove `desktop-web-ui/styles.css` by moving required styles into:

- `apps/desktop/src/renderer/src/styles.css`
- component-specific desktop CSS sections
- `@beatbax/ui-tokens/tokens.css` for shared variables only

Acceptance criteria:

- `main.tsx` no longer imports `./desktop-web-ui/styles.css`.
- Desktop visual smoke tests remain stable.
- Web-lite styles are not imported into desktop.
- No broad CSS rewrite or class rename is required unless a component has already moved to React.

Status:

- Moved the remaining `desktop-web-ui/styles.css` rules into `apps/desktop/src/renderer/src/styles.css`.
- Removed the `main.tsx` import of `./desktop-web-ui/styles.css`; `main.tsx` now imports tokens followed by the desktop-owned stylesheet.
- Removed the old stylesheet file from `desktop-web-ui`.

### Phase 7 — Delete Directory

When all imports are gone:

1. Delete `apps/desktop/src/renderer/src/desktop-web-ui`.
2. Run `rg "desktop-web-ui" apps/desktop`.
3. Run desktop typecheck, build, and focused e2e.
4. Update docs that mention the transitional folder.

Acceptance criteria:

- `rg "desktop-web-ui" apps/desktop` returns no source imports.
- `npm -w @beatbax/desktop run typecheck` passes.
- `npm -w @beatbax/desktop run build` passes.
- Desktop Playwright smoke tests pass locally or in CI.

## Testing Strategy

### Unit and Type Tests

- Run desktop typecheck after each slice.
- Add focused unit tests only when moving logic with meaningful behavior, such as shortcut registration, settings reset behavior, or editor preference persistence.

### E2E Tests

Keep the current desktop e2e suite green and expand only where migration risk is high:

- Settings modal and Copilot panel.
- Help tab and shortcut modal.
- Channel Mixer and Song Visualizer.
- Toolbar, transport, playback, save, export, and panel toggles.

### Manual QA

Before deleting the directory, perform a short desktop smoke pass:

- Open a song, play/stop, adjust BPM and master volume.
- Toggle every panel from the Panels menu.
- Open Settings, change a feature flag, reset defaults.
- Switch theme.
- Use Help/About/New Song Wizard.

## Migration Checklist

- [x] Inventory all `desktop-web-ui` imports.
- [x] Move small utility helpers to desktop renderer utilities.
- [x] Convert settings section builders to React components.
- [x] Replace or relocate tabs, panels menu, layout, status bar, menu bar, theme manager, modals, loading overlay, and shortcut helpers.
- [x] Move full IDE setup, editor view preferences, and MIDI step entry into desktop-owned services.
- [x] Remove `desktop-web-ui/styles.css` import.
- [ ] Delete `apps/desktop/src/renderer/src/desktop-web-ui`.
- [ ] Update documentation and verify desktop build/e2e.

## Risks

- Shell helpers are widely connected to menus, shortcuts, editor setup, and persistence, so broad rewrites can create regressions.
- Settings sections include secure AI key handling and feature toggles; these should be migrated carefully.
- CSS removal can cause large visual diffs if done before React components own their markup.
- Moving modules without improving boundaries can simply rename the compatibility layer rather than retire it.

## Open Questions

- Should `RotaryKnob` remain a desktop-only component or move into a shared UI package later?
   - Proposal: Move it into a shared UI component directory.
- Should keyboard shortcut descriptors become app-core metadata, or remain desktop renderer concerns?
   - Proposal: see Keyboard shortcut ownership section
- Should `@beatbax/ui-tokens` include icon/channel presentation helpers, or stay limited to tokens and channel metadata?
   - Proposal: for now keep `@beatbax/ui-tokens` limited to tokens and static channel metadata. Put icon rendering and app-specific presentation helpers in the consuming app or a separate shared UI package if they become truly reusable.

## References

- `apps/desktop/src/renderer/src/desktop-web-ui`
- `apps/desktop/src/renderer/src/lib/desktop-workspace.ts`
- `apps/desktop/src/renderer/src/components/panels/DesktopSettingsModal.tsx`
- `apps/desktop/src/renderer/src/main.tsx`
- `docs/features/desktop-client-enhancements.md`
