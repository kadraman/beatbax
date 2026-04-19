import type { ExporterPlugin } from './types.js';
import { BUILTIN_EXPORTER_PLUGINS } from './plugins/index.js';

export class ExporterRegistry {
  private plugins = new Map<string, ExporterPlugin>();

  constructor(defaultPlugins: ExporterPlugin[] = BUILTIN_EXPORTER_PLUGINS) {
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
    return this.all().filter((plugin) =>
      plugin.supportedChips.includes('*') || plugin.supportedChips.map((x) => x.toLowerCase()).includes(chip),
    );
  }

  all(): ExporterPlugin[] {
    return Array.from(this.plugins.values());
  }
}

export const exporterRegistry = new ExporterRegistry();
