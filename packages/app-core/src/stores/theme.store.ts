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
import { BeatBaxSettings, storage, StorageKey } from '../utils/local-storage.js';

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
 *  does this via its `persist` flag).
 *  `color-scheme` tracks the resolved theme so native scrollbars and form
 *  controls follow BeatBax instead of the OS preference (issue #247). */
activeTheme.subscribe((theme) => {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;

  if (theme === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
  }
});
