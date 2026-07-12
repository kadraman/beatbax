import { app, BrowserWindow, nativeImage, shell, ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { addRecentFileEntry, attachWindowStateEvents, clearRecentFileEntries, registerDesktopIpcHandlers, openRecentFile, readRecentFiles } from './ipc-handlers';
import { installAppMenu } from './menu';
import type { AppMenuHandlers } from './menu';
import { readNativeMenuCheckState } from './menu-check-state';
import { resolvePreloadPath } from './resolve-preload';
import { IPC_CHANNELS } from '../shared/ipc';
import type { MenuAction } from '../shared/electron-api';

let mainWindow: BrowserWindow | null = null;
let windowCreation: Promise<void> | null = null;
let pendingStartupMenuAction: MenuAction | null = null;
let pendingOpenPaths: string[] = [];
let detachWindowStateEvents: (() => void) | null = null;

const isMac = process.platform === 'darwin';
const APP_DISPLAY_NAME = 'BeatBax';
const DEV_ICON_PATH = join(__dirname, '../../resources/icon.png');

if (is.dev) {
  app.setName(APP_DISPLAY_NAME);
}

const recentFilesPath = join(app.getPath('userData'), 'recent-files.json');

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
  const menuChecks = isMac && getMainWindow()
    ? await readNativeMenuCheckState(getMainWindow()!)
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
    window.webContents.send(IPC_CHANNELS.FILE_OPENED, payload);
    await refreshMenu();
  } catch (error) {
    console.error('Failed to open desktop file', error);
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
    },
  });

  if (!isMac) {
    mainWindow.setMenuBarVisibility(false);
  }

  detachWindowStateEvents?.();
  detachWindowStateEvents = attachWindowStateEvents(mainWindow);

  mainWindow.webContents.on('preload-error', (_event, path, error) => {
    console.error('Preload script failed:', path, error);
  });
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error('Renderer failed to load:', code, description, url);
  });

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
  configureMacDevDockIcon();
  electronApp.setAppUserModelId('com.beatbax.desktop');

  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('beatbax', process.execPath, [join(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient('beatbax');
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  queueStartupSongPaths();

  registerDesktopIpcHandlers({
    getWindow: getMainWindow,
    recentFilesPath,
    onRecentFilesChanged: () => {
      void refreshMenu();
    },
  });

  ipcMain.on(IPC_CHANNELS.FILE_OPENED_REQUEST, (_event, filePath: string) => {
    void sendOpenedFile(filePath);
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
