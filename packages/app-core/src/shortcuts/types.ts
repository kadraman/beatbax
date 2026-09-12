import type { ClientCapabilities, ClientProfile } from '../client-profile.js';

export type ShortcutPlatform = 'darwin' | 'win32' | 'linux' | 'web';

export type ShortcutCommandId =
  | 'transport.play'
  | 'transport.stop'
  | 'transport.apply'
  | 'file.new'
  | 'file.open'
  | 'file.save'
  | 'file.saveAs'
  | 'edit.undo'
  | 'edit.redo'
  | 'editor.noteSemitoneUp'
  | 'editor.noteSemitoneDown'
  | 'editor.noteOctaveUp'
  | 'editor.noteOctaveDown'
  | 'view.toggleTheme'
  | 'view.showOutput'
  | 'view.showProblems'
  | 'view.showSongVisualizer'
  | 'view.toggleChannelMixer'
  | 'view.toggleToolbar'
  | 'view.toggleTransportBar'
  | 'view.togglePatternGrid'
  | 'view.toggleInstrumentEditor'
  | 'patternGrid.focusSectionAtCursor'
  | 'patternGrid.exitSectionFocus'
  | 'patternGrid.previousSection'
  | 'patternGrid.nextSection'
  | 'help.showHelp'
  | 'help.showHelpAlt'
  | 'help.showShortcuts'
  | 'tools.openSettings'
  | 'tools.verifySyntax'
  | 'tools.openCommandPalette'
  | 'tools.toggleCopilot';

export interface ShortcutBinding {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
}

export type ProfileBinding =
  | ShortcutBinding
  | { web: ShortcutBinding; desktop: ShortcutBinding };

export interface ShortcutDefinition {
  id: ShortcutCommandId;
  description: string;
  category: string;
  profiles: ClientProfile[];
  binding: ProfileBinding;
  /** When true, fires even when focus is inside a plain text control (not Monaco). */
  allowInInput?: boolean;
  /** When true, the global handler may fire while Monaco has focus (e.g. file save). */
  allowInMonaco?: boolean;
  /** When true, listed in help but the global handler must not fire in the editor. */
  helpOnly?: boolean;
  /** Gate registration when a client capability is false. */
  requiresCapability?: keyof ClientCapabilities;
  /** Gate registration when a feature flag is disabled. */
  requiresFeatureFlag?: string;
  /** Secondary chord for the same command (e.g. redo via Ctrl+Shift+Z). */
  alternateBinding?: ShortcutBinding | ProfileBinding;
}

export interface RegisteredShortcutBinding extends ShortcutBinding {
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  key: string;
}

/** Convert catalog binding fields to registry descriptor modifier fields. */
export function bindingToDescriptor(binding: ShortcutBinding): RegisteredShortcutBinding {
  return {
    key: binding.key,
    ctrlKey: binding.ctrl,
    altKey: binding.alt,
    shiftKey: binding.shift,
  };
}

export function resolveProfileBinding(
  binding: ProfileBinding,
  profile: ClientProfile,
): ShortcutBinding {
  if ('web' in binding && 'desktop' in binding) {
    return profile === 'web-lite' ? binding.web : binding.desktop;
  }
  return binding;
}
