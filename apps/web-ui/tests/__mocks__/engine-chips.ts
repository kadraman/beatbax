/** Jest mock for @beatbax/engine/chips — avoids loading ESM dist in tests. */

const aliases: Record<string, string> = {
  gb: 'gameboy',
  dmg: 'gameboy',
  famicom: 'nes',
  ay: 'spectrum-128',
  spectrum: 'spectrum-128',
  cpc: 'spectrum-128',
  'amstrad-cpc': 'spectrum-128',
};

const plugins = new Map<string, { effects?: Record<string, unknown>; uiContributions?: { hoverDocs?: Record<string, string> } }>();

export class ChipRegistry {
  resolve(name: string): string {
    return aliases[name] ?? name;
  }

  get(name: string) {
    return plugins.get(this.resolve(name));
  }

  has(name: string): boolean {
    return plugins.has(this.resolve(name));
  }

  register(plugin: { name: string; effects?: Record<string, unknown>; uiContributions?: { hoverDocs?: Record<string, string> } }) {
    plugins.set(plugin.name, plugin);
  }

  list(): string[] {
    return ['gameboy', 'gb', 'dmg', 'nes', 'spectrum-128', 'ay', 'spectrum', 'cpc', 'amstrad-cpc'];
  }

  listCanonical(): string[] {
    return ['gameboy', 'nes', 'spectrum-128'];
  }

  aliasesFor(_canonical: string): string[] {
    return [];
  }
}

export const chipRegistry = new ChipRegistry();
