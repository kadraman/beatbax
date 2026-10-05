# BeatBax Desktop troubleshooting

How to collect information for a bug report, and how to turn on developer tools when you need to look deeper.

## The diagnostics log

BeatBax Desktop writes warnings and errors to a log file. Attach it to bug reports.

Open it with **Help → Open Logs Folder**. The folder is also linked from the startup error screen.

| Platform | Log folder |
|----------|-----------|
| macOS | `~/Library/Logs/BeatBax/` |
| Windows | `%APPDATA%\BeatBax\logs\` |
| Linux | `~/.config/BeatBax/logs/` |

The current file is `beatbax.log`. When it reaches 1 MiB it is renamed to `beatbax.old.log` (replacing the previous one) and a new file starts, so the folder never holds more than about 2 MiB.

Each entry is one line, with stack traces on indented lines below it:

```text
2026-10-02T19:14:03.123Z [info] [startup] BeatBax 0.3.0 (Electron 38.2.0, darwin 25.5.0 arm64)
2026-10-02T19:14:09.481Z [warn] [playback] NES DMC: failed to load sample 'https://example.com/snare.dmc': Remote asset host 'example.com' is not in the Desktop allowlist.
2026-10-02T19:15:22.007Z [error] [renderer] Cannot read properties of undefined (reading 'length')
  TypeError: Cannot read properties of undefined (reading 'length')
  at render (index.js:1:2345)
```

### What is logged

- One startup line with the BeatBax, Electron, and operating system versions.
- Uncaught errors and unhandled promise rejections in the app's main process and window, with stack traces.
- Window and helper process crashes.
- Playback and export errors, and warnings or errors shown in the Output panel (for example DMC sample-load failures).
- File, watcher, and menu failures that the app already reports to its console.
- Copilot request failures: the HTTP status, the provider host, and the model name.

### What is not logged

- Song text. Parse errors and validation results are not logged, because they quote the song and update while you type.
- Copilot prompts, replies, and provider error bodies.
- API keys. The saved AI API key, `Authorization`/`Bearer` values, and `sk-` style keys are replaced with `[redacted]` before anything is written.

The log records warnings and errors regardless of the console log level set with `window.beatbaxDebug` (see [Logger](../api/logger.md)). The log is size-limited and rate-limited, and if the folder cannot be written BeatBax carries on and logs to the console only.

## Developer tools

Developer tools are **off by default** in installed builds. The developer tools console can call BeatBax's internal APIs, including the one that reads your saved AI API key, so "paste this into the console" scams could steal it.

> Never paste code into the developer tools console unless you wrote it or fully understand it.

### Turn them on

**Settings → Advanced → Diagnostics → Enable developer tools.** Confirm the warning. The setting is saved, and you can turn it on and off without restarting:

- **View → Toggle Developer Tools** appears in the menu.
- The shortcut works: Ctrl+Shift+I on Windows and Linux, Alt+Cmd+I on macOS.
- Turning the setting off closes developer tools if they are open.

**Settings → Advanced → Reset all settings** also turns developer tools off.

### For one session only: `--devtools`

Start BeatBax with the `--devtools` launch flag to allow developer tools until you quit, without changing the saved setting. Use this when the app cannot reach Settings, for example when it fails to start.

| Platform | Command |
|----------|---------|
| macOS | `open -a BeatBax --args --devtools` |
| Windows | `"%LOCALAPPDATA%\Programs\BeatBax\BeatBax.exe" --devtools` (adjust the path if you installed elsewhere, or add the flag to a shortcut's Target) |
| Linux (AppImage) | `./BeatBax-<version>.AppImage --devtools` |
| Linux (`.deb`) | `/opt/BeatBax/BeatBax --devtools` |

Settings → Advanced shows "Enabled for this session by the --devtools launch flag." while the flag is in effect.

### Development builds

`npm run desktop:dev` always allows developer tools, opens them on startup, and keeps F12 as a shortcut. The Settings toggle is shown as on and cannot be changed.

## Startup error screen

If the app's window fails to start, BeatBax shows the error message, an **Open logs folder** button, and, when developer tools are allowed, an **Open developer tools** button. Otherwise it explains how to restart with `--devtools`. The error and its stack trace are written to the log.

## Last resort for maintainers: remote debugging

Chromium's `--remote-debugging-port=<port>` flag still works and is not blocked. It opens a debugging port on your machine that other local programs can connect to, so prefer the log and `--devtools`, and only use it when a maintainer asks.
