/**
 * Re-export shared keyboard shortcut registry from app-core.
 * Desktop uses capture-phase listening so allowInInput shortcuts win over plain inputs;
 * Monaco editor chords are registered separately via registerMonacoShortcuts().
 */

export {
  KeyboardShortcuts,
  descriptorFromBinding,
  bindingMatchesRegistered,
  shortcutId,
  type ShortcutDescriptor,
  type ShortcutMetadata,
} from '@beatbax/app-core/shortcuts';
