export interface DesktopOpenFileOptions {
  title?: string;
  defaultPath?: string;
}

export interface DesktopSaveFileOptions {
  title?: string;
  defaultPath?: string;
  showDialog?: boolean;
  /** Preferred file extension for export save dialogs (without leading dot). */
  extension?: string;
}

export interface DesktopFilePayload {
  path: string;
  name: string;
  data: Uint8Array;
}

export interface DesktopRemoteAssetRequest {
  url: string;
  timeoutMs?: number;
  maxBytes?: number;
}

export type MenuAction =
  | 'file:new'
  | 'file:open'
  | 'file:save'
  | 'file:save-as'
  | 'file:toggle-auto-save'
  | 'file:export-json'
  | 'file:export-midi'
  | 'file:export-uge'
  | 'file:export-wav'
  | 'playback:play'
  | 'playback:pause'
  | 'playback:stop'
  | 'edit:find'
  | 'edit:replace'
  | 'view:command-palette'
  | 'view:toggle-output'
  | 'view:toggle-problems'
  | 'view:toggle-toolbar'
  | 'view:toggle-transport-bar'
  | 'view:toggle-channel-mixer'
  | 'view:toggle-song-visualizer'
  | 'view:toggle-pattern-grid'
  | 'view:toggle-ai-assistant'
  | 'view:toggle-wrap-text'
  | 'view:toggle-fold-all'
  | 'view:zoom-in'
  | 'view:zoom-out'
  | 'view:zoom-reset'
  | 'view:toggle-theme'
  | 'view:settings'
  | 'view:reload'
  | 'view:toggle-devtools'
  | 'help:docs'
  | 'help:repo'
  | 'help:shortcuts'
  | 'help:about'
  | `file:load-example:${string}`;

export interface DesktopWindowState {
  maximized: boolean;
}

export interface AIAPIKeyValidationResult {
  ok: boolean;
  message: string;
}

export interface AIModelListResult {
  ok: boolean;
  /** Raw model IDs returned by the provider's /models endpoint. */
  models: string[];
  message?: string;
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
  fetchRemoteAsset(request: DesktopRemoteAssetRequest): Promise<Uint8Array>;
  getRemoteAssetAllowlist(): Promise<string[]>;
  setRemoteAssetAllowlist(hosts: string[]): Promise<string[]>;
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
  listAIModels(endpoint: string, apiKey: string): Promise<AIModelListResult>;
  createAIChatCompletion(request: AIChatCompletionRequest): Promise<string>;
  cancelAIChatCompletion(): Promise<void>;
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
  refreshNativeMenu(): void;
}
