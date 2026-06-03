/**
 * Public API for the BeatBax chip plugin system.
 *
 * Re-exports the core interfaces and the global registry so that external
 * code only needs a single import path:
 *
 * ```typescript
 * import { chipRegistry, ChipPlugin, ChipChannelBackend } from '@beatbax/engine/chips';
 * ```
 */

export type {
  ChipPlugin,
  ChipChannelBackend,
  ValidationError,
  SongValidationContext,
  ChipUIContributions,
  ChipHelpSection,
  ChipNewSongWizard,
  ChipConsoleVariant,
  NewSongWizardMetadata,
  NewSongWizardTemplates,
  NewSongWizardTemplateOption,
} from './types.js';
export { ChipRegistry, chipRegistry } from './registry.js';
export { getSongValidationIssues } from './songValidation.js';
export { gameboyPlugin } from './gameboy/plugin.js';
