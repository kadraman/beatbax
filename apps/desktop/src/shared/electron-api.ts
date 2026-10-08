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

export type DesktopDocumentChangeType = 'change' | 'unlink';

export interface DesktopDocumentChangedPayload {
  path: string;
  type: DesktopDocumentChangeType;
  /** UTF-8 text when `type` is `change`. */
  content?: string;
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
  | 'edit:undo'
  | 'edit:redo'
  | 'view:command-palette'
  | 'view:toggle-output'
  | 'view:toggle-problems'
  | 'view:toggle-toolbar'
  | 'view:toggle-transport-bar'
  | 'view:toggle-channel-mixer'
  | 'view:toggle-song-visualizer'
  | 'view:toggle-pattern-grid'
  | 'view:toggle-instrument-editor'
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
  | 'help:tutorial'
  | 'help:shortcuts'
  | 'help:about'
  | `file:load-example:${string}`;

export interface DesktopWindowState {
  maximized: boolean;
}

/** Why developer tools are (or are not) available in this session. */
export type DevToolsSource = 'development' | 'setting' | 'launch-flag' | 'off';

export interface DevToolsState {
  allowed: boolean;
  source: DevToolsSource;
  /** The persisted Settings value, independent of the launch flag. */
  saved: boolean;
}

export type DiagnosticsLogLevel = 'warn' | 'error';

export interface DiagnosticsLogEntry {
  level: DiagnosticsLogLevel;
  source: string;
  message: string;
  stack?: string;
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
  /**
   * Auto reply budgets resolved per token-limit parameter, so a dialect learned
   * mid-request uses the matching ceiling. Falls back to `maxTokens`.
   */
  maxTokensByTokenParam?: Partial<Record<AITokenParam, number>>;
  /** Omitted means "provider default": no `reasoning_effort` field is sent. */
  reasoningEffort?: ReasoningEffortRequest;
  /** Copilot mode; selects the remote timeout minimum. Omitted gets the longer Edit minimum. */
  mode?: AIChatMode;
}

export type AIChatMode = 'ask' | 'edit';

export type ReasoningEffortLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'custom';

export interface ReasoningEffortRequest {
  level: ReasoningEffortLevel;
  /** Exact wire value; required when `level` is `custom`. */
  value?: string;
}

export type AITokenParam = 'max_tokens' | 'max_completion_tokens';

/** OpenAI-compatible `usage` object, normalised to camelCase. */
export interface AIChatCompletionUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** `usage.completion_tokens_details.reasoning_tokens`, when the provider reports it. */
  reasoningTokens?: number;
}

export interface AIChatCompletionResult {
  content: string;
  usage?: AIChatCompletionUsage;
  /** Provider `choices[0].finish_reason` (e.g. `stop`, `length`). */
  finishReason?: string;
  /** True when the reply message carried a non-empty `reasoning` / `reasoning_content` field. */
  reasoningPresent?: boolean;
  /** `reasoning_effort` value sent on the successful attempt; `null` when the field was omitted. */
  effectiveReasoningEffort?: string | null;
  /** Token-limit parameter used on the successful attempt. */
  tokenParam?: AITokenParam;
}

export interface ElectronAPI {
  openFile(options?: DesktopOpenFileOptions): Promise<DesktopFilePayload | null>;
  /** Load a packaged example song by virtual path (`/songs/gameboy/foo.bax`). */
  openBundledExample(virtualPath: string): Promise<DesktopFilePayload | null>;
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
  createAIChatCompletion(request: AIChatCompletionRequest): Promise<AIChatCompletionResult>;
  cancelAIChatCompletion(): Promise<void>;
  openRecentFile(filePath: string): void;
  openExternal(url: string): Promise<void>;
  getVersion(): string;
  /** Main-process `process.cwd()` for resolving `local:` paths next to the repo/cli cwd. */
  getCwd(): string;
  getPlatform(): NodeJS.Platform;
  minimizeWindow(): void;
  toggleMaximizeWindow(): void;
  closeWindow(): void;
  queryWindowState(): Promise<DesktopWindowState>;
  toggleDevTools(): void;
  getDevToolsState(): Promise<DevToolsState>;
  setDevToolsEnabled(enabled: boolean): Promise<DevToolsState>;
  onDevToolsStateChanged(callback: (state: DevToolsState) => void): () => void;
  /** Append a warning or error to the diagnostics log file (fire-and-forget). */
  logDiagnostics(entry: DiagnosticsLogEntry): void;
  openLogsFolder(): Promise<void>;
  onWindowStateChanged(callback: (state: DesktopWindowState) => void): () => void;
  onMenuAction(callback: (action: MenuAction) => void): () => void;
  onFileOpened(callback: (payload: DesktopFilePayload) => void): () => void;
  watchDocument(filePath: string): Promise<void>;
  unwatchDocument(): Promise<void>;
  onDocumentChanged(callback: (payload: DesktopDocumentChangedPayload) => void): () => void;
  refreshNativeMenu(): void;
}
