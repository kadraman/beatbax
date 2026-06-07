/**
 * Plugins section — enable/disable pre-bundled chip plugins.
 *
 * Each toggle persists to localStorage. Changing a toggle triggers a page
 * reload so the chipRegistry is cleanly rebuilt (it has no unregister API).
 */

import { AVAILABLE_PLUGINS, getEnabledPluginIds, setPluginEnabled } from '@beatbax/app-core/plugins/registry-config';
import { sectionHeading, noteText } from './general';
import { chipRegistry, gameboyPlugin, nesPlugin } from '@beatbax/engine/chips';
import { exporterRegistry } from '@beatbax/app-core/plugins/browser-exporter-registry';
import {
  BUILTIN_EXPORTER_IDS,
  OPTIONAL_EXPORTER_PLUGINS,
  getEnabledExporterPluginIds,
  isExporterDependencySatisfied,
  setExporterPluginEnabled,
} from '@beatbax/app-core/plugins/exporter-registry-config';
import { StorageKey, storage } from '@beatbax/app-core/utils/local-storage';

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
    'Built-in chips are always available. ' +
    'Changes take effect after a page reload.'
  ));

  // ── Built-in chips (always on, no toggle) ──────────────────────────────────
  el.appendChild(builtinSubheading('Built-in'));
  const builtinChips: Array<{ id: string; label: string; description: string; version: string; badge: 'Stable' | 'Beta' }> = [
    {
      id: 'gameboy',
      label: 'Game Boy DMG-01 APU',
      description: '4-channel APU — 2 pulse, wave, and noise. Enables `chip gameboy` in .bax scripts.',
      version: gameboyPlugin.version,
      badge: 'Stable',
    },
    {
      id: 'nes',
      label: 'NES/Famicom (Ricoh 2A03)',
      description:
        'Nintendo Entertainment System / Famicom APU — 2 pulse channels, triangle, noise, and DMC sample playback. ' +
        'Enables `chip nes` or `chip famicom` in .bax scripts.',
      version: nesPlugin.version,
      badge: 'Beta',
    },
  ];
  for (const builtin of builtinChips) {
    const row = document.createElement('div');
    row.className = 'bb-settings-feature-row';

    const left = document.createElement('div');
    left.className = 'bb-settings-feature-info';

    const title = document.createElement('div');
    title.className = 'bb-settings-feature-title';
    const name = document.createElement('span');
    name.textContent = builtin.label;
    const ver = document.createElement('span');
    ver.className = 'bb-settings-plugin-version';
    ver.textContent = `v${builtin.version}`;
    const badge = document.createElement('span');
    badge.className = `bb-settings-badge ${BADGE_CLASS[builtin.badge] ?? ''}`;
    badge.textContent = builtin.badge;
    title.append(name, ver, badge);

    const desc = document.createElement('span');
    desc.className = 'bb-settings-feature-desc';
    desc.textContent = builtin.description;
    left.append(title, desc);

    const locked = document.createElement('span');
    locked.className = 'bb-settings-plugin-builtin';
    locked.textContent = 'Built-in';
    row.append(left, locked);
    el.appendChild(row);
  }

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

  // ── Exporter plugins ────────────────────────────────────────────────────────
  el.appendChild(sectionHeading('Export Plugins'));
  el.appendChild(noteText(
    'Enable or disable optional exporter plugins. Built-in exporters are always available.'
  ));

  // Built-in exporters (always on)
  el.appendChild(builtinSubheading('Built-in'));
  const builtInExporters = exporterRegistry
    .all()
    .filter((plugin) => BUILTIN_EXPORTER_IDS.includes(plugin.id))
    .sort((a, b) => {
      const aUniversal = a.supportedChips.includes('*');
      const bUniversal = b.supportedChips.includes('*');
      if (aUniversal !== bUniversal) return aUniversal ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

  for (const plugin of builtInExporters) {
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

    const stableBadge = document.createElement('span');
    stableBadge.className = `bb-settings-badge ${BADGE_CLASS['Stable']}`;
    stableBadge.textContent = 'Stable';
    titleLine.append(nameSpan, verSpan, stableBadge);

    const ext = plugin.extension.startsWith('.') ? plugin.extension : `.${plugin.extension}`;
    const desc = document.createElement('span');
    desc.className = 'bb-settings-feature-desc';
    desc.textContent = `${plugin.id} (${ext}) - chips: ${plugin.supportedChips.join(', ')}`;

    left.append(titleLine, desc);

    const status = document.createElement('span');
    status.className = 'bb-settings-plugin-builtin';
    status.textContent = 'Built-in';

    row.append(left, status);
    el.appendChild(row);
  }

  // Optional exporters (togglable)
  el.appendChild(builtinSubheading('Optional'));
  const enabledExporters = getEnabledExporterPluginIds();
  for (const entry of OPTIONAL_EXPORTER_PLUGINS) {
    const dependencySatisfied = isExporterDependencySatisfied(entry);
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
    if (dependencySatisfied) {
      desc.textContent = entry.description;
    } else {
      const deps = (entry.dependsOnChipPlugins ?? []).join(', ');
      desc.textContent = `${entry.description} (Disabled: requires enabled chip plugin(s): ${deps})`;
    }
    left.append(titleLine, desc);

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'bb-settings-toggle';
    input.checked = dependencySatisfied && enabledExporters.includes(entry.id);
    input.disabled = !dependencySatisfied;
    input.title = dependencySatisfied ? 'Enable exporter plugin' : 'Enable required chip plugin first';
    input.addEventListener('change', () => {
      setExporterPluginEnabled(entry.id, input.checked);
    });

    row.append(left, input);
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
  storage.setJSON(StorageKey.ENABLED_PLUGINS, ['sms']);
  storage.setJSON(StorageKey.ENABLED_EXPORTER_PLUGINS, OPTIONAL_EXPORTER_PLUGINS.map((entry) => entry.id));
  window.location.reload();
}
