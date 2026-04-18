import { gameboyPlugin } from './gameboy/plugin.js';
export class ChipRegistry {
    plugins = new Map();
    /** Maps alias → canonical plugin name (e.g. 'gb' → 'gameboy'). */
    aliases = new Map();
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
    register(plugin) {
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
    registerAlias(alias, canonical) {
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
    resolve(chipName) {
        return this.aliases.get(chipName) ?? chipName;
    }
    /**
     * Look up a plugin by chip name or alias.
     * Returns `undefined` if the chip is not registered.
     */
    get(chipName) {
        return this.plugins.get(this.resolve(chipName));
    }
    /** Return `true` if a plugin with the given name (or alias) is registered. */
    has(chipName) {
        return this.plugins.has(this.resolve(chipName));
    }
    /**
     * Return the names of all registered plugins plus all registered aliases.
     * Both canonical names and aliases appear so that parser validation accepts
     * any name a consumer would legitimately write in a `chip` directive.
     */
    list() {
        return [...Array.from(this.plugins.keys()), ...Array.from(this.aliases.keys())];
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
//# sourceMappingURL=registry.js.map