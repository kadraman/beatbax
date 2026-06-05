/**
 * Web UI chip plugin registry configuration.
 *
 * All plugins are pre-bundled at build time (Vite resolves static imports).
 * The user can toggle each plugin on/off via Settings → Plugins; the choice is
 * persisted to localStorage and applied on the next page load.
 *
 * Built-in chips (Game Boy, NES) are always provided by the engine.
 * This registry only handles optional chip plugins.
 */

import { chipRegistry } from '@beatbax/engine/chips';
import type { ChipPlugin } from '@beatbax/engine/chips';
import smsPlugin from '@beatbax/plugin-chip-sms';
import spectrumPlugin from '@beatbax/plugin-chip-spectrum-128';
import { storage, StorageKey } from '../utils/local-storage.js';

// ─── Catalogue ────────────────────────────────────────────────────────────────

export interface PluginEntry {
  /** Matches ChipPlugin.name and the `chip` directive value. */
  id: string;
  label: string;
  description: string;
  badge: 'Stable' | 'Beta' | 'Experimental';
  plugin: ChipPlugin;
}

export const AVAILABLE_PLUGINS: PluginEntry[] = [
  {
    id: 'sms',
    label: 'SMS (SN76489)',
    description:
      'Sega Master System / Game Gear PSG - 3 tone channels + 1 noise channel. ' +
      'Enables `chip sms` in .bax scripts.',
    badge: 'Beta',
    plugin: smsPlugin,
  },
  {
    id: 'spectrum-128',
    label: 'ZX Spectrum 128 / AY-3-8912',
    description:
      'ZX Spectrum 128 and Amstrad CPC AY PSG — 3 tone channels + noise. ' +
      'Enables `chip spectrum-128` in .bax scripts.',
    badge: 'Experimental',
    plugin: spectrumPlugin,
  },
  // Future plugins — add entries here as packages are published:
  // {
  //   id: 'sid',
  //   label: 'C64 SID',
  //   description: 'Commodore 64 SID chip — 3 voices, ADSR, waveforms, ring mod.',
  //   badge: 'Experimental',
  //   plugin: sidPlugin,
  // },
];

// ─── Storage key ─────────────────────────────────────────────────────────────

const DEFAULT_ENABLED = ['sms'];

// ─── Public API ───────────────────────────────────────────────────────────────

/** Return the list of plugin IDs currently enabled in localStorage. */
export function getEnabledPluginIds(): string[] {
  const parsed = storage.getJSON<string[]>(StorageKey.ENABLED_PLUGINS);
  return Array.isArray(parsed) ? parsed : DEFAULT_ENABLED;
}

/** Persist a new set of enabled plugin IDs. Triggers a page reload. */
export function setPluginEnabled(id: string, enabled: boolean): void {
  const current = getEnabledPluginIds();
  const next = enabled
    ? [...new Set([...current, id])]
    : current.filter((x) => x !== id);
  storage.setJSON(StorageKey.ENABLED_PLUGINS, next);
  // Chip registry has no unregister — reload to apply cleanly.
  window.location.reload();
}

/**
 * Register all enabled plugins with the chipRegistry.
 * Call this once at app startup, before any parse/playback.
 */
export function loadPluginsFromStorage(): void {
  const enabled = getEnabledPluginIds();
  for (const entry of AVAILABLE_PLUGINS) {
    if (enabled.includes(entry.id) && !chipRegistry.has(entry.id)) {
      chipRegistry.register(entry.plugin);
    }
  }
}
