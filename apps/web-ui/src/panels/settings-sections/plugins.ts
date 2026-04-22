/**
 * Plugins section — enable/disable pre-bundled chip plugins.
 *
 * Each toggle persists to localStorage. Changing a toggle triggers a page
 * reload so the chipRegistry is cleanly rebuilt (it has no unregister API).
 */

import { AVAILABLE_PLUGINS, getEnabledPluginIds, setPluginEnabled } from '../../plugins/registry-config';
import { sectionHeading, noteText, selectField } from './general';
import { gameboyPlugin } from '@beatbax/engine/chips';
import { exporterRegistry } from '@beatbax/engine/export';
import {
  BUILTIN_EXPORTER_IDS,
  OPTIONAL_EXPORTER_PLUGINS,
  getEnabledExporterPluginIds,
  isExporterDependencySatisfied,
  setExporterPluginEnabled,
} from '../../plugins/exporter-registry-config';
import { StorageKey, storage } from '../../utils/local-storage';
import {
  setNesWebAudioMixMode,
  getNesWebAudioMixMode,
  type NesWebAudioMixMode,
} from '@beatbax/plugin-chip-nes';

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

  if (enabled.includes('nes')) {
    el.appendChild(sectionHeading('NES plugin audio'));
    const currentMode = storage.get(StorageKey.NES_WEB_AUDIO_MIX_MODE);
    const initialMode: NesWebAudioMixMode = currentMode === 'hardware' ? 'hardware' : getNesWebAudioMixMode();

    el.appendChild(selectField(
      'NES WebAudio mix mode',
      [
        { value: 'normalized', label: 'Normalized (BeatBax parity, louder)' },
        { value: 'hardware', label: 'Hardware-accurate (quieter, tracker-like)' },
      ],
      initialMode,
      (v) => {
        const mode: NesWebAudioMixMode = v === 'hardware' ? 'hardware' : 'normalized';
        storage.set(StorageKey.NES_WEB_AUDIO_MIX_MODE, mode);
        setNesWebAudioMixMode(mode);
      },
    ));
    el.appendChild(noteText('Applied immediately to NES playback and Web UI WAV export. Choose Hardware-accurate for closer level matching with FamiTracker/hardware renders.'));
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
    desc.textContent = `${plugin.id} (${ext}) — chips: ${plugin.supportedChips.join(', ')}`;

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
  storage.setJSON(StorageKey.ENABLED_PLUGINS, ['nes']);
  storage.setJSON(StorageKey.ENABLED_EXPORTER_PLUGINS, OPTIONAL_EXPORTER_PLUGINS.map((entry) => entry.id));
  storage.set(StorageKey.NES_WEB_AUDIO_MIX_MODE, 'normalized');
  window.location.reload();
}
