import { chipRegistry } from './chips/registry.js';
/**
 * High-level engine façade that makes the plugin system easy to use.
 *
 * ```typescript
 * import { BeatBaxEngine } from '@beatbax/engine';
 * import nesPlugin from '@beatbax/plugin-chip-nes';
 *
 * const engine = new BeatBaxEngine();
 * engine.registerChipPlugin(nesPlugin);
 * engine.validateChip('nes'); // true
 * ```
 */
export class BeatBaxEngine {
    registry = chipRegistry;
    /** Register an external chip plugin. Throws if the name is already taken. */
    registerChipPlugin(plugin) {
        this.registry.register(plugin);
    }
    /**
     * Check whether a chip is available (built-in or externally registered).
     * Returns `false` for unknown chip names.
     */
    validateChip(chipName) {
        return this.registry.has(chipName);
    }
    /** Return the names of all currently registered chips. */
    listChips() {
        return this.registry.list();
    }
}
//# sourceMappingURL=engine.js.map