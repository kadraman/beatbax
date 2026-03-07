/**
 * Local Storage — typed, namespace-safe wrapper around window.localStorage.
 *
 * All keys are automatically prefixed with `beatbax:` to avoid collisions.
 *
 * Usage:
 *   const store = new BeatBaxStorage();
 *   store.set('editor.theme', 'dark');
 *   store.get('editor.theme');          // → 'dark'
 *   store.get('editor.theme', 'light'); // → 'dark' (or 'light' if absent)
 *   store.remove('editor.theme');
 *   store.clear();                      // removes only beatbax:* keys
 *
 * Or use the pre-built typed helpers in BeatBaxSettings.
 */

import { createLogger } from '@beatbax/engine/util/logger';

const log = createLogger('ui:local-storage');

// ─── Constants ────────────────────────────────────────────────────────────────

export const STORAGE_PREFIX = 'beatbax:';

// ─── Well-known keys ─────────────────────────────────────────────────────────

/** All storage keys used by the app. Centralised here to prevent typos. */
export const StorageKey = {
  /** Last editor content (string). */
  EDITOR_CONTENT: 'editor.content',
  /** Active colour theme ('dark' | 'light'). */
  THEME: 'ui.theme',
  /** BPM preference (number encoded as string). */
  BPM: 'editor.bpm',
  /** Auto-save enabled flag (boolean). */
  AUTO_SAVE: 'editor.autoSave',
  /** Last export format used. */
  LAST_EXPORT_FORMAT: 'export.lastFormat',
  /** Logger level setting. */
  LOG_LEVEL: 'debug.logLevel',
} as const;

export type StorageKeyValue = (typeof StorageKey)[keyof typeof StorageKey];

// ─── Low-level helpers ────────────────────────────────────────────────────────

/** Returns localStorage or null when unavailable (e.g. private browsing). */
function getStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// ─── BeatBaxStorage ───────────────────────────────────────────────────────────

export class BeatBaxStorage {
  constructor(private prefix = STORAGE_PREFIX) {}

  private fullKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  /** Read a string value. Returns `defaultValue` when the key is absent or on error. */
  get(key: string, defaultValue?: string): string | undefined {
    try {
      const raw = getStorage()?.getItem(this.fullKey(key));
      if (raw === null || raw === undefined) return defaultValue;
      return raw;
    } catch (err) {
      log.warn(`Storage.get("${key}") failed:`, err);
      return defaultValue;
    }
  }

  /** Read and JSON-parse a value. Returns `defaultValue` on absence or parse error. */
  getJSON<T>(key: string, defaultValue?: T): T | undefined {
    const raw = this.get(key);
    if (raw === undefined) return defaultValue;
    try {
      return JSON.parse(raw) as T;
    } catch (err) {
      log.warn(`Storage.getJSON("${key}") parse error:`, err);
      return defaultValue;
    }
  }

  /** Write a string value. Silently swallows storage errors (e.g. quota exceeded). */
  set(key: string, value: string): void {
    try {
      getStorage()?.setItem(this.fullKey(key), value);
    } catch (err) {
      log.warn(`Storage.set("${key}") failed:`, err);
    }
  }

  /** JSON-stringify and write a value. */
  setJSON<T>(key: string, value: T): void {
    this.set(key, JSON.stringify(value));
  }

  /** Remove a single key. */
  remove(key: string): void {
    try {
      getStorage()?.removeItem(this.fullKey(key));
    } catch (err) {
      log.warn(`Storage.remove("${key}") failed:`, err);
    }
  }

  /** Remove all keys that start with this instance's prefix. */
  clear(): void {
    try {
      const storage = getStorage();
      if (!storage) return;
      const toRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k?.startsWith(this.prefix)) toRemove.push(k);
      }
      toRemove.forEach(k => storage.removeItem(k));
      log.debug(`Cleared ${toRemove.length} storage key(s) with prefix "${this.prefix}"`);
    } catch (err) {
      log.warn('Storage.clear() failed:', err);
    }
  }

  /** Return all key-value pairs that belong to this instance's prefix. */
  entries(): Record<string, string> {
    const result: Record<string, string> = {};
    try {
      const storage = getStorage();
      if (!storage) return result;
      for (let i = 0; i < storage.length; i++) {
        const fullK = storage.key(i);
        if (fullK?.startsWith(this.prefix)) {
          const shortK = fullK.slice(this.prefix.length);
          result[shortK] = storage.getItem(fullK) ?? '';
        }
      }
    } catch (err) {
      log.warn('Storage.entries() failed:', err);
    }
    return result;
  }

  /** Returns true when the key exists in storage. */
  has(key: string): boolean {
    try {
      return getStorage()?.getItem(this.fullKey(key)) !== null;
    } catch {
      return false;
    }
  }
}

// ─── Singleton + typed settings helpers ──────────────────────────────────────

/** Shared singleton storage instance used across the app. */
export const storage = new BeatBaxStorage();

/**
 * Typed convenience accessors for well-known settings.
 * Each method reads/writes through the shared `storage` singleton.
 */
export const BeatBaxSettings = {
  getTheme(): 'dark' | 'light' {
    return (storage.get(StorageKey.THEME, 'dark') as 'dark' | 'light');
  },
  setTheme(theme: 'dark' | 'light'): void {
    storage.set(StorageKey.THEME, theme);
  },

  getEditorContent(): string | undefined {
    return storage.get(StorageKey.EDITOR_CONTENT);
  },
  setEditorContent(content: string): void {
    storage.set(StorageKey.EDITOR_CONTENT, content);
  },

  isAutoSaveEnabled(): boolean {
    return storage.getJSON<boolean>(StorageKey.AUTO_SAVE, true) ?? true;
  },
  setAutoSave(enabled: boolean): void {
    storage.setJSON(StorageKey.AUTO_SAVE, enabled);
  },

  getLastExportFormat(): string | undefined {
    return storage.get(StorageKey.LAST_EXPORT_FORMAT);
  },
  setLastExportFormat(format: string): void {
    storage.set(StorageKey.LAST_EXPORT_FORMAT, format);
  },
} as const;
