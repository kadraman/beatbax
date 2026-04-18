/**
 * Global chip plugin registry.
 *
 * The registry is the single source of truth for which chip backends are
 * available at runtime. The Game Boy plugin is always present (built-in);
 * additional plugins are registered via `register()` before compilation.
 */
import { ChipPlugin } from './types.js';
export declare class ChipRegistry {
    private plugins;
    /** Maps alias → canonical plugin name (e.g. 'gb' → 'gameboy'). */
    private aliases;
    constructor();
    /**
     * Register a chip plugin.
     * Throws if a plugin with the same name is already registered.
     */
    register(plugin: ChipPlugin): void;
    /**
     * Register an alias for an already-registered chip.
     * Throws if the canonical chip is not registered or the alias is already taken.
     *
     * @param alias     The alias name (e.g. `'gb'`).
     * @param canonical The canonical plugin name it maps to (e.g. `'gameboy'`).
     */
    registerAlias(alias: string, canonical: string): void;
    /**
     * Resolve a name or alias to its canonical plugin name.
     * Returns the input unchanged when it is already a canonical name.
     */
    resolve(chipName: string): string;
    /**
     * Look up a plugin by chip name or alias.
     * Returns `undefined` if the chip is not registered.
     */
    get(chipName: string): ChipPlugin | undefined;
    /** Return `true` if a plugin with the given name (or alias) is registered. */
    has(chipName: string): boolean;
    /**
     * Return the names of all registered plugins plus all registered aliases.
     * Both canonical names and aliases appear so that parser validation accepts
     * any name a consumer would legitimately write in a `chip` directive.
     */
    list(): string[];
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
export declare const chipRegistry: ChipRegistry;
//# sourceMappingURL=registry.d.ts.map