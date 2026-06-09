import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { join } from 'node:path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { addRecentFileEntry, attachWindowStateEvents, registerDesktopIpcHandlers, openRecentFile, readRecentFiles } from './ipc-handlers';
import { installAppMenu } from './menu';
import { resolvePreloadPath } from './resolve-preload';
import { IPC_CHANNELS } from '../shared/ipc';

let mainWindow: BrowserWindow | null = null;
let pendingOpenPaths: string[] = [];
let detachWindowStateEvents: (() => void) | null = null;

const isMac = process.platform === 'darwin';

const recentFilesPath = join(app.getPath('userData'), 'recent-files.json');

async function refreshMenu(): Promise<void> {
  if (!mainWindow) return;
  installAppMenu(mainWindow, await readRecentFiles(recentFilesPath));
}

async function sendOpenedFile(filePath: string): Promise<void> {
  if (!mainWindow) {
    pendingOpenPaths.push(filePath);
    return;
  }

  try {
    const payload = await openRecentFile(mainWindow, filePath);
    await addRecentFileEntry(recentFilesPath, payload.path);
    mainWindow.webContents.send(IPC_CHANNELS.FILE_OPENED, payload);
    await refreshMenu();
  } catch (error) {
    console.error('Failed to open desktop file', error);
  }
}

async function flushPendingOpenPaths(): Promise<void> {
  if (!mainWindow) return;
  const queuedPaths = [...pendingOpenPaths];
  pendingOpenPaths = [];
  for (const filePath of queuedPaths) {
    await sendOpenedFile(filePath);
  }
}

async function createWindow(): Promise<void> {
  const preloadPath = resolvePreloadPath(__dirname);

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
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
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

  ipcMain.removeAllListeners(IPC_CHANNELS.FILE_OPENED_REQUEST);
  ipcMain.on(IPC_CHANNELS.FILE_OPENED_REQUEST, (_event, filePath: string) => {
    void sendOpenedFile(filePath);
  });

  registerDesktopIpcHandlers({
    window: mainWindow,
    recentFilesPath,
    onRecentFilesChanged: () => {
      void refreshMenu();
    },
  });

  await refreshMenu();

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  await flushPendingOpenPaths();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.whenReady().then(async () => {
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

  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
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

  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
