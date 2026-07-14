export type {
  ShortcutBinding,
  ShortcutCommandId,
  ShortcutDefinition,
  ShortcutPlatform,
  ProfileBinding,
  RegisteredShortcutBinding,
} from './types.js';
export {
  bindingToDescriptor,
  resolveProfileBinding,
} from './types.js';

export {
  normaliseKey,
  keyFromCode,
  shortcutId,
  modifierCandidates,
  keyCandidates,
  bindingMatchesEvent,
} from './match.js';

export {
  formatShortcut,
  toElectronAccelerator,
  bindingToKeyArray,
  detectShortcutPlatform,
  primaryModifierLabel,
  formatCommandShortcut,
  electronAcceleratorForCommand,
} from './format.js';

export {
  SHORTCUT_CATALOG,
  getShortcutDefinition,
  getShortcutBinding,
  listCatalogEntries,
} from './catalog.js';

export {
  KeyboardShortcuts,
  descriptorFromBinding,
  bindingMatchesRegistered,
  type ShortcutDescriptor,
  type ShortcutMetadata,
} from './keyboard-shortcuts.js';

export { registerCatalogShortcuts, type ShortcutHandlers, type RegisterCatalogShortcutsOptions } from './register.js';
