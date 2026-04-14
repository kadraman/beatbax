/**
 * Plugins section — enable/disable pre-bundled chip plugins.
 *
 * Each toggle persists to localStorage. Changing a toggle triggers a page
 * reload so the chipRegistry is cleanly rebuilt (it has no unregister API).
 */

import { AVAILABLE_PLUGINS, getEnabledPluginIds, setPluginEnabled } from '../../plugins/registry-config';
import { sectionHeading, noteText } from './general';

const BADGE_CLASS: Record<string, string> = {
  Stable:       'bb-settings-badge--stable',
  Beta:         'bb-settings-badge--beta',
  Experimental: 'bb-settings-badge--experimental',
};

export function buildPluginsSection(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'bb-settings-section';

  el.appendChild(sectionHeading('Chip plugins'));
  el.appendChild(noteText(
    'Enable or disable pre-bundled chip backends. ' +
    'The built-in Game Boy chip is always available. ' +
    'Changes take effect after a page reload.'
  ));

  const enabled = getEnabledPluginIds();

  for (const entry of AVAILABLE_PLUGINS) {
    const row = document.createElement('div');
    row.className = 'bb-settings-feature-row';

    const left = document.createElement('div');
    left.className = 'bb-settings-feature-info';

    const titleLine = document.createElement('div');
    titleLine.className = 'bb-settings-feature-title';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = entry.label;

    const badge = document.createElement('span');
    badge.className = `bb-settings-badge ${BADGE_CLASS[entry.badge] ?? ''}`;
    badge.textContent = entry.badge;
    titleLine.append(nameSpan, badge);

    const desc = document.createElement('span');
    desc.className = 'bb-settings-feature-desc';
    desc.textContent = entry.description;

    left.append(titleLine, desc);

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'bb-settings-toggle';
    input.checked = enabled.includes(entry.id);
    input.addEventListener('change', () => {
      setPluginEnabled(entry.id, input.checked);
      // setPluginEnabled reloads the page — no further DOM updates needed.
    });

    row.append(left, input);
    el.appendChild(row);
  }

  return el;
}

export function resetPluginsDefaults(): void {
  localStorage.setItem('beatbax:enabled-plugins', JSON.stringify(['nes']));
  window.location.reload();
}
