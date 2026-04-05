/**
 * Advanced settings section.
 */

import { storage, StorageKey } from '../../utils/local-storage';
import {
  settingLogLevel, settingDebugOverlay, settingDebugExposePlayer,
} from '../../stores/settings.store';
import { sectionHeading, toggle, selectField, noteText } from './general';

export function buildAdvancedSection(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'bb-settings-section';

  el.appendChild(sectionHeading('Diagnostics'));

  el.appendChild(selectField(
    'Log level',
    [
      { value: 'error', label: 'Error' },
      { value: 'warn',  label: 'Warn (default)' },
      { value: 'info',  label: 'Info' },
      { value: 'debug', label: 'Debug' },
    ],
    settingLogLevel.get(),
    (v) => settingLogLevel.set(v as any),
  ));

  el.appendChild(toggle('Show debug overlay', settingDebugOverlay.get(), (v) => settingDebugOverlay.set(v)));

  el.appendChild(toggle(
    'Expose window.__beatbax_player',
    settingDebugExposePlayer.get(),
    (v) => settingDebugExposePlayer.set(v),
  ));

  el.appendChild(sectionHeading('Danger zone'));

  el.appendChild(noteText('Reset all settings removes every beatbax:* key from localStorage and reloads the page.'));

  const resetAllBtn = document.createElement('button');
  resetAllBtn.type = 'button';
  resetAllBtn.className = 'bb-settings-btn-danger';
  resetAllBtn.textContent = 'Reset all settings…';
  resetAllBtn.addEventListener('click', () => {
    if (confirm('Reset ALL BeatBax settings to defaults and reload? This cannot be undone.')) {
      resetAllSettings();
    }
  });
  el.appendChild(resetAllBtn);

  return el;
}

export function resetAdvancedDefaults(): void {
  const defaults: Record<string, string> = {
    [StorageKey.LOG_LEVEL]:           'warn',
    [StorageKey.DEBUG_OVERLAY]:       'false',
    [StorageKey.DEBUG_EXPOSE_PLAYER]: 'true',
  };
  for (const [key, val] of Object.entries(defaults)) storage.set(key, val);
}

function resetAllSettings(): void {
  storage.clear();
  window.location.reload();
}
