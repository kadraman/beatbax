/**
 * Plugins section — enable/disable pre-bundled chip plugins.
 *
 * Each toggle persists to localStorage. Changing a toggle triggers a page
 * reload so the chipRegistry is cleanly rebuilt (it has no unregister API).
 */

import { AVAILABLE_PLUGINS, getEnabledPluginIds, setPluginEnabled } from '../../plugins/registry-config';
import { sectionHeading, noteText } from './general';
import { gameboyPlugin } from '@beatbax/engine/chips';
import { exporterRegistry } from '@beatbax/engine';

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

  // ── Built-in chips (always on, no toggle) ──────────────────────────────────
  el.appendChild(builtinSubheading('Built-in'));

  const gbRow = document.createElement('div');
  gbRow.className = 'bb-settings-feature-row';

  const gbLeft = document.createElement('div');
  gbLeft.className = 'bb-settings-feature-info';

  const gbTitle = document.createElement('div');
  gbTitle.className = 'bb-settings-feature-title';
  const gbName = document.createElement('span');
  gbName.textContent = 'Game Boy DMG-01 APU';
  const gbVer = document.createElement('span');
  gbVer.className = 'bb-settings-plugin-version';
  gbVer.textContent = `v${gameboyPlugin.version}`;
  const gbBadge = document.createElement('span');
  gbBadge.className = 'bb-settings-badge bb-settings-badge--stable';
  gbBadge.textContent = 'Stable';
  gbTitle.append(gbName, gbVer, gbBadge);

  const gbDesc = document.createElement('span');
  gbDesc.className = 'bb-settings-feature-desc';
  gbDesc.textContent = '4-channel APU — 2 pulse, wave, and noise. Enables `chip gameboy` in .bax scripts.';
  gbLeft.append(gbTitle, gbDesc);

  const gbLocked = document.createElement('span');
  gbLocked.className = 'bb-settings-plugin-builtin';
  gbLocked.textContent = 'Built-in';
  gbRow.append(gbLeft, gbLocked);
  el.appendChild(gbRow);

  // ── Optional plugins (togglable) ───────────────────────────────────────────
  el.appendChild(builtinSubheading('Optional'));

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

    const verSpan = document.createElement('span');
    verSpan.className = 'bb-settings-plugin-version';
    verSpan.textContent = `v${entry.plugin.version}`;

    const badge = document.createElement('span');
    badge.className = `bb-settings-badge ${BADGE_CLASS[entry.badge] ?? ''}`;
    badge.textContent = entry.badge;
    titleLine.append(nameSpan, verSpan, badge);

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

  // ── Installed exporter plugins (read-only) ─────────────────────────────────
  el.appendChild(builtinSubheading('Installed exporter plugins'));
  el.appendChild(noteText(
    'Exporter plugins are provided by the engine and enabled chip plugins. ' +
    'Built-ins include JSON, MIDI, UGE, and WAV.'
  ));

  const exporters = exporterRegistry.all().slice().sort((a, b) => a.id.localeCompare(b.id));
  for (const plugin of exporters) {
    const row = document.createElement('div');
    row.className = 'bb-settings-feature-row';

    const left = document.createElement('div');
    left.className = 'bb-settings-feature-info';

    const titleLine = document.createElement('div');
    titleLine.className = 'bb-settings-feature-title';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = plugin.label;

    const verSpan = document.createElement('span');
    verSpan.className = 'bb-settings-plugin-version';
    verSpan.textContent = `v${plugin.version}`;
    titleLine.append(nameSpan, verSpan);

    const ext = plugin.extension.startsWith('.') ? plugin.extension : `.${plugin.extension}`;
    const desc = document.createElement('span');
    desc.className = 'bb-settings-feature-desc';
    desc.textContent = `${plugin.id} (${ext}) — chips: ${plugin.supportedChips.join(', ')}`;

    left.append(titleLine, desc);

    const status = document.createElement('span');
    status.className = 'bb-settings-plugin-builtin';
    status.textContent = 'Installed';

    row.append(left, status);
    el.appendChild(row);
  }

  return el;
}

function builtinSubheading(text: string): HTMLElement {
  const h = document.createElement('div');
  h.className = 'bb-settings-subheading';
  h.textContent = text;
  return h;
}

export function resetPluginsDefaults(): void {
  localStorage.setItem('beatbax:enabled-plugins', JSON.stringify(['nes']));
  window.location.reload();
}
