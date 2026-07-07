/**
 * chat.store — AI Copilot chat state (nanostores).
 *
 * Centralises message history, AI connection settings, and request state.
 * The ChatPanel writes to these stores; other components can subscribe
 * (e.g., status-bar badge showing unread message count).
 *
 * localStorage keys (all under the beatbax: prefix via BeatBaxStorage):
 *   beatbax:ai.settings   — endpoint, model, maxContextChars (apiKey is runtime-only)
 *   beatbax:ai.mode       — 'edit' | 'ask'
 *   beatbax:ai.chatHistory — persisted message array (capped at MAX_HISTORY)
 *   beatbax:ai.promptHistory — persisted submitted prompts (capped at MAX_PROMPT_HISTORY)
 */

import { atom, map } from 'nanostores';
import { getDefaultAIModel } from './ai-models.js';
import { storage, StorageKey } from '../utils/local-storage.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ChatMode = 'edit' | 'ask';

export interface AISettings {
  endpoint: string;
  apiKey: string;
  model: string;
  maxContextChars: number;
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
  /** Number of changed lines when the reply was applied. */
  changedLines?: number;
  /**
   * Human-readable bullet summary of the structural edits applied to the song
   * (e.g. "Added pattern `melody_var`"). Shown in the applied confirmation.
   */
  changeSummary?: string[];
  /**
   * UI-only informational notice (e.g. "Switched to Edit mode"). Rendered as a
   * centered muted line and excluded from the context sent to the model.
   */
  system?: boolean;
}

export interface ChatMessageMeta {
  display?: string;
  applied?: boolean;
  changedLines?: number;
  changeSummary?: string[];
  system?: boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const MAX_HISTORY = 50;
const MAX_PROMPT_HISTORY = 50;
const MIN_CONTEXT_CHARS = 100;
const MAX_CONTEXT_CHARS = 32000;

function clampContextChars(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_CONTEXT_CHARS, Math.max(MIN_CONTEXT_CHARS, Math.round(value)));
}

// ─── Loaders ──────────────────────────────────────────────────────────────────

function loadSettings(): AISettings {
  const defaults: AISettings = {
    endpoint: 'https://api.openai.com/v1',
    apiKey: '',
    model: getDefaultAIModel(),
    maxContextChars: 12000,
  };
  // Scrub any legacy key written by older versions of the app before the
  // no-persist-apiKey policy was introduced.
  try { localStorage.removeItem('bb-ai-settings'); } catch { /* ignore */ }

  const saved = storage.getJSON<Partial<AISettings>>(StorageKey.CHAT_SETTINGS);
  if (!saved) return defaults;
  const sanitized: AISettings = {
    endpoint: typeof saved.endpoint === 'string' && saved.endpoint.trim() ? saved.endpoint : defaults.endpoint,
    apiKey: '',
    model: typeof saved.model === 'string' && saved.model.trim() ? saved.model : defaults.model,
    maxContextChars: clampContextChars(saved.maxContextChars, defaults.maxContextChars),
  };
  storage.setJSON(StorageKey.CHAT_SETTINGS, {
    endpoint: sanitized.endpoint,
    model: sanitized.model,
    maxContextChars: sanitized.maxContextChars,
  });
  return sanitized;
}

function loadMode(): ChatMode {
  const raw = storage.get(StorageKey.CHAT_MODE);
  return raw === 'ask' || raw === 'edit' ? raw : 'edit';
}

function loadHistory(): ChatMessage[] {
  const parsed = storage.getJSON<ChatMessage[]>(StorageKey.CHAT_HISTORY);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((message): message is ChatMessage => {
      return message
        && (message.role === 'user' || message.role === 'assistant')
        && typeof message.content === 'string'
        && typeof message.timestamp === 'string';
    })
    .slice(-MAX_HISTORY);
}

function loadPromptHistory(): string[] {
  const parsed = storage.getJSON<string[]>(StorageKey.CHAT_PROMPT_HISTORY);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((prompt): prompt is string => typeof prompt === 'string' && prompt.trim().length > 0)
    .map((prompt) => prompt.trim())
    .slice(-MAX_PROMPT_HISTORY);
}

// ─── Stores ───────────────────────────────────────────────────────────────────

/** AI connection settings. */
export const chatSettings = map<AISettings>(loadSettings());

/** Current interaction mode. */
export const chatMode = atom<ChatMode>(loadMode());

/** Chat message history (persisted). */
export const chatHistory = atom<ChatMessage[]>(loadHistory());

/** Submitted prompt history for input recall (persisted). */
export const chatPromptHistory = atom<string[]>(loadPromptHistory());

/** True while an AI response is being streamed. */
export const chatLoading = atom<boolean>(false);

/** Number of unread assistant messages (reset when panel is focused). */
export const chatUnreadCount = atom<number>(0);

// ─── Persistence ──────────────────────────────────────────────────────────────

chatSettings.subscribe((settings) => {
  const persistedSettings = {
    endpoint: settings.endpoint,
    model: settings.model,
    maxContextChars: settings.maxContextChars,
  };
  storage.setJSON(StorageKey.CHAT_SETTINGS, persistedSettings);
});

chatMode.subscribe((mode) => {
  storage.set(StorageKey.CHAT_MODE, mode);
});

chatHistory.subscribe((history) => {
  storage.setJSON(StorageKey.CHAT_HISTORY, history.slice(-MAX_HISTORY));
});

chatPromptHistory.subscribe((history) => {
  storage.setJSON(StorageKey.CHAT_PROMPT_HISTORY, history.slice(-MAX_PROMPT_HISTORY));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

/** Clear all chat history. */
export function clearChatHistory(): void {
  chatHistory.set([]);
  chatUnreadCount.set(0);
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

/** Update AI settings (partial update supported). */
export function updateChatSettings(partial: Partial<AISettings>): void {
  chatSettings.set({ ...chatSettings.get(), ...partial });
}
