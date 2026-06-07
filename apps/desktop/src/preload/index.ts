import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopFilePayload, DesktopOpenFileOptions, DesktopSaveFileOptions, ElectronAPI, MenuAction } from '../shared/electron-api';
import { IPC_CHANNELS } from '../shared/ipc';

const electronAPI: ElectronAPI = {
  openFile: (options?: DesktopOpenFileOptions) => ipcRenderer.invoke(IPC_CHANNELS.OPEN_FILE, options),
  saveFile: (options: DesktopSaveFileOptions, data: Uint8Array) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_FILE, options, data),
  writeFileSync: (targetPath: string, data: Uint8Array) => {
    ipcRenderer.send(IPC_CHANNELS.WRITE_FILE_SYNC, targetPath, data);
  },
  getRecentFiles: () => ipcRenderer.invoke(IPC_CHANNELS.GET_RECENT_FILES),
  addRecentFile: async (targetPath: string) => {
    await ipcRenderer.invoke(IPC_CHANNELS.ADD_RECENT_FILE, targetPath);
  },
  getVersion: () => ipcRenderer.sendSync(IPC_CHANNELS.GET_VERSION),
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
