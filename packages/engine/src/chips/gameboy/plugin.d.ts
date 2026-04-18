/**
 * Game Boy (DMG-01) APU — built-in chip plugin.
 *
 * This module wraps the existing Game Boy chip rendering functions so that
 * the Game Boy backend participates in the same `ChipPlugin` interface used
 * by all other chip backends. It is registered automatically by the
 * `ChipRegistry` singleton; external code does not need to register it.
 */
import { ChipPlugin } from '../types.js';
export declare const gameboyPlugin: ChipPlugin;
export default gameboyPlugin;
//# sourceMappingURL=plugin.d.ts.map