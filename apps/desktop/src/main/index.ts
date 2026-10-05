import { app, BrowserWindow, nativeImage, shell, ipcMain, session } from 'electron';
import { existsSync } from 'node:fs';
import os from 'node:os';
import { join, resolve, isAbsolute } from 'node:path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { addRecentFileEntry, attachWindowStateEvents, clearRecentFileEntries, registerDesktopIpcHandlers, openLogsFolder, openRecentFile, readRecentFiles } from './ipc-handlers';
import { createDevToolsPolicy } from './devtools-policy';
import { createDiagnosticsLog, logDiagnostics, setDiagnosticsLog } from './diagnostics-log';
import { installAppMenu } from './menu';
import type { AppMenuHandlers } from './menu';
import { readNativeMenuCheckState } from './menu-check-state';
import { resolvePreloadPath } from './resolve-preload';
import {
  ensureMacExampleSongsInDocuments,
  resolveBundledSongsDir,
  resolveMacExampleSongsDir,
} from './path-utils';
import { IPC_CHANNELS } from '../shared/ipc';
import type { DesktopFilePayload, MenuAction } from '../shared/electron-api';

let mainWindow: BrowserWindow | null = null;
let windowCreation: Promise<void> | null = null;
let pendingStartupMenuAction: MenuAction | null = null;
let pendingOpenPaths: string[] = [];
let lastOpenedPayload: DesktopFilePayload | null = null;
let detachWindowStateEvents: (() => void) | null = null;

const isMac = process.platform === 'darwin';
const APP_DISPLAY_NAME = 'BeatBax';
const DEV_ICON_PATH = join(__dirname, '../../resources/icon.png');

// Disable WinRT MIDI before any other app init. Must run before app ready.
// Chromium's WinRT backend can leave navigator.requestMIDIAccess() pending forever.
if (process.platform === 'win32') {
  const existing = app.commandLine.getSwitchValue('disable-features');
  const features = new Set(
    existing
      ? existing.split(',').map((f) => f.trim()).filter(Boolean)
      : [],
  );
  features.add('MidiManagerWinrt');
  app.commandLine.appendSwitch('disable-features', [...features].join(','));
}

function isMidiPermission(permission: string): boolean {
  // Chromium asks for `midiSysex` even when requestMIDIAccess({ sysex: false }).
  // JS still gets sysexEnabled=false; denying midiSysex blocks all Web MIDI.
  return permission === 'midi' || permission === 'midiSysex';
}

function installMidiPermissionHandlers(targetSession: Electron.Session): void {
  targetSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(isMidiPermission(permission));
  });
  targetSession.setPermissionCheckHandler((_wc, permission) => {
    return isMidiPermission(permission);
  });
}

if (is.dev) {
  app.setName(APP_DISPLAY_NAME);
}

const recentFilesPath = join(app.getPath('userData'), 'recent-files.json');

const devToolsDevelopment = !app.isPackaged && process.env.BEATBAX_E2E_PACKAGED_DEVTOOLS_POLICY !== '1';
const devToolsPolicy = createDevToolsPolicy({
  settingsPath: join(app.getPath('userData'), 'desktop-diagnostics.json'),
  development: devToolsDevelopment,
  launchFlag: app.commandLine.hasSwitch('devtools'),
  onChange: (state) => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.DEVTOOLS_STATE_CHANGED, state);
    void refreshMenu();
  },
});

function initDiagnosticsLog(): void {
  app.setAppLogsPath(process.env.BEATBAX_E2E_LOGS_DIR || undefined);
  setDiagnosticsLog(createDiagnosticsLog({ dir: app.getPath('logs') }));
  logDiagnostics(
    'info',
    'startup',
    `BeatBax ${app.getVersion()} (Electron ${process.versions.electron}, ${process.platform} ${os.release()} ${process.arch})`,
  );
}

// `uncaughtExceptionMonitor` observes without replacing Electron's default error dialog.
process.on('uncaughtExceptionMonitor', (error) => {
  logDiagnostics('error', 'main', 'Uncaught exception', error);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection in main process:', reason);
  logDiagnostics('error', 'main', 'Unhandled promise rejection', reason);
});
app.on('render-process-gone', (_event, _webContents, details) => {
  if (details.reason === 'clean-exit') return;
  logDiagnostics('error', 'main', `Renderer process gone: ${details.reason} (exit code ${details.exitCode})`);
});
app.on('child-process-gone', (_event, details) => {
  if (details.reason === 'clean-exit') return;
  logDiagnostics(
    'error',
    'main',
    `Child process gone: ${details.name ?? details.type} ${details.reason} (exit code ${details.exitCode})`,
  );
});

function getMainWindow(): BrowserWindow | null {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  return mainWindow;
}

async function ensureMainWindow(): Promise<BrowserWindow | null> {
  if (getMainWindow()) return mainWindow;
  if (!windowCreation) {
    windowCreation = createWindow().finally(() => {
      windowCreation = null;
    });
  }
  await windowCreation;
  return getMainWindow();
}

function dispatchMenuAction(action: MenuAction): void {
  void (async () => {
    try {
      const recreating = !getMainWindow();
      if (recreating) {
        pendingStartupMenuAction = action;
      }
      const window = await ensureMainWindow();
      if (!window) {
        pendingStartupMenuAction = null;
        return;
      }
      if (recreating) return;
      window.webContents.send(IPC_CHANNELS.MENU_ACTION, action);
    } catch (error) {
      pendingStartupMenuAction = null;
      console.error('Failed to dispatch menu action', action, error);
      logDiagnostics('error', 'main', `Failed to dispatch menu action ${action}`, error);
    }
  })();
}

const menuHandlers: AppMenuHandlers = {
  getWindow: getMainWindow,
  onMenuAction: dispatchMenuAction,
  onOpenRecent: (filePath) => {
    void sendOpenedFile(filePath);
  },
  onClearRecent: () => {
    void clearRecentFileEntries(recentFilesPath).then(refreshMenu);
  },
  isDevToolsAllowed: () => devToolsPolicy.isAllowed(),
  onToggleDevTools: () => devToolsPolicy.toggle(getMainWindow()),
  onOpenLogsFolder: () => {
    void openLogsFolder().catch((error) => logDiagnostics('warn', 'main', 'Could not open logs folder', error));
  },
};

function configureMacDevDockIcon(): void {
  if (!is.dev || !isMac || !app.dock) return;
  const candidates = [DEV_ICON_PATH, icon];
  for (const candidate of candidates) {
    if (!candidate || !existsSync(candidate)) continue;
    const dockIcon = nativeImage.createFromPath(candidate);
    if (!dockIcon.isEmpty()) {
      app.dock.setIcon(dockIcon);
      return;
    }
  }
}

async function refreshMenu(): Promise<void> {
  const window = getMainWindow();
  const menuChecks = isMac && window
    ? await readNativeMenuCheckState(window)
    : undefined;
  installAppMenu(await readRecentFiles(recentFilesPath), menuHandlers, menuChecks);
}

async function sendOpenedFile(filePath: string): Promise<void> {
  const window = getMainWindow();
  if (!window) {
    pendingOpenPaths.push(filePath);
    await ensureMainWindow();
    return;
  }

  try {
    const payload = await openRecentFile(window, filePath);
    await addRecentFileEntry(recentFilesPath, payload.path);
    lastOpenedPayload = {
      path: payload.path,
      name: payload.name,
      data: Uint8Array.from(payload.data),
    };
    window.webContents.send(IPC_CHANNELS.FILE_OPENED, {
      path: payload.path,
      name: payload.name,
      data: Uint8Array.from(payload.data),
    });
    await refreshMenu();
  } catch (error) {
    console.error('Failed to open desktop file', error);
    logDiagnostics('error', 'main', 'Failed to open desktop file', error);
  }
}

async function flushPendingOpenPaths(): Promise<void> {
  if (!getMainWindow()) return;
  const queuedPaths = [...pendingOpenPaths];
  pendingOpenPaths = [];
  for (const filePath of queuedPaths) {
    await sendOpenedFile(filePath);
  }
}

function queueStartupSongPaths(): void {
  for (const arg of process.argv) {
    if (!/\.(bax|uge)$/i.test(arg)) continue;
    const resolved = isAbsolute(arg) ? arg : resolve(process.cwd(), arg);
    if (existsSync(resolved)) {
      pendingOpenPaths.push(resolved);
    }
  }
}

async function createWindow(): Promise<void> {
  const preloadPath = resolvePreloadPath(__dirname);
  const startupMenuAction = pendingStartupMenuAction;
  pendingStartupMenuAction = null;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'BeatBax',
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: 12, y: 11 },
        }
      : { frame: false }),
    ...(process.platform !== 'darwin' ? { icon } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  if (!isMac) {
    mainWindow.setMenuBarVisibility(false);
  }

  detachWindowStateEvents?.();
  detachWindowStateEvents = attachWindowStateEvents(mainWindow);

  mainWindow.webContents.on('preload-error', (_event, path, error) => {
    console.error('Preload script failed:', path, error);
    logDiagnostics('error', 'main', `Preload script failed: ${path}`, error);
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error('Renderer failed to load:', code, description, url);
    logDiagnostics('error', 'main', `Renderer failed to load: ${code} ${description} ${url}`);
  });

  // Web MIDI requires explicit session permission handlers in Electron.
  // Without these, navigator.requestMIDIAccess() can hang indefinitely
  // (Chromium waits for a prompt that never appears).
  installMidiPermissionHandlers(mainWindow.webContents.session);

  mainWindow.on('ready-to-show', () => {
    configureMacDevDockIcon();
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    detachWindowStateEvents?.();
    detachWindowStateEvents = null;
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    const rendererUrl = new URL(process.env.ELECTRON_RENDERER_URL);
    if (startupMenuAction) {
      rendererUrl.searchParams.set('desktopAction', startupMenuAction);
    }
    await mainWindow.loadURL(rendererUrl.toString());
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(
      join(__dirname, '../renderer/index.html'),
      startupMenuAction ? { query: { desktopAction: startupMenuAction } } : undefined,
    );
  }

  await refreshMenu();
  await flushPendingOpenPaths();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.whenReady().then(async () => {
  initDiagnosticsLog();
  configureMacDevDockIcon();
  electronApp.setAppUserModelId('com.beatbax.desktop');
  installMidiPermissionHandlers(session.defaultSession);

  // Packaged macOS: copy examples to Documents so File → Open can open them
  // (NSOpenPanel cannot navigate into BeatBax.app/Contents/Resources/songs).
  if (isMac && app.isPackaged) {
    ensureMacExampleSongsInDocuments(
      resolveBundledSongsDir(__dirname, true),
      resolveMacExampleSongsDir(app.getPath('documents')),
      app.getVersion(),
    );
  }

  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('beatbax', process.execPath, [join(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient('beatbax');
  }

  await devToolsPolicy.load();
  app.on('browser-window-created', (_, window) => {
    if (devToolsDevelopment) optimizer.watchWindowShortcuts(window);
    devToolsPolicy.attachToWindow(window);
  });

  queueStartupSongPaths();

  registerDesktopIpcHandlers({
    getWindow: getMainWindow,
    recentFilesPath,
    onRecentFilesChanged: () => {
      void refreshMenu();
    },
    devToolsPolicy,
  });

  ipcMain.on(IPC_CHANNELS.FILE_OPENED_REQUEST, (_event, filePath?: string) => {
    if (typeof filePath === 'string' && filePath.trim()) {
      void sendOpenedFile(filePath);
      return;
    }
    const window = getMainWindow();
    if (window && lastOpenedPayload) {
      window.webContents.send(IPC_CHANNELS.FILE_OPENED, {
        path: lastOpenedPayload.path,
        name: lastOpenedPayload.name,
        data: Uint8Array.from(lastOpenedPayload.data),
      });
    }
  });

  ipcMain.on(IPC_CHANNELS.MENU_REFRESH_REQUEST, () => {
    void refreshMenu();
  });

  await createWindow();

  app.on('activate', async () => {
    configureMacDevDockIcon();
    const window = await ensureMainWindow();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
});

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  void sendOpenedFile(filePath);
});

app.on('second-instance', (_event, argv) => {
  const openedPath = argv.find((arg) => /\.(bax|uge)$/i.test(arg));
  if (openedPath) {
    void sendOpenedFile(openedPath);
  }

  void (async () => {
    const window = await ensureMainWindow();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  })();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
