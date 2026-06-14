import { app, dialog, ipcMain, shell } from 'electron';
import { existsSync as fsExistsSync, readFileSync as fsReadFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc';
import type {
  DesktopFilePayload,
  DesktopOpenFileOptions,
  DesktopSaveFileOptions,
} from '../shared/electron-api';
import { resolveBundledSongsDir } from './path-utils';

const TEXT_FILE_FILTERS = [
  { name: 'BeatBax Songs', extensions: ['bax', 'uge', 'txt'] },
  { name: 'All Files', extensions: ['*'] },
];

/** Normalize IPC file payloads (Uint8Array, Buffer, or serialized arrays) for fs.writeFile. */
function toFileBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (Array.isArray(data)) return Buffer.from(data);
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    if (record.type === 'Buffer' && Array.isArray(record.data)) {
      return Buffer.from(record.data as number[]);
    }
    const bytes = Object.values(record).filter((v): v is number => typeof v === 'number');
    if (bytes.length > 0) return Buffer.from(bytes);
  }
  throw new Error('Invalid file payload type.');
}

const RECENT_FILES_LIMIT = 10;

export interface DesktopIpcHandlersOptions {
  window: BrowserWindow;
  recentFilesPath: string;
  onRecentFilesChanged?: () => void;
}

function assertAbsoluteFilePath(targetPath: string): string {
  if (!path.isAbsolute(targetPath)) {
    throw new Error('Expected an absolute file path.');
  }
  if (targetPath.split(/[/\\]/).some((segment) => segment === '..')) {
    throw new Error('Path traversal is not allowed.');
  }
  return path.resolve(targetPath);
}

async function readFilePayload(filePath: string): Promise<DesktopFilePayload> {
  const safePath = assertAbsoluteFilePath(filePath);
  const data = new Uint8Array(await fs.readFile(safePath));
  return {
    path: safePath,
    name: path.basename(safePath),
    data,
  };
}

async function readRecentFiles(recentFilesPath: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(recentFilesPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

async function writeRecentFiles(recentFilesPath: string, recentFiles: string[]): Promise<void> {
  await fs.mkdir(path.dirname(recentFilesPath), { recursive: true });
  await fs.writeFile(recentFilesPath, JSON.stringify(recentFiles, null, 2), 'utf8');
}

export function mergeRecentFiles(existing: string[], filePath: string): string[] {
  const safePath = assertAbsoluteFilePath(filePath);
  return [safePath, ...existing.filter((entry) => entry !== safePath)].slice(0, RECENT_FILES_LIMIT);
}

export function readFileSyncSafe(targetPath: string, encoding: BufferEncoding = 'utf-8'): string {
  return fsReadFileSync(assertAbsoluteFilePath(targetPath), encoding);
}

export function existsSyncSafe(targetPath: string): boolean {
  try {
    return fsExistsSync(assertAbsoluteFilePath(targetPath));
  } catch {
    return false;
  }
}

export async function addRecentFileEntry(recentFilesPath: string, filePath: string): Promise<string[]> {
  const safePath = assertAbsoluteFilePath(filePath);
  const recentFiles = mergeRecentFiles(await readRecentFiles(recentFilesPath), safePath);
  await writeRecentFiles(recentFilesPath, recentFiles);
  app.addRecentDocument(safePath);
  return recentFiles;
}

async function chooseOpenFile(
  browserWindow: BrowserWindow,
  options?: DesktopOpenFileOptions,
): Promise<DesktopFilePayload | null> {
  const bundledSongsDir = resolveBundledSongsDir(__dirname, app.isPackaged);
  const result = await dialog.showOpenDialog(browserWindow, {
    title: options?.title ?? 'Open BeatBax Song',
    defaultPath: options?.defaultPath ?? bundledSongsDir ?? undefined,
    properties: ['openFile'],
    filters: TEXT_FILE_FILTERS,
  });

  const selectedPath = result.canceled ? null : result.filePaths[0];
  return selectedPath ? readFilePayload(selectedPath) : null;
}

async function persistFile(
  browserWindow: BrowserWindow,
  options: DesktopSaveFileOptions,
  data: Uint8Array,
): Promise<string | null> {
  let destination = options.defaultPath?.trim() || '';

  if (options.showDialog !== false || !destination) {
    const result = await dialog.showSaveDialog(browserWindow, {
      title: options.title ?? 'Save BeatBax Song',
      defaultPath: destination || undefined,
      filters: TEXT_FILE_FILTERS,
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    destination = result.filePath;
  }

  const safePath = assertAbsoluteFilePath(destination);
  const payload = toFileBuffer(data);
  await fs.mkdir(path.dirname(safePath), { recursive: true });
  await fs.writeFile(safePath, payload);
  return safePath;
}

export async function openRecentFile(_window: BrowserWindow, filePath: string): Promise<DesktopFilePayload> {
  return readFilePayload(filePath);
}

export function registerDesktopIpcHandlers(options: DesktopIpcHandlersOptions): void {
  const { window, recentFilesPath, onRecentFilesChanged } = options;

  ipcMain.handle(IPC_CHANNELS.OPEN_FILE, async (_event: IpcMainInvokeEvent, request?: DesktopOpenFileOptions) => {
    const payload = await chooseOpenFile(window, request);
    if (payload?.path) {
      await addRecentFileEntry(recentFilesPath, payload.path);
      onRecentFilesChanged?.();
    }
    return payload;
  });

  ipcMain.handle(IPC_CHANNELS.SAVE_FILE, async (_event, request: DesktopSaveFileOptions, data: Uint8Array) => {
    const savedPath = await persistFile(window, request, data);
    if (savedPath) {
      await addRecentFileEntry(recentFilesPath, savedPath);
      onRecentFilesChanged?.();
    }
    return savedPath;
  });

  ipcMain.on(IPC_CHANNELS.WRITE_FILE_SYNC, (_event, targetPath: string, data: unknown) => {
    let safePath: string;
    let payload: Buffer;
    try {
      safePath = assertAbsoluteFilePath(targetPath);
      payload = toFileBuffer(data);
    } catch (error) {
      console.error('desktop writeFileSync rejected payload', error);
      return;
    }
    fs.mkdir(path.dirname(safePath), { recursive: true })
      .then(() => fs.writeFile(safePath, payload))
      .catch((error) => {
        console.error('desktop writeFileSync failed', error);
      });
  });

  ipcMain.handle(IPC_CHANNELS.GET_RECENT_FILES, async () => readRecentFiles(recentFilesPath));

  ipcMain.handle(IPC_CHANNELS.ADD_RECENT_FILE, async (_event, targetPath: string) => {
    await addRecentFileEntry(recentFilesPath, targetPath);
    onRecentFilesChanged?.();
  });

  ipcMain.on(IPC_CHANNELS.GET_VERSION, (event) => {
    event.returnValue = app.getVersion();
  });

  ipcMain.on(IPC_CHANNELS.READ_FILE_SYNC, (event, targetPath: string, encoding?: string) => {
    try {
      event.returnValue = readFileSyncSafe(targetPath, (encoding as BufferEncoding) || 'utf-8');
    } catch (error) {
      event.returnValue = { __error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.on(IPC_CHANNELS.EXISTS_SYNC, (event, targetPath: string) => {
    event.returnValue = existsSyncSafe(targetPath);
  });

  ipcMain.on(IPC_CHANNELS.OPEN_RECENT_FILE, (_event, filePath: string) => {
    window.webContents.send(IPC_CHANNELS.FILE_OPENED_REQUEST, filePath);
  });

  ipcMain.handle(IPC_CHANNELS.OPEN_EXTERNAL, async (_event, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      await shell.openExternal(url);
    }
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    window.minimize();
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE, () => {
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_CLOSE, () => {
    window.close();
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_TOGGLE_DEVTOOLS, () => {
    window.webContents.toggleDevTools();
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_QUERY_STATE, () => ({
    maximized: window.isMaximized(),
  }));
}

export function attachWindowStateEvents(window: BrowserWindow): () => void {
  const emitState = (): void => {
    window.webContents.send(IPC_CHANNELS.WINDOW_STATE_CHANGED, {
      maximized: window.isMaximized(),
    });
  };

  window.on('maximize', emitState);
  window.on('unmaximize', emitState);
  return () => {
    window.removeListener('maximize', emitState);
    window.removeListener('unmaximize', emitState);
  };
}

export {
  assertAbsoluteFilePath,
  chooseOpenFile,
  persistFile,
  readRecentFiles,
  toFileBuffer,
};
