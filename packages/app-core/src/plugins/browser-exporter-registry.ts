import type { ExporterPlugin } from '@beatbax/engine/export';
import {
  jsonExporterPlugin,
  midiExporterPlugin,
  ugeExporterPlugin,
  wavExporterPlugin,
} from '@beatbax/engine/export';
import { chipRegistry } from '@beatbax/engine/chips';

function bindEnginePlugin(plugin: ExporterPlugin): ExporterPlugin {
  return {
    id: plugin.id,
    label: plugin.label,
    version: plugin.version,
    extension: plugin.extension,
    mimeType: plugin.mimeType,
    supportedChips: plugin.supportedChips,
    export: plugin.export.bind(plugin),
    validate: plugin.validate?.bind(plugin),
  };
}

const BUILTIN_BROWSER_EXPORTERS: ExporterPlugin[] = [
  bindEnginePlugin(jsonExporterPlugin),
  bindEnginePlugin(midiExporterPlugin),
  bindEnginePlugin(ugeExporterPlugin),
  bindEnginePlugin(wavExporterPlugin),
];

function normalizeChipName(chip: string): string {
  return chip.toLowerCase().replace(/[\s_-]/g, '');
}

export class BrowserExporterRegistry {
  private plugins = new Map<string, ExporterPlugin>();

  constructor(defaultPlugins: ExporterPlugin[] = BUILTIN_BROWSER_EXPORTERS) {
    for (const plugin of defaultPlugins) {
      this.plugins.set(plugin.id.toLowerCase(), plugin);
    }
  }

  register(plugin: ExporterPlugin): void {
    const key = plugin.id.toLowerCase();
    if (this.plugins.has(key)) {
      throw new Error(`Exporter plugin '${plugin.id}' is already registered`);
    }
    this.plugins.set(key, plugin);
  }

  get(id: string): ExporterPlugin | undefined {
    return this.plugins.get(id.toLowerCase());
  }

  has(id: string): boolean {
    return this.plugins.has(id.toLowerCase());
  }

  list(chipName?: string): ExporterPlugin[] {
    if (!chipName) return this.all();
    const chip = chipName.toLowerCase();
    const canonical = chipRegistry.resolve(chip);
    const chipNormalized = normalizeChipName(chip);
    return this.all().filter((plugin) =>
      plugin.supportedChips.includes('*') ||
      plugin.supportedChips.some((x) => {
        const supported = x.toLowerCase();
        const supportedCanonical = chipRegistry.resolve(supported);
        return (
          supported === chip ||
          supportedCanonical === canonical ||
          normalizeChipName(supported) === chipNormalized
        );
      }),
    );
  }

  all(): ExporterPlugin[] {
    return Array.from(this.plugins.values());
  }
}

export const exporterRegistry = new BrowserExporterRegistry();
