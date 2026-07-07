import { contextBridge, ipcRenderer } from 'electron';
import type {
  DesktopFilePayload,
  DesktopOpenFileOptions,
  DesktopSaveFileOptions,
  DesktopWindowState,
  ElectronAPI,
  MenuAction,
} from '../shared/electron-api';
import { IPC_CHANNELS } from '../shared/ipc';

const electronAPI: ElectronAPI = {
  openFile: (options?: DesktopOpenFileOptions) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_FILE, options),
  saveFile: (options: DesktopSaveFileOptions, data: Uint8Array) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_FILE, options, data),
  writeFileSync: (targetPath: string, data: Uint8Array) => {
    ipcRenderer.send(IPC_CHANNELS.WRITE_FILE_SYNC, targetPath, data);
  },
  readFileSync: (targetPath: string, encoding?: string) => {
    const result = ipcRenderer.sendSync(IPC_CHANNELS.READ_FILE_SYNC, targetPath, encoding) as
      | string
      | { __error: string };
    if (result && typeof result === 'object' && '__error' in result) {
      throw new Error(result.__error);
    }
    return result;
  },
  existsSync: (targetPath: string) => ipcRenderer.sendSync(IPC_CHANNELS.EXISTS_SYNC, targetPath) as boolean,
  getRecentFiles: () => ipcRenderer.invoke(IPC_CHANNELS.GET_RECENT_FILES),
  addRecentFile: async (targetPath: string) => {
    await ipcRenderer.invoke(IPC_CHANNELS.ADD_RECENT_FILE, targetPath);
  },
  clearRecentFiles: async () => {
    await ipcRenderer.invoke(IPC_CHANNELS.CLEAR_RECENT_FILES);
  },
  getAIAPIKey: () => ipcRenderer.invoke(IPC_CHANNELS.AI_GET_API_KEY),
  setAIAPIKey: async (apiKey: string) => {
    await ipcRenderer.invoke(IPC_CHANNELS.AI_SET_API_KEY, apiKey);
  },
  clearAIAPIKey: async () => {
    await ipcRenderer.invoke(IPC_CHANNELS.AI_CLEAR_API_KEY);
  },
  validateAIAPIKey: (endpoint: string, apiKey: string) => ipcRenderer.invoke(
    IPC_CHANNELS.AI_VALIDATE_API_KEY,
    endpoint,
    apiKey,
  ),
  listAIModels: (endpoint: string, apiKey: string) => ipcRenderer.invoke(
    IPC_CHANNELS.AI_LIST_MODELS,
    endpoint,
    apiKey,
  ),
  createAIChatCompletion: (request) => ipcRenderer.invoke(IPC_CHANNELS.AI_CHAT_COMPLETION, request),
  getVersion: () => ipcRenderer.sendSync(IPC_CHANNELS.GET_VERSION),
  getPlatform: () => process.platform,
  openRecentFile: (filePath: string) => {
    ipcRenderer.send(IPC_CHANNELS.OPEN_RECENT_FILE, filePath);
  },
  openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_EXTERNAL, url),
  minimizeWindow: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_MINIMIZE),
  toggleMaximizeWindow: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE),
  closeWindow: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_CLOSE),
  toggleDevTools: () => ipcRenderer.send(IPC_CHANNELS.WINDOW_TOGGLE_DEVTOOLS),
  queryWindowState: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_QUERY_STATE) as Promise<DesktopWindowState>,
  onWindowStateChanged: (callback: (state: DesktopWindowState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: DesktopWindowState) => callback(state);
    ipcRenderer.on(IPC_CHANNELS.WINDOW_STATE_CHANGED, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.WINDOW_STATE_CHANGED, listener);
  },
  onMenuAction: (callback: (action: MenuAction) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: MenuAction) => callback(action);
    ipcRenderer.on(IPC_CHANNELS.MENU_ACTION, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MENU_ACTION, listener);
  },
  onFileOpened: (callback: (payload: DesktopFilePayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: DesktopFilePayload) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.FILE_OPENED, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.FILE_OPENED, listener);
  },
};

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electronAPI', electronAPI);
} else {
  // @ts-expect-error preload fallback for non-isolated contexts
  window.electronAPI = electronAPI;
}
