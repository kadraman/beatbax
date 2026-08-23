/**
 * chat.store — AI Copilot chat state (nanostores).
 *
 * Centralises message history, multi-session list, AI connection settings,
 * and request state. The ChatPanel writes to these stores; other components
 * can subscribe (e.g., status-bar badge showing unread message count).
 *
 * localStorage keys (all under the beatbax: prefix via BeatBaxStorage):
 *   beatbax:ai.settings   — endpoint, model, maxContextChars, contextWindowTokens
 *                            (apiKey is runtime-only)
 *   beatbax:ai.mode       — 'edit' | 'ask'
 *   beatbax:ai.chatHistory — persisted message array for the active session
 *   beatbax:ai.sessions    — CopilotSession[] (migrated from chatHistory)
 *   beatbax:ai.activeSessionId — current session id
 *   beatbax:ai.promptHistory — persisted submitted prompts (capped at MAX_PROMPT_HISTORY)
 */

import { atom, map } from 'nanostores';
import { defaultContextWindowTokens, getDefaultAIModel } from './ai-models.js';
import { storage, StorageKey } from '../utils/local-storage.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ChatMode = 'edit' | 'ask';

export type CopilotChangeDetailAction = 'added' | 'updated' | 'removed';
export type CopilotChangeReviewStatus = 'pending' | 'kept' | 'discarded';

export interface CopilotChangeDetail {
  id: string;
  kind: 'pattern' | 'sequence' | 'instrument' | 'effect' | 'channel';
  name: string;
  action: CopilotChangeDetailAction;
  previousLine?: string;
  nextLine?: string;
  lineNumber: number;
  reviewStatus?: CopilotChangeReviewStatus;
}

export interface ChatTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AISettings {
  endpoint: string;
  apiKey: string;
  model: string;
  /** Ask-only: max characters of the open song pasted into questions. Ignored in Edit. */
  maxContextChars: number;
  /** Model token window (Ask and Edit). Footer meter denominator; match Ollama num_ctx. */
  contextWindowTokens: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** ISO timestamp */
  timestamp: string;
  /**
   * Friendly text shown in the UI instead of `content`. `content` is still the
   * text sent to the model (e.g. a verbose "apply this snippet" instruction),
   * while `display` keeps the transcript readable.
   */
  display?: string;
  /** Assistant edit-mode reply whose song was applied to the editor. */
  applied?: boolean;
  /**
   * User decision after an edit was applied. `pending` while the editor review
   * banner is active; `kept` / `discarded` after Keep or Discard.
   */
  applyOutcome?: 'pending' | 'kept' | 'discarded';
  /** Edit-mode reply rejected before apply due to parse/validation errors. */
  applyBlocked?: boolean;
  /** Number of changed lines when the reply was applied (added + removed). */
  changedLines?: number;
  /** Lines added or modified in the new file. */
  linesAdded?: number;
  /** Lines removed from the previous file. */
  linesRemoved?: number;
  /** Lines modified in place (replacement at the same position). */
  linesModified?: number;
  /**
   * Human-readable bullet summary of the structural edits applied to the song
   * (e.g. "Added pattern `melody_var`"). Shown in the applied confirmation.
   */
  changeSummary?: string[];
  /** Structured edit list for rich Copilot review UI. */
  changeDetails?: CopilotChangeDetail[];
  /** Short informational notes shown above the change list (merge/repair context). */
  applyNotes?: string[];
  /** Model (or extracted) what/why prose for an applied Edit, shown above the change list. */
  applyExplanation?: string;
  /** File name shown in the edit summary header. */
  documentName?: string;
  /** Set when Ctrl+Z restores the pre-Copilot baseline after a kept edit. */
  undoneInEditor?: boolean;
  /**
   * UI-only informational notice (e.g. "Switched to Edit mode"). Rendered as a
   * centered muted line and excluded from the context sent to the model.
   */
  system?: boolean;
  /** Mode active when this message was sent/received — drives per-message actions. */
  replyMode?: ChatMode;
  /** Provider-reported or accumulated token usage for this turn. */
  usage?: ChatTokenUsage;
}

export interface ChatMessageMeta {
  display?: string;
  applied?: boolean;
  applyOutcome?: 'pending' | 'kept' | 'discarded';
  applyBlocked?: boolean;
  changedLines?: number;
  linesAdded?: number;
  linesRemoved?: number;
  linesModified?: number;
  changeSummary?: string[];
  changeDetails?: CopilotChangeDetail[];
  applyNotes?: string[];
  applyExplanation?: string;
  documentName?: string;
  undoneInEditor?: boolean;
  system?: boolean;
  replyMode?: ChatMode;
  usage?: ChatTokenUsage;
}

export interface CopilotSessionTokenTotals {
  prompt: number;
  completion: number;
}

export interface CopilotSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Display-only song filename when the session was created — not a hard key. */
  songHint?: string;
  messages: ChatMessage[];
  tokenTotals?: CopilotSessionTokenTotals;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const MAX_HISTORY = 50;
const MAX_PROMPT_HISTORY = 50;
const MAX_SESSIONS = 30;
export const NEW_CHAT_TITLE = 'New chat';

/** Discrete Ask-mode song excerpt sizes (characters, not model tokens). */
export const AI_CONTEXT_CHAR_PRESETS = [
  { value: 4096, label: '4K' },
  { value: 8192, label: '8K' },
  { value: 12000, label: '12K' },
  { value: 16384, label: '16K' },
  { value: 24576, label: '24K' },
  { value: 32768, label: '32K' },
] as const;

export const MIN_CONTEXT_WINDOW_TOKENS = 4096;
export const MAX_CONTEXT_WINDOW_TOKENS = 1_000_000;

const CONTEXT_PRESET_VALUES = AI_CONTEXT_CHAR_PRESETS.map((preset) => preset.value);
const MIN_CONTEXT_CHARS = CONTEXT_PRESET_VALUES[0];
const MAX_CONTEXT_CHARS = CONTEXT_PRESET_VALUES[CONTEXT_PRESET_VALUES.length - 1];

export function snapContextChars(value: number): number {
  let best = CONTEXT_PRESET_VALUES[0];
  let bestDistance = Math.abs(value - best);
  for (const preset of CONTEXT_PRESET_VALUES) {
    const distance = Math.abs(value - preset);
    if (distance < bestDistance) {
      best = preset;
      bestDistance = distance;
    }
  }
  return best;
}

function clampContextChars(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return snapContextChars(fallback);
  return snapContextChars(Math.min(MAX_CONTEXT_CHARS, Math.max(MIN_CONTEXT_CHARS, Math.round(value))));
}

export function clampContextWindowTokens(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.round(Math.min(MAX_CONTEXT_WINDOW_TOKENS, Math.max(MIN_CONTEXT_WINDOW_TOKENS, value)));
}

function newSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function addTokenUsage(a?: ChatTokenUsage, b?: ChatTokenUsage): ChatTokenUsage | undefined {
  if (!a && !b) return undefined;
  const promptTokens = (a?.promptTokens ?? 0) + (b?.promptTokens ?? 0);
  const completionTokens = (a?.completionTokens ?? 0) + (b?.completionTokens ?? 0);
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

function sanitizeUsage(value: unknown): ChatTokenUsage | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.promptTokens !== 'number' || typeof record.completionTokens !== 'number') {
    return undefined;
  }
  if (!Number.isFinite(record.promptTokens) || !Number.isFinite(record.completionTokens)) {
    return undefined;
  }
  const promptTokens = Math.max(0, Math.round(record.promptTokens));
  const completionTokens = Math.max(0, Math.round(record.completionTokens));
  const totalTokens = typeof record.totalTokens === 'number' && Number.isFinite(record.totalTokens)
    ? Math.max(0, Math.round(record.totalTokens))
    : promptTokens + completionTokens;
  return { promptTokens, completionTokens, totalTokens };
}

function sanitizeTokenTotals(value: unknown): CopilotSessionTokenTotals | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.prompt !== 'number' || typeof record.completion !== 'number') return undefined;
  if (!Number.isFinite(record.prompt) || !Number.isFinite(record.completion)) return undefined;
  return {
    prompt: Math.max(0, Math.round(record.prompt)),
    completion: Math.max(0, Math.round(record.completion)),
  };
}

export function titleFromMessages(messages: ChatMessage[], fallback = NEW_CHAT_TITLE): string {
  const first = messages.find((message) => message.role === 'user' && !message.system);
  const raw = (first?.display ?? first?.content ?? '').trim().replace(/\s+/g, ' ');
  if (!raw) return fallback;
  return raw.length > 42 ? `${raw.slice(0, 41)}…` : raw;
}

function sanitizeMessages(parsed: unknown): ChatMessage[] {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((message): message is ChatMessage => {
      return Boolean(
        message
        && (message.role === 'user' || message.role === 'assistant')
        && typeof message.content === 'string'
        && typeof message.timestamp === 'string',
      );
    })
    .map((message) => {
      const usage = sanitizeUsage(message.usage);
      const next = usage ? { ...message, usage } : { ...message };
      if (next.applied && next.applyOutcome === 'pending') {
        return { ...next, applyOutcome: 'kept' as const };
      }
      return next;
    })
    .slice(-MAX_HISTORY);
}

function createSession(partial?: Partial<CopilotSession> & { messages?: ChatMessage[] }): CopilotSession {
  const createdAt = partial?.createdAt ?? nowIso();
  const messages = sanitizeMessages(partial?.messages ?? []);
  return {
    id: partial?.id && typeof partial.id === 'string' ? partial.id : newSessionId(),
    title: typeof partial?.title === 'string' && partial.title.trim()
      ? partial.title.trim()
      : titleFromMessages(messages),
    createdAt,
    updatedAt: partial?.updatedAt ?? createdAt,
    songHint: typeof partial?.songHint === 'string' && partial.songHint.trim()
      ? partial.songHint.trim()
      : undefined,
    messages,
    tokenTotals: sanitizeTokenTotals(partial?.tokenTotals),
  };
}

function sanitizeSession(value: unknown): CopilotSession | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<CopilotSession>;
  if (typeof record.id !== 'string' || !record.id.trim()) return null;
  return createSession(record);
}

// ─── Loaders ──────────────────────────────────────────────────────────────────

function loadSettings(): AISettings {
  const defaults: AISettings = {
    endpoint: 'https://api.openai.com/v1',
    apiKey: '',
    model: getDefaultAIModel(),
    maxContextChars: 12000,
    contextWindowTokens: defaultContextWindowTokens('https://api.openai.com/v1', getDefaultAIModel()),
  };
  // Scrub any legacy key written by older versions of the app before the
  // no-persist-apiKey policy was introduced.
  try { localStorage.removeItem('bb-ai-settings'); } catch { /* ignore */ }

  const saved = storage.getJSON<Partial<AISettings>>(StorageKey.CHAT_SETTINGS);
  if (!saved) return defaults;
  const endpoint = typeof saved.endpoint === 'string' && saved.endpoint.trim() ? saved.endpoint : defaults.endpoint;
  const model = typeof saved.model === 'string' && saved.model.trim() ? saved.model : defaults.model;
  const sanitized: AISettings = {
    endpoint,
    apiKey: '',
    model,
    maxContextChars: clampContextChars(saved.maxContextChars, defaults.maxContextChars),
    contextWindowTokens: clampContextWindowTokens(
      saved.contextWindowTokens,
      defaultContextWindowTokens(endpoint, model),
    ),
  };
  storage.setJSON(StorageKey.CHAT_SETTINGS, {
    endpoint: sanitized.endpoint,
    model: sanitized.model,
    maxContextChars: sanitized.maxContextChars,
    contextWindowTokens: sanitized.contextWindowTokens,
  });
  return sanitized;
}

function loadMode(): ChatMode {
  const raw = storage.get(StorageKey.CHAT_MODE);
  return raw === 'ask' || raw === 'edit' ? raw : 'edit';
}

function loadHistory(): ChatMessage[] {
  return sanitizeMessages(storage.getJSON<ChatMessage[]>(StorageKey.CHAT_HISTORY));
}

function loadPromptHistory(): string[] {
  const parsed = storage.getJSON<string[]>(StorageKey.CHAT_PROMPT_HISTORY);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((prompt): prompt is string => typeof prompt === 'string' && prompt.trim().length > 0)
    .map((prompt) => prompt.trim())
    .slice(-MAX_PROMPT_HISTORY);
}

function loadCopilotSessions(): { sessions: CopilotSession[]; activeId: string } {
  const saved = storage.getJSON<unknown>(StorageKey.CHAT_SESSIONS);
  const cleaned = Array.isArray(saved)
    ? saved.map(sanitizeSession).filter((session): session is CopilotSession => session !== null)
    : [];

  if (cleaned.length > 0) {
    const storedActive = storage.get(StorageKey.CHAT_ACTIVE_SESSION);
    const activeId = cleaned.some((session) => session.id === storedActive)
      ? storedActive as string
      : cleaned[0].id;
    return { sessions: cleaned.slice(0, MAX_SESSIONS), activeId };
  }

  const history = loadHistory();
  const migrated = createSession({ messages: history });
  storage.setJSON(StorageKey.CHAT_SESSIONS, [migrated]);
  storage.set(StorageKey.CHAT_ACTIVE_SESSION, migrated.id);
  return { sessions: [migrated], activeId: migrated.id };
}

const loadedSessions = loadCopilotSessions();

// ─── Stores ───────────────────────────────────────────────────────────────────

/** AI connection settings. */
export const chatSettings = map<AISettings>(loadSettings());

/** Current interaction mode. */
export const chatMode = atom<ChatMode>(loadMode());

/** All Copilot sessions (persisted). */
export const copilotSessions = atom<CopilotSession[]>(loadedSessions.sessions);

/** Active Copilot session id. */
export const activeCopilotSessionId = atom<string>(loadedSessions.activeId);

/** Chat message history for the active session (persisted). */
export const chatHistory = atom<ChatMessage[]>(
  loadedSessions.sessions.find((session) => session.id === loadedSessions.activeId)?.messages ?? [],
);

/** Submitted prompt history for input recall (persisted). */
export const chatPromptHistory = atom<string[]>(loadPromptHistory());

/** True while an AI response is being streamed. */
export const chatLoading = atom<boolean>(false);

/** Number of unread assistant messages (reset when panel is focused). */
export const chatUnreadCount = atom<number>(0);

/** True while the editor has an active Copilot Keep/Discard review banner. */
export const copilotReviewActive = atom<boolean>(false);

/** Skip writing chatHistory back into sessions (used while switching sessions). */
let suppressSessionSync = false;

function withSuppressedSessionSync(fn: () => void): void {
  suppressSessionSync = true;
  try {
    fn();
  } finally {
    suppressSessionSync = false;
  }
}

function persistSettings(settings: AISettings): void {
  storage.setJSON(StorageKey.CHAT_SETTINGS, {
    endpoint: settings.endpoint,
    model: settings.model,
    maxContextChars: settings.maxContextChars,
    contextWindowTokens: settings.contextWindowTokens,
  });
}

function persistSessions(sessions: readonly CopilotSession[]): void {
  storage.setJSON(StorageKey.CHAT_SESSIONS, sessions.slice(0, MAX_SESSIONS));
}

function patchActiveSession(patch: Partial<CopilotSession>): void {
  const id = activeCopilotSessionId.get();
  const sessions = copilotSessions.get();
  const index = sessions.findIndex((session) => session.id === id);
  if (index < 0) return;
  const current = sessions[index];
  const updated = [...sessions];
  updated[index] = { ...current, ...patch, id: current.id, updatedAt: nowIso() };
  copilotSessions.set(updated);
}

function syncActiveSessionFromHistory(history: readonly ChatMessage[]): void {
  if (suppressSessionSync) return;
  const messages = history.slice(-MAX_HISTORY);
  const id = activeCopilotSessionId.get();
  const sessions = copilotSessions.get();
  const index = sessions.findIndex((session) => session.id === id);
  if (index < 0) return;
  const current = sessions[index];
  const title = current.title === NEW_CHAT_TITLE || !current.title
    ? titleFromMessages(messages)
    : current.title;
  const updated = [...sessions];
  updated[index] = {
    ...current,
    messages,
    title,
    updatedAt: nowIso(),
  };
  copilotSessions.set(updated);
}

function flushActiveSessionMessages(): void {
  syncActiveSessionFromHistory(chatHistory.get());
}

function pruneSessions(sessions: CopilotSession[], keepId: string): CopilotSession[] {
  if (sessions.length <= MAX_SESSIONS) return sessions;
  const extras = sessions.length - MAX_SESSIONS;
  const droppable = sessions
    .filter((session) => session.id !== keepId)
    .slice()
    .sort((a, b) => {
      const aEmpty = a.messages.length === 0 ? 0 : 1;
      const bEmpty = b.messages.length === 0 ? 0 : 1;
      if (aEmpty !== bEmpty) return aEmpty - bEmpty;
      return a.updatedAt.localeCompare(b.updatedAt);
    });
  const dropIds = new Set(droppable.slice(0, extras).map((session) => session.id));
  return sessions.filter((session) => !dropIds.has(session.id));
}

// ─── Persistence ──────────────────────────────────────────────────────────────

chatSettings.subscribe((settings) => {
  persistSettings(settings);
});

chatMode.subscribe((mode) => {
  storage.set(StorageKey.CHAT_MODE, mode);
});

chatHistory.subscribe((history) => {
  storage.setJSON(StorageKey.CHAT_HISTORY, history.slice(-MAX_HISTORY));
  syncActiveSessionFromHistory(history);
});

copilotSessions.subscribe((sessions) => {
  persistSessions(sessions);
});

activeCopilotSessionId.subscribe((id) => {
  storage.set(StorageKey.CHAT_ACTIVE_SESSION, id);
});

chatPromptHistory.subscribe((history) => {
  storage.setJSON(StorageKey.CHAT_PROMPT_HISTORY, history.slice(-MAX_PROMPT_HISTORY));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getActiveCopilotSession(): CopilotSession | undefined {
  const id = activeCopilotSessionId.get();
  return copilotSessions.get().find((session) => session.id === id);
}

export function listCopilotSessions(): CopilotSession[] {
  return copilotSessions.get().slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Start a new empty chat. Reuses the current session when it is already empty. */
export function createCopilotSession(options?: { songHint?: string }): string {
  const current = getActiveCopilotSession();
  if (current && current.messages.length === 0) {
    if (options?.songHint && options.songHint !== current.songHint) {
      patchActiveSession({ songHint: options.songHint });
    }
    return current.id;
  }
  flushActiveSessionMessages();
  const session = createSession({
    songHint: options?.songHint,
    title: NEW_CHAT_TITLE,
    messages: [],
  });
  const next = pruneSessions([session, ...copilotSessions.get()], session.id);
  copilotSessions.set(next);
  withSuppressedSessionSync(() => {
    activeCopilotSessionId.set(session.id);
    chatHistory.set([]);
  });
  chatUnreadCount.set(0);
  return session.id;
}

export function switchCopilotSession(id: string): boolean {
  if (id === activeCopilotSessionId.get()) return true;
  const sessions = copilotSessions.get();
  const next = sessions.find((session) => session.id === id);
  if (!next) return false;
  flushActiveSessionMessages();
  withSuppressedSessionSync(() => {
    activeCopilotSessionId.set(id);
    chatHistory.set(next.messages.slice(-MAX_HISTORY));
  });
  chatUnreadCount.set(0);
  return true;
}

export function deleteCopilotSession(id: string): void {
  const sessions = copilotSessions.get();
  if (sessions.length <= 1) {
    clearChatHistory();
    return;
  }
  const remaining = sessions.filter((session) => session.id !== id);
  copilotSessions.set(remaining);
  if (id !== activeCopilotSessionId.get()) return;
  const next = remaining.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  withSuppressedSessionSync(() => {
    activeCopilotSessionId.set(next.id);
    chatHistory.set(next.messages.slice(-MAX_HISTORY));
  });
  chatUnreadCount.set(0);
}

export function addCopilotSessionUsage(usage?: ChatTokenUsage): void {
  if (!usage) return;
  const current = getActiveCopilotSession();
  const prompt = (current?.tokenTotals?.prompt ?? 0) + usage.promptTokens;
  const completion = (current?.tokenTotals?.completion ?? 0) + usage.completionTokens;
  patchActiveSession({ tokenTotals: { prompt, completion } });
}

/** Append a message to the history. */
export function pushChatMessage(
  role: 'user' | 'assistant',
  content: string,
  meta?: ChatMessageMeta,
): void {
  const history = chatHistory.get();
  const message: ChatMessage = { role, content, timestamp: new Date().toISOString(), ...meta };
  chatHistory.set([...history, message].slice(-MAX_HISTORY));
  if (role === 'assistant') {
    chatUnreadCount.set(chatUnreadCount.get() + 1);
  }
}

/**
 * Append a UI-only informational notice (e.g. "Switched to Edit mode"). Does not
 * count as unread and is excluded from the model context by the panel.
 */
export function pushChatNotice(content: string): void {
  const history = chatHistory.get();
  const message: ChatMessage = {
    role: 'assistant',
    content,
    timestamp: new Date().toISOString(),
    system: true,
  };
  chatHistory.set([...history, message].slice(-MAX_HISTORY));
}

/** Clear all chat history in the active session. */
export function clearChatHistory(): void {
  chatHistory.set([]);
  chatUnreadCount.set(0);
  patchActiveSession({ title: NEW_CHAT_TITLE, tokenTotals: { prompt: 0, completion: 0 } });
}

/** Clear the submitted-prompt recall history. */
export function clearChatPromptHistory(): void {
  chatPromptHistory.set([]);
}

/** Record a submitted user prompt for input recall. */
export function recordChatPrompt(prompt: string): void {
  const trimmed = prompt.trim();
  if (!trimmed) return;
  const deduped = chatPromptHistory.get().filter((entry) => entry !== trimmed);
  chatPromptHistory.set([...deduped, trimmed].slice(-MAX_PROMPT_HISTORY));
}

/** Mark all messages as read. */
export function markChatRead(): void {
  chatUnreadCount.set(0);
}

/**
 * Update the most recent applied assistant message awaiting review (Keep/Discard).
 * Returns true if a pending applied message was found and updated.
 */
export function markLastPendingAppliedEdit(
  outcome: 'kept' | 'discarded',
  patch?: Pick<ChatMessage, 'changeDetails' | 'changedLines' | 'linesAdded' | 'linesRemoved' | 'linesModified'>,
): boolean {
  const history = chatHistory.get();
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i];
    if (
      message.role === 'assistant'
      && message.applied
      && message.applyOutcome === 'pending'
    ) {
      const updated = [...history];
      updated[i] = { ...message, applyOutcome: outcome, ...patch };
      chatHistory.set(updated);
      return true;
    }
  }
  return false;
}

/** Mark every stuck pending applied edit as kept (e.g. before a new review starts). */
export function resolveStuckPendingAppliedEdits(outcome: 'kept' | 'discarded' = 'kept'): number {
  const history = chatHistory.get();
  let count = 0;
  const updated = history.map((message) => {
    if (message.role === 'assistant' && message.applied && message.applyOutcome === 'pending') {
      count += 1;
      return { ...message, applyOutcome: outcome };
    }
    return message;
  });
  if (count > 0) chatHistory.set(updated);
  return count;
}

/** Enable/disable live Copilot review Actions in the chat panel. */
export function setCopilotReviewActive(active: boolean): void {
  copilotReviewActive.set(active);
}

/**
 * Mark the most recent kept Copilot edit as undone via the editor (Ctrl+Z).
 * Returns true if a matching message was found and updated.
 */
export function markLastAppliedEditUndoneInEditor(): boolean {
  const history = chatHistory.get();
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i];
    if (
      message.role === 'assistant'
      && message.applied
      && message.applyOutcome === 'kept'
      && !message.undoneInEditor
    ) {
      const updated = [...history];
      updated[i] = { ...message, undoneInEditor: true };
      chatHistory.set(updated);
      return true;
    }
  }
  return false;
}

/** Update AI settings (partial update supported). */
export function updateChatSettings(partial: Partial<AISettings>): void {
  const current = chatSettings.get();
  const next: AISettings = { ...current, ...partial };
  if (partial.contextWindowTokens !== undefined) {
    next.contextWindowTokens = clampContextWindowTokens(
      partial.contextWindowTokens,
      defaultContextWindowTokens(next.endpoint, next.model),
    );
  }
  chatSettings.set(next);
}
