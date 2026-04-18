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
  /** Maps alias → canonical plugin name (e.g. 'gb' → 'gameboy'). */
  private aliases = new Map<string, string>();

  constructor() {
    // Register the built-in Game Boy plugin immediately.
    this.plugins.set(gameboyPlugin.name, gameboyPlugin);
    // Register well-known aliases so `chip gb` and `chip dmg` are accepted
    // everywhere the registry is consulted (parser, player, renderers).
    this.aliases.set('gb', 'gameboy');
    this.aliases.set('dmg', 'gameboy');
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
   * Register an alias for an already-registered chip.
   * Throws if the canonical chip is not registered or the alias is already taken.
   *
   * @param alias     The alias name (e.g. `'gb'`).
   * @param canonical The canonical plugin name it maps to (e.g. `'gameboy'`).
   */
  registerAlias(alias: string, canonical: string): void {
    if (!this.plugins.has(canonical)) {
      throw new Error(`Cannot register alias '${alias}': chip '${canonical}' is not registered`);
    }
    if (this.aliases.has(alias) || this.plugins.has(alias)) {
      throw new Error(`Chip alias '${alias}' is already registered`);
    }
    this.aliases.set(alias, canonical);
  }

  /**
   * Resolve a name or alias to its canonical plugin name.
   * Returns the input unchanged when it is already a canonical name.
   */
  resolve(chipName: string): string {
    return this.aliases.get(chipName) ?? chipName;
  }

  /**
   * Look up a plugin by chip name or alias.
   * Returns `undefined` if the chip is not registered.
   */
  get(chipName: string): ChipPlugin | undefined {
    return this.plugins.get(this.resolve(chipName));
  }

  /** Return `true` if a plugin with the given name (or alias) is registered. */
  has(chipName: string): boolean {
    return this.plugins.has(this.resolve(chipName));
  }

  /**
   * Return the names of all registered plugins plus all registered aliases.
   * Both canonical names and aliases appear so that parser validation accepts
   * any name a consumer would legitimately write in a `chip` directive.
   */
  list(): string[] {
    return [...Array.from(this.plugins.keys()), ...Array.from(this.aliases.keys())];
  }

  /** Return only the canonical plugin names (no aliases). */
  listCanonical(): string[] {
    return Array.from(this.plugins.keys());
  }

  /** Return all aliases that map to the given canonical chip name. */
  aliasesFor(canonical: string): string[] {
    const result: string[] = [];
    for (const [alias, target] of this.aliases) {
      if (target === canonical) result.push(alias);
    }
    return result;
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
