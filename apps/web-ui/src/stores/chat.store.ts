/**
 * chat.store — AI Copilot chat state (nanostores).
 *
 * Centralises message history, AI connection settings, and request state.
 * The ChatPanel writes to these stores; other components can subscribe
 * (e.g., status-bar badge showing unread message count).
 *
 * localStorage keys:
 *   bb-ai-settings  — endpoint, apiKey, model
 *   bb-ai-mode      — 'edit' | 'ask'
 *   bb-chat-history — persisted message array (capped at MAX_HISTORY)
 */

import { atom, map } from 'nanostores';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ChatMode = 'edit' | 'ask';

export interface AISettings {
  endpoint: string;
  apiKey: string;
  model: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** ISO timestamp */
  timestamp: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const SETTINGS_KEY  = 'bb-ai-settings';
const MODE_KEY      = 'bb-ai-mode';
const HISTORY_KEY   = 'bb-chat-history';
const MAX_HISTORY   = 50;

// ─── Loaders ──────────────────────────────────────────────────────────────────

function loadSettings(): AISettings {
  const defaults: AISettings = {
    endpoint: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaults;
}

function loadMode(): ChatMode {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    if (raw === 'ask' || raw === 'edit') return raw;
  } catch { /* ignore */ }
  return 'edit';
}

function loadHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ChatMessage[];
      if (Array.isArray(parsed)) return parsed.slice(-MAX_HISTORY);
    }
  } catch { /* ignore */ }
  return [];
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
  try {
    // Never persist the API key to localStorage — require the user to re-enter it
    const { apiKey: _apiKey, ...safe } = settings;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...safe, apiKey: '' }));
  } catch { /* ignore */ }
});

chatMode.subscribe((mode) => {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch { /* ignore */ }
});

chatHistory.subscribe((history) => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY)));
  } catch { /* ignore */ }
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
