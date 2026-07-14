/**
 * Re-export shared keyboard shortcut registry from app-core.
 * Desktop uses capture-phase listening so allowInInput shortcuts win over Monaco.
 */

export {
  KeyboardShortcuts,
  descriptorFromBinding,
  bindingMatchesRegistered,
  shortcutId,
  type ShortcutDescriptor,
  type ShortcutMetadata,
} from '@beatbax/app-core/shortcuts';
