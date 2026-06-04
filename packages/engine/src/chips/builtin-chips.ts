import { gameboyPlugin } from './gameboy/plugin.js';
import { nesPlugin } from './nes/plugin.js';

/** Chips always registered by ChipRegistry at construction time. */
export const BUILTIN_CHIP_PLUGINS = [gameboyPlugin, nesPlugin] as const;
