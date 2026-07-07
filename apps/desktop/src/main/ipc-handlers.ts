import { app, dialog, ipcMain, safeStorage, shell } from 'electron';
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

function saveDialogFilters(options: DesktopSaveFileOptions) {
  const extension = options.extension?.replace(/^\./, '').trim();
  if (extension) {
    return [
      { name: `${extension.toUpperCase()} files`, extensions: [extension] },
      { name: 'All Files', extensions: ['*'] },
    ];
  }
  return TEXT_FILE_FILTERS;
}

interface SecureAIKeyFile {
  version: 1;
  encryptedApiKey: string;
}

interface AIAPIKeyValidationResult {
  ok: boolean;
  message: string;
}

interface AIModelListResult {
  ok: boolean;
  models: string[];
  message?: string;
}

interface AIChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface AIChatCompletionRequest {
  endpoint: string;
  apiKey: string;
  model: string;
  messages: AIChatCompletionMessage[];
  temperature?: number;
  maxTokens?: number;
}

let e2eMemoryAIAPIKey = '';

function useE2EMemoryAIKeyStore(): boolean {
  return process.env.BEATBAX_E2E_AI_KEY_STORE === 'memory';
}

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

function recentFileIdentity(filePath: string): string {
  const normalized = assertAbsoluteFilePath(filePath);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function normalizeExistingRecentFile(filePath: string): { path: string; identity: string } | null {
  try {
    const normalized = assertAbsoluteFilePath(filePath);
    return {
      path: normalized,
      identity: process.platform === 'win32' ? normalized.toLowerCase() : normalized,
    };
  } catch {
    return null;
  }
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

export async function clearRecentFileEntries(recentFilesPath: string): Promise<void> {
  await writeRecentFiles(recentFilesPath, []);
  app.clearRecentDocuments?.();
}

export function mergeRecentFiles(existing: string[], filePath: string): string[] {
  const safePath = assertAbsoluteFilePath(filePath);
  const safeIdentity = recentFileIdentity(safePath);
  const merged = [safePath];
  const seen = new Set([safeIdentity]);

  for (const entry of existing) {
    const normalized = normalizeExistingRecentFile(entry);
    if (!normalized || seen.has(normalized.identity)) continue;
    seen.add(normalized.identity);
    merged.push(normalized.path);
  }

  return merged.slice(0, RECENT_FILES_LIMIT);
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

function aiCredentialPath(): string {
  return path.join(app.getPath('userData'), 'secure-ai-credentials.json');
}

async function readSecureAIAPIKey(): Promise<string> {
  if (useE2EMemoryAIKeyStore()) return e2eMemoryAIAPIKey;
  try {
    const raw = await fs.readFile(aiCredentialPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<SecureAIKeyFile>;
    if (parsed.version !== 1 || typeof parsed.encryptedApiKey !== 'string') return '';
    return safeStorage.decryptString(Buffer.from(parsed.encryptedApiKey, 'base64'));
  } catch {
    return '';
  }
}

async function clearSecureAIAPIKey(): Promise<void> {
  if (useE2EMemoryAIKeyStore()) {
    e2eMemoryAIAPIKey = '';
    return;
  }
  await fs.rm(aiCredentialPath(), { force: true });
}

async function writeSecureAIAPIKey(apiKey: string): Promise<void> {
  if (useE2EMemoryAIKeyStore()) {
    e2eMemoryAIAPIKey = apiKey.trim();
    return;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure credential storage is not available on this system.');
  }

  const trimmed = apiKey.trim();
  if (!trimmed) {
    await clearSecureAIAPIKey();
    return;
  }
  if (/[^\x20-\x7E]/.test(trimmed)) {
    throw new Error('API key contains invalid characters.');
  }

  const encrypted = safeStorage.encryptString(trimmed);
  const targetPath = aiCredentialPath();
  const payload: SecureAIKeyFile = {
    version: 1,
    encryptedApiKey: encrypted.toString('base64'),
  };
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 });
}

function endpointModelsURL(endpoint: string): string {
  const url = new URL(endpoint.trim());
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Endpoint must use http or https.');
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/models`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function endpointChatCompletionsURL(endpoint: string): string {
  const url = new URL(endpoint.trim());
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Endpoint must use http or https.');
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/chat/completions`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

async function validateAIAPIKey(endpoint: string, apiKey: string): Promise<AIAPIKeyValidationResult> {
  const trimmedEndpoint = typeof endpoint === 'string' ? endpoint.trim() : '';
  const trimmedKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!trimmedEndpoint) return { ok: false, message: 'Enter an API endpoint before validating the key.' };
  if (!trimmedKey) return { ok: false, message: 'No API key set.' };

  let url: string;
  try {
    url = endpointModelsURL(trimmedEndpoint);
  } catch (error) {
    return { ok: false, message: `Invalid endpoint: ${(error as Error).message}` };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${trimmedKey}` },
      signal: controller.signal,
    });
    if (response.ok) return { ok: true, message: 'API key validated.' };
    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: 'API key was rejected by the provider.' };
    }
    const body = await response.text().catch(() => '');
    const suffix = body.trim() ? ` ${body.trim().slice(0, 240)}` : '';
    return { ok: false, message: `Could not validate key: provider returned HTTP ${response.status}.${suffix}` };
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return { ok: false, message: 'Could not validate key: provider did not respond.' };
    }
    return { ok: false, message: `Could not validate key: ${(error as Error).message || 'request failed'}.` };
  } finally {
    clearTimeout(timeout);
  }
}

async function listAIModels(endpoint: string, apiKey: string): Promise<AIModelListResult> {
  const trimmedEndpoint = typeof endpoint === 'string' ? endpoint.trim() : '';
  const trimmedKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!trimmedEndpoint) return { ok: false, models: [], message: 'Enter an API endpoint before loading models.' };

  let url: string;
  try {
    url = endpointModelsURL(trimmedEndpoint);
  } catch (error) {
    return { ok: false, models: [], message: `Invalid endpoint: ${(error as Error).message}` };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const headers: Record<string, string> = {};
    if (trimmedKey) headers.Authorization = `Bearer ${trimmedKey}`;
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { ok: false, models: [], message: 'The provider rejected the API key.' };
      }
      return { ok: false, models: [], message: `Could not load models: provider returned HTTP ${response.status}.` };
    }
    const data = await response.json().catch(() => null) as { data?: Array<{ id?: unknown }> } | null;
    const models = Array.isArray(data?.data)
      ? data.data
          .map((entry) => (typeof entry?.id === 'string' ? entry.id : ''))
          .filter((id): id is string => id.length > 0)
      : [];
    return { ok: true, models };
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return { ok: false, models: [], message: 'Could not load models: provider did not respond.' };
    }
    return { ok: false, models: [], message: `Could not load models: ${(error as Error).message || 'request failed'}.` };
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeAIChatRequest(request: unknown): AIChatCompletionRequest {
  const value = request as Partial<AIChatCompletionRequest> | null;
  if (!value || typeof value !== 'object') throw new Error('Invalid AI request.');
  if (typeof value.endpoint !== 'string' || !value.endpoint.trim()) throw new Error('No AI endpoint configured.');
  if (typeof value.model !== 'string' || !value.model.trim()) throw new Error('No AI model configured.');
  if (!Array.isArray(value.messages)) throw new Error('Invalid AI messages.');
  const messages = value.messages.map((message) => {
    if (!message || typeof message !== 'object') throw new Error('Invalid AI message.');
    if (message.role !== 'system' && message.role !== 'user' && message.role !== 'assistant') {
      throw new Error('Invalid AI message role.');
    }
    if (typeof message.content !== 'string') throw new Error('Invalid AI message content.');
    return { role: message.role, content: message.content };
  });
  return {
    endpoint: value.endpoint.trim(),
    apiKey: typeof value.apiKey === 'string' ? value.apiKey.trim() : '',
    model: value.model.trim(),
    messages,
    temperature: typeof value.temperature === 'number' ? value.temperature : 0.7,
    maxTokens: typeof value.maxTokens === 'number' ? value.maxTokens : 1024,
  };
}

function formatProviderError(status: number, body: string): string {
  let providerMessage = body.trim();
  let providerCode = '';
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: unknown; code?: unknown; type?: unknown };
    };
    if (typeof parsed.error?.message === 'string') providerMessage = parsed.error.message;
    if (typeof parsed.error?.code === 'string') providerCode = parsed.error.code;
    else if (typeof parsed.error?.type === 'string') providerCode = parsed.error.type;
  } catch { /* provider body was not JSON */ }

  if (status === 401 || status === 403) {
    return 'The AI provider rejected the API key. Check the key in AI Settings.';
  }
  if (status === 429) {
    if (providerCode === 'insufficient_quota') {
      return 'OpenAI quota exceeded. Check your plan and billing details, or choose a different provider/key in AI Settings.';
    }
    return 'The AI provider rate limit was reached. Try again later or use a different provider/key.';
  }
  const suffix = providerMessage ? ` ${providerMessage.slice(0, 240)}` : '';
  return `The AI provider returned HTTP ${status}.${suffix}`;
}

function isOpenAIEndpoint(endpoint: string): boolean {
  try {
    return new URL(endpoint).host.toLowerCase().endsWith('openai.com');
  } catch {
    return false;
  }
}

async function createAIChatCompletion(request: unknown): Promise<string> {
  const payload = sanitizeAIChatRequest(request);
  const url = endpointChatCompletionsURL(payload.endpoint);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (payload.apiKey) headers.Authorization = `Bearer ${payload.apiKey}`;

  // Newer OpenAI models (GPT-5 / o-series) require `max_completion_tokens`
  // and reject a non-default `temperature`. Older models and most local
  // providers use `max_tokens`. Start with the endpoint's likely dialect and
  // adapt on parameter-related 400 responses.
  let tokenParam: 'max_tokens' | 'max_completion_tokens' =
    isOpenAIEndpoint(payload.endpoint) ? 'max_completion_tokens' : 'max_tokens';
  let includeTemperature = true;

  const MAX_ATTEMPTS = 4;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const body: Record<string, unknown> = {
      model: payload.model,
      messages: payload.messages,
      stream: false,
      [tokenParam]: payload.maxTokens,
    };
    if (includeTemperature) body.temperature = payload.temperature;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (response.ok) {
        const data = await response.json();
        return data?.choices?.[0]?.message?.content ?? '(no response)';
      }

      const text = await response.text().catch(() => '');
      if (response.status === 400 && attempt < MAX_ATTEMPTS - 1) {
        const lower = text.toLowerCase();
        let adapted = false;
        if (tokenParam === 'max_tokens' && lower.includes('max_completion_tokens')) {
          tokenParam = 'max_completion_tokens';
          adapted = true;
        } else if (
          tokenParam === 'max_completion_tokens'
          && lower.includes('max_completion_tokens')
          && (lower.includes('unsupported') || lower.includes('not supported') || lower.includes('unrecognized'))
        ) {
          tokenParam = 'max_tokens';
          adapted = true;
        }
        if (includeTemperature && lower.includes('temperature')) {
          includeTemperature = false;
          adapted = true;
        }
        if (adapted) continue;
      }
      throw new Error(formatProviderError(response.status, text));
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new Error('AI request timed out.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error('The AI provider rejected the request parameters.');
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
      filters: saveDialogFilters(options),
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

  ipcMain.handle(IPC_CHANNELS.CLEAR_RECENT_FILES, async () => {
    await clearRecentFileEntries(recentFilesPath);
    onRecentFilesChanged?.();
  });

  ipcMain.handle(IPC_CHANNELS.AI_GET_API_KEY, async () => readSecureAIAPIKey());

  ipcMain.handle(IPC_CHANNELS.AI_SET_API_KEY, async (_event, apiKey: string) => {
    await writeSecureAIAPIKey(typeof apiKey === 'string' ? apiKey : '');
  });

  ipcMain.handle(IPC_CHANNELS.AI_CLEAR_API_KEY, async () => {
    await clearSecureAIAPIKey();
  });

  ipcMain.handle(IPC_CHANNELS.AI_VALIDATE_API_KEY, async (_event, endpoint: string, apiKey: string) =>
    validateAIAPIKey(endpoint, apiKey));

  ipcMain.handle(IPC_CHANNELS.AI_LIST_MODELS, async (_event, endpoint: string, apiKey: string) =>
    listAIModels(endpoint, apiKey));

  ipcMain.handle(IPC_CHANNELS.AI_CHAT_COMPLETION, async (_event, request: unknown) =>
    createAIChatCompletion(request));

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
    openRecentFile(window, filePath)
      .then(async (payload) => {
        await addRecentFileEntry(recentFilesPath, payload.path);
        onRecentFilesChanged?.();
        window.webContents.send(IPC_CHANNELS.FILE_OPENED, payload);
      })
      .catch((error) => {
        console.error('Failed to open recent file', error);
      });
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
