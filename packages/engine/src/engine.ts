/**
 * BeatBaxEngine — high-level façade for the BeatBax engine.
 *
 * This file is kept separate from `index.ts` so it can be imported in test
 * environments (Jest/ts-jest) that do not support `import.meta`.
 */
import { ChipPlugin } from './chips/types.js';
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
  private registry = chipRegistry;

  /** Register an external chip plugin. Throws if the name is already taken. */
  registerChipPlugin(plugin: ChipPlugin): void {
    this.registry.register(plugin);
  }

  /**
   * Check whether a chip is available (built-in or externally registered).
   * Returns `false` for unknown chip names.
   */
  validateChip(chipName: string): boolean {
    return this.registry.has(chipName);
  }

  /** Return the names of all currently registered chips. */
  listChips(): string[] {
    return this.registry.list();
  }
}
