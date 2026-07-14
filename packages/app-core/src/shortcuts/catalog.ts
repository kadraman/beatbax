import type { ClientCapabilities, ClientProfile } from '../client-profile.js';
import type { ShortcutCommandId, ShortcutDefinition } from './types.js';
import { resolveProfileBinding } from './types.js';

export const SHORTCUT_CATALOG: readonly ShortcutDefinition[] = [
  {
    id: 'transport.play',
    description: 'Play / re-play',
    category: 'Transport',
    profiles: ['desktop-full'],
    binding: { key: 'F5' },
    requiresCapability: 'nativeMenu',
  },
  {
    id: 'transport.stop',
    description: 'Stop playback',
    category: 'Transport',
    profiles: ['desktop-full'],
    binding: { key: 'F8' },
    requiresCapability: 'nativeMenu',
  },
  {
    id: 'transport.apply',
    description: 'Apply & re-play',
    category: 'Transport',
    profiles: ['web-lite', 'desktop-full'],
    binding: { key: 'Enter', ctrl: true },
  },

  {
    id: 'file.new',
    description: 'New song',
    category: 'File',
    profiles: ['desktop-full'],
    binding: { key: 'n', ctrl: true },
    allowInInput: true,
    requiresCapability: 'export',
  },
  {
    id: 'file.open',
    description: 'Open file…',
    category: 'File',
    profiles: ['web-lite', 'desktop-full'],
    binding: { key: 'o', ctrl: true },
    allowInInput: true,
  },
  {
    id: 'file.save',
    description: 'Save',
    category: 'File',
    profiles: ['web-lite', 'desktop-full'],
    binding: { key: 's', ctrl: true },
    allowInInput: true,
  },
  {
    id: 'file.saveAs',
    description: 'Save as…',
    category: 'File',
    profiles: ['desktop-full'],
    binding: { key: 's', ctrl: true, shift: true },
    allowInInput: true,
    requiresCapability: 'nativeMenu',
  },

  {
    id: 'edit.undo',
    description: 'Undo',
    category: 'Edit',
    profiles: ['web-lite', 'desktop-full'],
    binding: { key: 'z', ctrl: true },
  },
  {
    id: 'edit.redo',
    description: 'Redo',
    category: 'Edit',
    profiles: ['web-lite', 'desktop-full'],
    binding: { key: 'y', ctrl: true },
    alternateBinding: { key: 'z', ctrl: true, shift: true },
  },

  {
    id: 'editor.noteSemitoneUp',
    description: 'Note: semitone up (editor)',
    category: 'Editor',
    profiles: ['web-lite', 'desktop-full'],
    binding: { key: '.', alt: true },
    helpOnly: true,
  },
  {
    id: 'editor.noteSemitoneDown',
    description: 'Note: semitone down (editor)',
    category: 'Editor',
    profiles: ['web-lite', 'desktop-full'],
    binding: { key: ',', alt: true },
    helpOnly: true,
  },
  {
    id: 'editor.noteOctaveUp',
    description: 'Note: octave up (editor)',
    category: 'Editor',
    profiles: ['web-lite', 'desktop-full'],
    binding: { key: '.', alt: true, shift: true },
    helpOnly: true,
  },
  {
    id: 'editor.noteOctaveDown',
    description: 'Note: octave down (editor)',
    category: 'Editor',
    profiles: ['web-lite', 'desktop-full'],
    binding: { key: ',', alt: true, shift: true },
    helpOnly: true,
  },

  {
    id: 'view.toggleTheme',
    description: 'Theme (Dark / Light)',
    category: 'View',
    profiles: ['web-lite', 'desktop-full'],
    binding: {
      web: { key: 'l', alt: true, shift: true },
      desktop: { key: 'l', ctrl: true, shift: true },
    },
    allowInInput: true,
  },
  {
    id: 'view.showOutput',
    description: 'Show Output panel',
    category: 'View',
    profiles: ['web-lite', 'desktop-full'],
    binding: { key: '`', ctrl: true },
    allowInInput: true,
    requiresCapability: 'outputPanel',
  },
  {
    id: 'view.showProblems',
    description: 'Show Problems panel',
    category: 'View',
    profiles: ['web-lite', 'desktop-full'],
    binding: { key: 'p', alt: true, shift: true },
    allowInInput: true,
    requiresCapability: 'problemsPanel',
  },
  {
    id: 'view.showSongVisualizer',
    description: 'Show Song Visualizer',
    category: 'View',
    profiles: ['desktop-full'],
    binding: { key: 'v', ctrl: true, shift: true },
    allowInInput: true,
    requiresCapability: 'songVisualizer',
    requiresFeatureFlag: 'feature.songVisualizer',
  },
  {
    id: 'view.toggleChannelMixer',
    description: 'Toggle Channel Mixer',
    category: 'View',
    profiles: ['web-lite', 'desktop-full'],
    binding: { key: 'm', ctrl: true, shift: true },
    allowInInput: true,
    requiresCapability: 'channelMixer',
    requiresFeatureFlag: 'feature.channelMixer',
  },
  {
    id: 'view.toggleToolbar',
    description: 'Toggle Toolbar',
    category: 'View',
    profiles: ['web-lite', 'desktop-full'],
    binding: {
      web: { key: 'b', alt: true, shift: true },
      desktop: { key: 'b', ctrl: true, shift: true },
    },
    allowInInput: true,
  },
  {
    id: 'view.toggleTransportBar',
    description: 'Toggle Transport Bar',
    category: 'View',
    profiles: ['web-lite', 'desktop-full'],
    binding: {
      web: { key: 'r', alt: true, shift: true },
      desktop: { key: 'r', ctrl: true, shift: true },
    },
    allowInInput: true,
  },
  {
    id: 'view.togglePatternGrid',
    description: 'Toggle Pattern Grid',
    category: 'View',
    profiles: ['desktop-full'],
    binding: { key: 'g', ctrl: true, shift: true },
    allowInInput: true,
    requiresCapability: 'patternGrid',
    requiresFeatureFlag: 'feature.patternGrid',
  },

  {
    id: 'help.showHelp',
    description: 'Show Help tab',
    category: 'Help',
    profiles: ['web-lite', 'desktop-full'],
    binding: { key: 'F1', shift: true },
    allowInInput: true,
    requiresCapability: 'helpPanel',
  },
  {
    id: 'help.showHelpAlt',
    description: 'Show Help tab',
    category: 'Help',
    profiles: ['web-lite', 'desktop-full'],
    binding: { key: 'h', alt: true, shift: true },
    allowInInput: true,
    requiresCapability: 'helpPanel',
  },
  {
    id: 'help.showShortcuts',
    description: 'Show Keyboard Shortcuts',
    category: 'Help',
    profiles: ['web-lite', 'desktop-full'],
    binding: { key: 'k', alt: true, shift: true },
    allowInInput: true,
  },

  {
    id: 'tools.openSettings',
    description: 'Open Settings',
    category: 'Tools',
    profiles: ['desktop-full'],
    binding: { key: ',', ctrl: true },
    allowInInput: true,
    requiresCapability: 'settingsPanel',
  },
  {
    id: 'tools.verifySyntax',
    description: 'Verify syntax',
    category: 'Tools',
    profiles: ['web-lite', 'desktop-full'],
    binding: {
      web: { key: 'v', alt: true, shift: true },
      desktop: { key: 'v', alt: true },
    },
    allowInInput: true,
  },
  {
    id: 'tools.openCommandPalette',
    description: 'Open Command Palette',
    category: 'Tools',
    profiles: ['web-lite', 'desktop-full'],
    binding: {
      web: { key: 'p', ctrl: true, alt: true },
      desktop: { key: 'p', ctrl: true, shift: true },
    },
    allowInInput: true,
    requiresCapability: 'advancedEditor',
  },
  {
    id: 'tools.toggleCopilot',
    description: 'Toggle AI Copilot',
    category: 'Tools',
    profiles: ['desktop-full'],
    binding: { key: 'i', alt: true, shift: true },
    allowInInput: true,
    requiresCapability: 'copilot',
    requiresFeatureFlag: 'feature.aiAssistant',
  },
] as const;

export function getShortcutDefinition(id: ShortcutCommandId): ShortcutDefinition | undefined {
  return SHORTCUT_CATALOG.find((entry) => entry.id === id);
}

export function getShortcutBinding(
  id: ShortcutCommandId,
  profile: ClientProfile,
): ReturnType<typeof resolveProfileBinding> | undefined {
  const definition = getShortcutDefinition(id);
  if (!definition) return undefined;
  return resolveProfileBinding(definition.binding, profile);
}

export function listCatalogEntries(
  profile: ClientProfile,
  capabilities: ClientCapabilities,
  isFeatureEnabled: (flag: string) => boolean,
): ShortcutDefinition[] {
  return SHORTCUT_CATALOG.filter((entry) => {
    if (!entry.profiles.includes(profile)) return false;
    if (entry.requiresCapability && !capabilities[entry.requiresCapability]) return false;
    if (entry.requiresFeatureFlag && !isFeatureEnabled(entry.requiresFeatureFlag)) return false;
    return true;
  });
}
