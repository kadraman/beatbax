---
title: "Desktop developer tools opt-in and diagnostics log"
id: 91
slug: "desktop-devtools-and-diagnostics"
status: "specified"
authors:
  - "kadraman"
created: "2026-10-02"
updated: "2026-10-02"
issue: "https://github.com/kadraman/beatbax/issues/217"
area: "desktop"
related:
  - "specs/complete/053-electron-desktop-client/spec.md"
  - "specs/complete/057-settings-panel/spec.md"
  - "specs/complete/019-desktop-dmc-main-process-ipc/spec.md"
  - "docs/api/logger.md"
---

# Feature Specification: Desktop developer tools opt-in and diagnostics log

## Summary

Give packaged BeatBax Desktop builds a deliberate, documented way to diagnose problems:

1. Developer tools are **off by default** and can be turned on explicitly (Settings → Advanced, or a launch flag). When on, they are reachable from the menu and the usual shortcut on every platform.
2. The app writes a **diagnostics log file** that users can open from **Help → Open Logs Folder** and attach to bug reports, without needing developer tools.
3. The **startup error screen** gives instructions that work.

## Problem

Today the behaviour of developer tools in packaged builds is accidental rather than designed:

- The Ctrl+Shift+I / Alt+Cmd+I shortcuts are cancelled in packaged builds by a default in a third-party helper (`@electron-toolkit/utils`), not by a BeatBax decision.
- On Windows and Linux the native menu (which has **Toggle Developer Tools**) is hidden behind the custom title bar, and the custom **View** menu has no such item. On macOS the item exists in the native **View** menu but its shortcut does not work.
- The startup error screen says "Use View → Toggle Developer Tools for the full stack trace", which is impossible on Windows and Linux.
- Nothing is written to disk. Main-process and renderer errors go only to the console, so a user who hits a problem has nothing to attach to a bug report.
- Hiding developer tools is not a security boundary: `--remote-debugging-port` still exposes them. The real reason to keep them off by default is **scam resistance**: the developer tools console can call the Desktop bridge, including reading the saved AI API key, so a "paste this into the console" scam could steal it.

## User scenarios

### User Story 1 — Turn on developer tools deliberately (Priority: P1)

A plugin author, contributor, or user helping with a bug report needs the developer tools console in a packaged build.

**Why this priority**: there is currently no supported way to do this on Windows or Linux, and maintainers need it to diagnose user problems.

**Independent test**: in a packaged build, confirm developer tools cannot be opened by default; enable the setting; open them from the View menu and with the shortcut; disable the setting and confirm they close and cannot be reopened.

**Acceptance scenarios**:

1. **Given** a fresh packaged install, **When** the user presses Ctrl+Shift+I (Alt+Cmd+I on macOS) or looks in the View menu, **Then** developer tools do not open and no Toggle Developer Tools item is shown.
2. **Given** a packaged build, **When** the user turns on **Settings → Advanced → Diagnostics → Enable developer tools** and accepts the warning, **Then** **View → Toggle Developer Tools** appears and the shortcut works, without restarting.
3. **Given** developer tools are enabled and open, **When** the user turns the setting off, **Then** developer tools close, the menu item disappears, and the shortcut stops working.
4. **Given** a packaged build with the setting off, **When** the app is launched with `--devtools`, **Then** developer tools are available for that session only and the saved setting is unchanged.
5. **Given** a development build (`npm run dev`), **Then** behaviour is unchanged: developer tools open automatically and F12 toggles them.

### User Story 2 — Attach a log file to a bug report (Priority: P1)

A user hits an error (a crash, a playback failure, a sample that will not load) and wants to report it.

**Why this priority**: most users will never enable developer tools; a log file is the support path that works for everyone.

**Independent test**: trigger a playback error in a packaged build, choose Help → Open Logs Folder, and find the error in the log file with a timestamp and the app version.

**Acceptance scenarios**:

1. **Given** any build, **When** the user chooses **Help → Open Logs Folder**, **Then** the operating system file manager opens the BeatBax logs folder.
2. **Given** a playback error, an Output panel warning or error, an uncaught renderer error, or a main-process error, **Then** an entry with timestamp, level, source and message is appended to the log file.
3. **Given** the app starts, **Then** the log records one startup line with the BeatBax version, Electron version, and operating system.
4. **Given** the log file reaches its size limit, **Then** it is rotated and the previous file is kept, so the logs folder never grows without bound.

### User Story 3 — Startup error screen that helps (Priority: P2)

The renderer fails to start and the user sees the fatal error screen.

**Why this priority**: rare, but when it happens the current instructions are wrong and the app's own menus may not have rendered.

**Independent test**: force a renderer startup error and check the screen's buttons.

**Acceptance scenarios**:

1. **Given** the fatal error screen, **Then** it shows the error message and an **Open logs folder** button, and the error (with stack trace) has been written to the log.
2. **Given** the fatal error screen and developer tools are enabled, **Then** it also shows an **Open developer tools** button. When they are disabled, it says how to enable them (`--devtools` launch flag) instead of naming a menu item.

### Edge cases

- **Secure storage unavailable** (some Linux setups): unrelated to this feature; the developer tools setting does not use `safeStorage`.
- **Reset all settings** (Settings → Advanced → Danger zone): also turns developer tools off.
- **Settings file missing or corrupt**: treated as "off".
- **A renderer floods the log** (for example an error in an animation loop): entries are size-capped and rate-limited so the log cannot fill the disk; dropped entries are counted in a single summary line.
- **Log folder not writable**: the app keeps running; logging silently falls back to console only.
- **macOS**: the native View menu item follows the same rule as the custom menu (hidden when disabled).

## Requirements

### Functional requirements

**Developer tools**

- **FR-001**: In packaged builds, developer tools MUST be disabled by default.
- **FR-002**: The main process MUST be the single authority for whether developer tools are allowed. Shortcut handling, menu items, and the renderer's toggle request MUST all check it; a renderer request to open developer tools while disabled MUST be ignored.
- **FR-003**: Settings → Advanced → Diagnostics MUST provide an **Enable developer tools** toggle, persisted by the main process (not renderer `localStorage`), default off.
- **FR-004**: Turning the toggle on MUST first show a confirmation that explains the risk in plain language, including that pasting code into the console can expose the saved AI API key, and that the user should never paste code they do not understand.
- **FR-005**: Changes MUST take effect immediately: menus update, shortcuts start or stop working, and turning the setting off closes any open developer tools.
- **FR-006**: Launching with `--devtools` MUST enable developer tools for that session without changing the saved setting. While the flag is active, Settings MUST indicate that developer tools are enabled by the launch flag.
- **FR-007**: When enabled, **View → Toggle Developer Tools** MUST be present in the custom title-bar menu (Windows, Linux) and the native View menu (macOS), with shortcuts Ctrl+Shift+I and Alt+Cmd+I respectively. When disabled, the item MUST be hidden.
- **FR-008**: Development builds MUST keep current behaviour (auto-open, F12).
- **FR-009**: Blocking Ctrl+R / Cmd+R reload in packaged builds MUST be kept.

**Diagnostics log**

- **FR-010**: The main process MUST write a log file in the operating system's standard per-user logs location for the app.
- **FR-011**: The log MUST record: a startup line (BeatBax version, Electron version, OS); main-process warnings and errors; uncaught renderer errors and unhandled promise rejections; fatal startup errors with stack traces; playback errors; and Output panel messages of level warning or error.
- **FR-012**: The log MUST NOT contain API keys, authorization headers, AI prompts or responses, or song source text.
- **FR-013**: The log MUST rotate at a fixed size limit, keeping one previous file.
- **FR-014**: Renderer log entries MUST be size-capped per entry and rate-limited; dropped entries MUST be reported as a count.
- **FR-015**: **Help → Open Logs Folder** MUST be available on all platforms and in packaged and development builds.
- **FR-016**: Logging failures (for example an unwritable folder) MUST NOT crash the app or interrupt playback.

**Startup error screen**

- **FR-020**: The fatal error screen MUST show the error message and an **Open logs folder** button.
- **FR-021**: It MUST show **Open developer tools** only when developer tools are enabled; otherwise it MUST describe the `--devtools` launch flag instead of naming a menu item.

**Documentation**

- **FR-030**: User docs MUST describe where logs are kept, how to open them, how to enable developer tools, and the warning about pasting code.

### Non-goals

- Blocking `--remote-debugging-port` or other Chromium debugging switches. (Tracked as an open question.)
- Remote crash reporting or telemetry. Nothing leaves the user's machine.
- An in-app log viewer.
- Changing the debug overlay, the engine logger's levels, or `window.beatbaxDebug`.
- Web UI (`apps/web-ui`): browsers already provide developer tools; no change there.
- Making the AI API key unreadable from the renderer. That would be a separate security change to the Copilot design.

## Success criteria

- **SC-001**: In a packaged build with default settings, developer tools cannot be opened from the keyboard, menus, or renderer code.
- **SC-002**: With the setting on, developer tools open from the View menu and shortcut on Windows, Linux and macOS without a restart.
- **SC-003**: A forced playback error and a forced renderer error both appear in the log file, and Help → Open Logs Folder opens the folder containing it.
- **SC-004**: No log entry contains an API key or song source in automated tests that exercise those paths.
- **SC-005**: The fatal error screen contains no instructions that cannot be followed on the user's platform.

## Assumptions

- The audience is small and the self-XSS risk is low but real; a confirmation warning plus off-by-default is proportionate.
- Users can find and attach a file from a folder opened for them; no upload flow is needed.

## Open questions

1. Should packaged builds refuse to start with `--remote-debugging-port` (or quit) unless developer tools are enabled? Default for this spec: no (non-goal), because it is also a legitimate support route and cannot be fully prevented.
2. Should the log include engine `warn`-level messages beyond those already shown in the Output panel? Default: no, to keep the log readable.
3. Should the AI Copilot panel record request failures (status code, provider, model — never prompt content) in the log? Default: yes for errors only.

## References

- Electron security checklist: <https://www.electronjs.org/docs/latest/tutorial/security>
- Electron `webContents.devToolsWebContents`, `before-input-event`, `app.getPath('logs')`
- Discord's self-XSS mitigation (developer tools disabled by default in stable builds) as prior art for the opt-in approach
