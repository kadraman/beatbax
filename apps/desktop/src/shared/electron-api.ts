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
  | 'view:reload'
  | 'view:toggle-devtools'
  | 'help:docs'
  | 'help:repo'
  | 'help:about';

export interface DesktopWindowState {
  maximized: boolean;
}

export interface AIAPIKeyValidationResult {
  ok: boolean;
  message: string;
}

export interface AIChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIChatCompletionRequest {
  endpoint: string;
  apiKey: string;
  model: string;
  messages: AIChatCompletionMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface ElectronAPI {
  openFile(options?: DesktopOpenFileOptions): Promise<DesktopFilePayload | null>;
  saveFile(options: DesktopSaveFileOptions, data: Uint8Array): Promise<string | null>;
  writeFileSync(targetPath: string, data: Uint8Array): void;
  readFileSync(targetPath: string, encoding?: string): string;
  existsSync(targetPath: string): boolean;
  getRecentFiles(): Promise<string[]>;
  addRecentFile(targetPath: string): Promise<void>;
  clearRecentFiles(): Promise<void>;
  getAIAPIKey(): Promise<string>;
  setAIAPIKey(apiKey: string): Promise<void>;
  clearAIAPIKey(): Promise<void>;
  validateAIAPIKey(endpoint: string, apiKey: string): Promise<AIAPIKeyValidationResult>;
  createAIChatCompletion(request: AIChatCompletionRequest): Promise<string>;
  openRecentFile(filePath: string): void;
  openExternal(url: string): Promise<void>;
  getVersion(): string;
  getPlatform(): NodeJS.Platform;
  minimizeWindow(): void;
  toggleMaximizeWindow(): void;
  closeWindow(): void;
  queryWindowState(): Promise<DesktopWindowState>;
  toggleDevTools(): void;
  onWindowStateChanged(callback: (state: DesktopWindowState) => void): () => void;
  onMenuAction(callback: (action: MenuAction) => void): () => void;
  onFileOpened(callback: (payload: DesktopFilePayload) => void): () => void;
}
