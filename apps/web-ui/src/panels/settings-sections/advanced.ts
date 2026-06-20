/**
 * Advanced settings section.
 */

import { storage, StorageKey } from '@beatbax/app-core/utils/local-storage';
import {
  settingDebugOverlay, settingDebugOverlayPosition,
  settingDebugOverlayOpacity, settingDebugOverlayFontSize,
} from '@beatbax/app-core/stores/settings.store';
import { sectionHeading, toggle, selectField, rangeField, noteText } from './general';

export function buildAdvancedSection(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'bb-settings-section';

  el.appendChild(sectionHeading('Diagnostics'));

  el.appendChild(toggle('Show debug overlay', settingDebugOverlay.get(), (v) => settingDebugOverlay.set(v)));

  el.appendChild(selectField(
    'Overlay position',
    [
      { value: 'top-right',    label: 'Top right (default)' },
      { value: 'top-left',     label: 'Top left' },
      { value: 'bottom-right', label: 'Bottom right' },
      { value: 'bottom-left',  label: 'Bottom left' },
    ],
    settingDebugOverlayPosition.get(),
    (v) => settingDebugOverlayPosition.set(v as any),
  ));

  el.appendChild(rangeField(
    'Overlay opacity',
    10, 100, 5,
    settingDebugOverlayOpacity.get(),
    '%',
    (v) => settingDebugOverlayOpacity.set(v),
  ));

  el.appendChild(selectField(
    'Overlay font size',
    [
      { value: '10', label: '10px (small)' },
      { value: '11', label: '11px (default)' },
      { value: '12', label: '12px' },
      { value: '13', label: '13px' },
      { value: '14', label: '14px (large)' },
      { value: '16', label: '16px (extra large)' },
    ],
    String(settingDebugOverlayFontSize.get()),
    (v) => settingDebugOverlayFontSize.set(Number(v)),
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
  settingDebugOverlay.set(false);
  settingDebugOverlayPosition.set('top-right');
  settingDebugOverlayOpacity.set(70);
  settingDebugOverlayFontSize.set(11);
}

function resetAllSettings(): void {
  storage.clear();
  window.location.reload();
}
