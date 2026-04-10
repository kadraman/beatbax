/**
 * Global chip plugin registry.
 *
 * The registry is the single source of truth for which chip backends are
 * available at runtime. The Game Boy plugin is always present (built-in);
 * additional plugins are registered via `register()` before compilation.
 */
import { ChipPlugin } from './types.js';
import { gameboyPlugin } from './gameboy/plugin.js';

export class ChipRegistry {
  private plugins = new Map<string, ChipPlugin>();

  constructor() {
    // Register the built-in Game Boy plugin immediately.
    this.plugins.set(gameboyPlugin.name, gameboyPlugin);
  }

  /**
   * Register a chip plugin.
   * Throws if a plugin with the same name is already registered.
   */
  register(plugin: ChipPlugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Chip plugin '${plugin.name}' is already registered`);
    }
    this.plugins.set(plugin.name, plugin);
  }

  /**
   * Look up a plugin by chip name.
   * Returns `undefined` if the chip is not registered.
   */
  get(chipName: string): ChipPlugin | undefined {
    return this.plugins.get(chipName);
  }

  /** Return `true` if a plugin with the given name is registered. */
  has(chipName: string): boolean {
    return this.plugins.has(chipName);
  }

  /** Return the names of all registered plugins. */
  list(): string[] {
    return Array.from(this.plugins.keys());
  }
}

/**
 * Global singleton registry.
 *
 * Import this wherever chip lookup is needed:
 *
 * ```typescript
 * import { chipRegistry } from '../chips/registry.js';
 * const plugin = chipRegistry.get('gameboy');
 * ```
 */
export const chipRegistry = new ChipRegistry();
