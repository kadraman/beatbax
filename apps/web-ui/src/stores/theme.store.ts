/**
 * theme.store — UI theme state (nanostores).
 *
 * Single source of truth for the active theme so all components can react
 * to theme changes without subscribing to the event-bus.
 *
 * The ThemeManager writes to this store; UI components subscribe.
 *
 * localStorage key: 'beatbax:theme'
 */

import { atom } from 'nanostores';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'beatbax:theme';

function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* ignore */ }
  // Fall back to OS preference
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'dark';
  }
}

/** Currently active theme. */
export const activeTheme = atom<Theme>(loadTheme());

/** Persist to localStorage and toggle the Tailwind `dark` / `light` class on <html>. */
activeTheme.subscribe((theme) => {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch { /* ignore */ }

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
