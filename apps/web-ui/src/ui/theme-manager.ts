/**
 * ThemeManager - Dark/light theme switching for the BeatBax Web UI
 *
 * Responsibilities:
 * - Switch between dark and light themes
 * - Apply theme to Monaco editor and the surrounding UI (via data-theme attribute)
 * - Persist the user's preference to localStorage
 * - Listen for the OS-level prefers-color-scheme media query and sync on first load
 * - Emit 'theme:changed' events via EventBus so other panels can react
 */

import * as monaco from 'monaco-editor';
import type { EventBus } from '../utils/event-bus';
import { BeatBaxSettings, storage, StorageKey } from '../utils/local-storage';
import { createLogger } from '@beatbax/engine/util/logger';

const log = createLogger('ui:theme-manager');

export type Theme = 'dark' | 'light';

/** Monaco theme identifier corresponding to each Theme */
const MONACO_THEMES: Record<Theme, string> = {
  dark: 'beatbax-dark',
  light: 'vs-light',
};

export interface ThemeManagerOptions {
  /** EventBus instance for emitting theme change events */
  eventBus: EventBus;
  /**
   * Element to stamp with a `data-theme` attribute.
   * Defaults to `document.documentElement`.
   */
  root?: HTMLElement;
}

/**
 * Manages UI theme switching between dark and light modes.
 *
 * Usage:
 * ```typescript
 * const themeManager = new ThemeManager({ eventBus });
 * themeManager.init();
 *
 * // toggle from a button
 * themeManager.toggle();
 *
 * // set explicitly
 * themeManager.setTheme('light');
 *
 * // read current theme
 * console.log(themeManager.currentTheme); // 'dark' | 'light'
 * ```
 */
export class ThemeManager {
  private _theme: Theme = 'dark';
  private readonly root: HTMLElement;
  private readonly eventBus: EventBus;
  /** AbortController used to remove the matchMedia listener on dispose */
  private abortController = new AbortController();

  constructor(options: ThemeManagerOptions) {
    this.eventBus = options.eventBus;
    this.root = options.root ?? document.documentElement;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** The currently active theme. */
  get currentTheme(): Theme {
    return this._theme;
  }

  /**
   * Initialize the theme manager.
   * Reads persisted preference from localStorage; falls back to the OS default.
   * Applies the resolved theme and sets up a listener for system theme changes.
   */
  init(): void {
    const stored = this.loadStoredTheme();

    if (stored) {
      log.debug(`Restoring persisted theme: ${stored}`);
      this.applyTheme(stored, /* persist */ false);
    } else {
      const systemTheme = this.detectSystemTheme();
      log.debug(`No stored theme — using system preference: ${systemTheme}`);
      this.applyTheme(systemTheme, /* persist */ false);
    }

    // Keep in sync when the user changes their OS preference (but only if they
    // haven't explicitly chosen a theme themselves).
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      if (!this.loadStoredTheme()) {
        // No explicit user preference → follow the OS setting.
        this.applyTheme(e.matches ? 'dark' : 'light', /* persist */ false);
      }
    };

    // addEventListener with AbortSignal is supported in all modern browsers.
    mq.addEventListener('change', handleChange, {
      signal: this.abortController.signal,
    });
  }

  /**
   * Explicitly set a theme.
   * Persists the choice and emits `theme:changed`.
   */
  setTheme(theme: Theme): void {
    this.applyTheme(theme, /* persist */ true);
  }

  /**
   * Toggle between dark and light.
   * Persists the choice and emits `theme:changed`.
   */
  toggle(): void {
    this.setTheme(this._theme === 'dark' ? 'light' : 'dark');
  }

  /**
   * Remove event listeners. Call when unmounting the UI.
   */
  dispose(): void {
    this.abortController.abort();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Apply a theme without necessarily persisting it. */
  private applyTheme(theme: Theme, persist: boolean): void {
    this._theme = theme;

    // 1. CSS custom-property layer: stamp root element with `data-theme`
    //    CSS should use [data-theme="dark"] / [data-theme="light"] selectors.
    this.root.setAttribute('data-theme', theme);

    // 2. Monaco editor theme
    try {
      monaco.editor.setTheme(MONACO_THEMES[theme]);
    } catch (err) {
      // Monaco may not be initialised yet on very early calls — safe to ignore.
      log.debug('monaco.editor.setTheme deferred (Monaco not ready):', err);
    }

    // 3. Persist to localStorage (only on explicit user choice)
    if (persist) {
      BeatBaxSettings.setTheme(theme);
    }

    // 4. Notify other components
    this.eventBus.emit('theme:changed', { theme });

    log.debug(`Theme applied: ${theme}`);
  }

  /** Read the previously persisted theme, or null if none. */
  private loadStoredTheme(): Theme | null {
    if (!storage.has(StorageKey.THEME)) return null;
    return BeatBaxSettings.getTheme();
  }

  /** Detect the OS-level colour-scheme preference. */
  private detectSystemTheme(): Theme {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    } catch {
      return 'dark'; // safe default for a music tool
    }
  }
}
