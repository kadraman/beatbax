/**
 * Re-export shared keyboard shortcut registry from app-core.
 */

export {
  KeyboardShortcuts,
  descriptorFromBinding,
  bindingMatchesRegistered,
  shortcutId,
  type ShortcutDescriptor,
  type ShortcutMetadata,
} from '@beatbax/app-core/shortcuts';
