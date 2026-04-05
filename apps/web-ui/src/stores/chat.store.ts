/**
 * chat.store — AI Copilot chat state (nanostores).
 *
 * Centralises message history, AI connection settings, and request state.
 * The ChatPanel writes to these stores; other components can subscribe
 * (e.g., status-bar badge showing unread message count).
 *
 * localStorage keys (all under the beatbax: prefix via BeatBaxStorage):
 *   beatbax:ai.settings   — endpoint, apiKey, model
 *   beatbax:ai.mode       — 'edit' | 'ask'
 *   beatbax:ai.chatHistory — persisted message array (capped at MAX_HISTORY)
 */

import { atom, map } from 'nanostores';
import { storage, StorageKey } from '../utils/local-storage';

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
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const MAX_HISTORY = 50;

// ─── Loaders ──────────────────────────────────────────────────────────────────

function loadSettings(): AISettings {
  const defaults: AISettings = {
    endpoint: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    maxContextChars: 3000,
  };
  // Scrub any legacy key written by older versions of the app before the
  // no-persist-apiKey policy was introduced.
  try { localStorage.removeItem('bb-ai-settings'); } catch { /* ignore */ }

  const saved = storage.getJSON<Partial<AISettings>>(StorageKey.CHAT_SETTINGS);
  if (!saved) return defaults;
  // Sanitize: strip any corrupt non-ASCII value that may have been stored previously
  const apiKey = (typeof saved.apiKey === 'string' && /^[\x20-\x7E]*$/.test(saved.apiKey))
    ? saved.apiKey
    : '';
  return { ...defaults, ...saved, apiKey };
}

function loadMode(): ChatMode {
  const raw = storage.get(StorageKey.CHAT_MODE);
  return raw === 'ask' || raw === 'edit' ? raw : 'edit';
}

function loadHistory(): ChatMessage[] {
  const parsed = storage.getJSON<ChatMessage[]>(StorageKey.CHAT_HISTORY);
  return Array.isArray(parsed) ? parsed.slice(-MAX_HISTORY) : [];
}

// ─── Stores ───────────────────────────────────────────────────────────────────

/** AI connection settings. */
export const chatSettings = map<AISettings>(loadSettings());

/** Current interaction mode. */
export const chatMode = atom<ChatMode>(loadMode());

/** Chat message history (persisted). */
export const chatHistory = atom<ChatMessage[]>(loadHistory());

/** True while an AI response is being streamed. */
export const chatLoading = atom<boolean>(false);

/** Number of unread assistant messages (reset when panel is focused). */
export const chatUnreadCount = atom<number>(0);

// ─── Persistence ──────────────────────────────────────────────────────────────

chatSettings.subscribe((settings) => {
  storage.setJSON(StorageKey.CHAT_SETTINGS, settings);
});

chatMode.subscribe((mode) => {
  storage.set(StorageKey.CHAT_MODE, mode);
});

chatHistory.subscribe((history) => {
  storage.setJSON(StorageKey.CHAT_HISTORY, history.slice(-MAX_HISTORY));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Append a message to the history. */
export function pushChatMessage(role: 'user' | 'assistant', content: string): void {
  const history = chatHistory.get();
  const message: ChatMessage = { role, content, timestamp: new Date().toISOString() };
  chatHistory.set([...history, message].slice(-MAX_HISTORY));
  if (role === 'assistant') {
    chatUnreadCount.set(chatUnreadCount.get() + 1);
  }
}

/** Clear all chat history. */
export function clearChatHistory(): void {
  chatHistory.set([]);
  chatUnreadCount.set(0);
}

/** Mark all messages as read. */
export function markChatRead(): void {
  chatUnreadCount.set(0);
}

/** Update AI settings (partial update supported). */
export function updateChatSettings(partial: Partial<AISettings>): void {
  chatSettings.set({ ...chatSettings.get(), ...partial });
}
