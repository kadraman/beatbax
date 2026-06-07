export interface DesktopOpenFileOptions {
  title?: string;
  defaultPath?: string;
}

export interface DesktopSaveFileOptions {
  title?: string;
  defaultPath?: string;
  showDialog?: boolean;
}

export interface DesktopFilePayload {
  path: string;
  name: string;
  data: Uint8Array;
}

export type MenuAction =
  | 'file:new'
  | 'file:open'
  | 'file:save'
  | 'file:save-as'
  | 'file:export-json'
  | 'file:export-midi'
  | 'file:export-uge'
  | 'file:export-wav'
  | 'playback:play'
  | 'playback:pause'
  | 'playback:stop'
  | 'view:toggle-devtools'
  | 'help:docs'
  | 'help:repo';

export interface ElectronAPI {
  openFile(options?: DesktopOpenFileOptions): Promise<DesktopFilePayload | null>;
  saveFile(options: DesktopSaveFileOptions, data: Uint8Array): Promise<string | null>;
  writeFileSync(targetPath: string, data: Uint8Array): void;
  getRecentFiles(): Promise<string[]>;
  addRecentFile(targetPath: string): Promise<void>;
  getVersion(): string;
  onMenuAction(callback: (action: MenuAction) => void): () => void;
  onFileOpened(callback: (payload: DesktopFilePayload) => void): () => void;
}
