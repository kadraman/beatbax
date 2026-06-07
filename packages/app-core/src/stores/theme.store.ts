/**
 * theme.store — UI theme state (nanostores).
 *
 * Single source of truth for the active theme so all components can react
 * to theme changes without subscribing to the event-bus.
 *
 * The ThemeManager writes to this store; UI components subscribe.
 *
 * Persistence is delegated to BeatBaxSettings (key: beatbax:ui.theme) so this
 * store and ThemeManager share the same localStorage entry.
 */

import { atom } from 'nanostores';
import { BeatBaxSettings, storage, StorageKey } from '../utils/local-storage';

export type Theme = 'dark' | 'light';

function loadTheme(): Theme {
  // Only read the persisted value when it has actually been saved; otherwise
  // fall back to the OS colour-scheme preference so first-run respects it.
  if (storage.has(StorageKey.THEME)) return BeatBaxSettings.getTheme();
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'dark';
  }
}

/** Currently active theme. */
export const activeTheme = atom<Theme>(loadTheme());

/** Toggle the Tailwind `dark` / `light` class on <html> when the theme changes.
 *  Persistence is intentionally omitted here — callers that want to save the
 *  user's choice must call BeatBaxSettings.setTheme() themselves (ThemeManager
 *  does this via its `persist` flag). */
activeTheme.subscribe((theme) => {
  // Apply data-theme attribute (used by CSS variable selectors)
  document.documentElement.setAttribute('data-theme', theme);

  // Apply / remove `dark` class for Tailwind dark-variant utilities
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  } else {
    document.documentElement.classList.add('light');
    document.documentElement.classList.remove('dark');
  }
});
