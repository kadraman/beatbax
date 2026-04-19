import { exporterRegistry } from '@beatbax/engine/export';
import type { ExporterPlugin } from '@beatbax/engine/export';
import famitrackerExporterPlugins from '@beatbax/plugin-exporter-famitracker';
import { storage, StorageKey } from '../utils/local-storage.js';
import { getEnabledPluginIds } from './registry-config.js';

export interface ExporterPluginEntry {
  id: string;
  label: string;
  description: string;
  badge: 'Stable' | 'Beta' | 'Experimental';
  plugin: ExporterPlugin;
  dependsOnChipPlugins?: string[];
}

const optionalFamitrackerPlugins = Array.isArray(famitrackerExporterPlugins)
  ? famitrackerExporterPlugins
  : [famitrackerExporterPlugins];

export const OPTIONAL_EXPORTER_PLUGINS: ExporterPluginEntry[] = optionalFamitrackerPlugins.map((plugin) => ({
  id: plugin.id,
  label: plugin.label,
  description:
    plugin.id === 'famitracker-text'
      ? 'FamiTracker text export placeholder (.txt) for NES songs.'
      : 'FamiTracker binary export placeholder (.ftm) for NES songs.',
  badge: 'Experimental',
  plugin,
  dependsOnChipPlugins: ['nes'],
}));

export const BUILTIN_EXPORTER_IDS = ['json', 'midi', 'uge', 'wav'];

const DEFAULT_ENABLED_EXPORTERS = OPTIONAL_EXPORTER_PLUGINS.map((entry) => entry.id);

export function getEnabledExporterPluginIds(): string[] {
  const parsed = storage.getJSON<string[]>(StorageKey.ENABLED_EXPORTER_PLUGINS);
  return Array.isArray(parsed) ? parsed : DEFAULT_ENABLED_EXPORTERS;
}

export function setExporterPluginEnabled(id: string, enabled: boolean): void {
  const current = getEnabledExporterPluginIds();
  const next = enabled
    ? [...new Set([...current, id])]
    : current.filter((x) => x !== id);
  storage.setJSON(StorageKey.ENABLED_EXPORTER_PLUGINS, next);
  window.location.reload();
}

export function isExporterDependencySatisfied(entry: ExporterPluginEntry): boolean {
  if (!entry.dependsOnChipPlugins || entry.dependsOnChipPlugins.length === 0) return true;
  const enabledChips = getEnabledPluginIds();
  return entry.dependsOnChipPlugins.every((chipId) => enabledChips.includes(chipId));
}

export function loadExporterPluginsFromStorage(): void {
  const enabledExporterIds = getEnabledExporterPluginIds();
  for (const entry of OPTIONAL_EXPORTER_PLUGINS) {
    if (!enabledExporterIds.includes(entry.id)) continue;
    if (!isExporterDependencySatisfied(entry)) continue;
    if (!exporterRegistry.has(entry.plugin.id)) {
      exporterRegistry.register(entry.plugin);
    }
  }
}
