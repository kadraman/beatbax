import type { ExporterPlugin } from '@beatbax/engine/export';
import { chipRegistry } from '@beatbax/engine/chips';

const BUILTIN_BROWSER_EXPORTERS: ExporterPlugin[] = [
  {
    id: 'json',
    label: 'JSON (ISM)',
    version: '1.0.0',
    extension: 'json',
    mimeType: 'application/json',
    supportedChips: ['*'],
    async export() {
      throw new Error('JSON export is handled by web-ui ExportManager');
    },
  },
  {
    id: 'midi',
    label: 'MIDI (SMF)',
    version: '1.0.0',
    extension: 'mid',
    mimeType: 'audio/midi',
    supportedChips: ['*'],
    async export() {
      throw new Error('MIDI export is handled by web-ui ExportManager');
    },
  },
  {
    id: 'uge',
    label: 'hUGETracker UGE',
    version: '1.0.0',
    extension: 'uge',
    mimeType: 'application/octet-stream',
    supportedChips: ['gameboy', 'gb', 'dmg'],
    async export() {
      throw new Error('UGE export is handled by web-ui ExportManager');
    },
  },
  {
    id: 'wav',
    label: 'WAV',
    version: '1.0.0',
    extension: 'wav',
    mimeType: 'audio/wav',
    supportedChips: ['*'],
    async export() {
      throw new Error('WAV export is handled by web-ui ExportManager');
    },
  },
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
