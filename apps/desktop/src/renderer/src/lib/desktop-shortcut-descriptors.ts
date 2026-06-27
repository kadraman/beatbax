import type { KeyboardShortcuts, ShortcutMetadata } from '../utils/keyboard-shortcuts';

export type DesktopShortcutCommandId =
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
  | 'view.toggleThemeAlt'
  | 'view.showOutput'
  | 'view.showProblems'
  | 'view.showSongVisualizer'
  | 'view.toggleChannelMixer'
  | 'view.toggleToolbar'
  | 'view.toggleTransportBar'
  | 'help.showHelp'
  | 'help.showHelpAlt'
  | 'help.showShortcuts'
  | 'tools.openSettings'
  | 'tools.verifySyntax'
  | 'tools.openCommandPalette'
  | 'tools.toggleCopilot';

export interface DesktopShortcutDescriptor extends ShortcutMetadata {
  commandId: DesktopShortcutCommandId;
}

export type DesktopShortcutHandlers = Partial<Record<DesktopShortcutCommandId, () => void>>;

export const DESKTOP_SHORTCUT_DESCRIPTORS: readonly DesktopShortcutDescriptor[] = [
  { commandId: 'transport.play', key: 'F5', description: 'Play / re-play', category: 'Transport' },
  { commandId: 'transport.stop', key: 'F8', description: 'Stop playback', category: 'Transport' },
  { commandId: 'transport.apply', key: 'Enter', ctrlKey: true, description: 'Apply & re-play', category: 'Transport' },

  { commandId: 'file.new', key: 'n', ctrlKey: true, description: 'New song', category: 'File', desktopOnly: true, allowInInput: true },
  { commandId: 'file.open', key: 'o', ctrlKey: true, description: 'Open file...', category: 'File', desktopOnly: true, allowInInput: true },
  { commandId: 'file.save', key: 's', ctrlKey: true, description: 'Save', category: 'File', desktopOnly: true, allowInInput: true },
  { commandId: 'file.saveAs', key: 's', ctrlKey: true, shiftKey: true, description: 'Save as...', category: 'File', desktopOnly: true, allowInInput: true },

  { commandId: 'edit.undo', key: 'z', ctrlKey: true, description: 'Undo', category: 'Edit' },
  { commandId: 'edit.redo', key: 'y', ctrlKey: true, description: 'Redo', category: 'Edit' },
  { commandId: 'edit.redo', key: 'z', ctrlKey: true, shiftKey: true, description: 'Redo', category: 'Edit' },

  { commandId: 'editor.noteSemitoneUp', key: '.', altKey: true, description: 'Note: semitone up (editor)', category: 'Editor' },
  { commandId: 'editor.noteSemitoneDown', key: ',', altKey: true, description: 'Note: semitone down (editor)', category: 'Editor' },
  { commandId: 'editor.noteOctaveUp', key: '.', altKey: true, shiftKey: true, description: 'Note: octave up (editor)', category: 'Editor' },
  { commandId: 'editor.noteOctaveDown', key: ',', altKey: true, shiftKey: true, description: 'Note: octave down (editor)', category: 'Editor' },

  { commandId: 'view.toggleTheme', key: 'l', ctrlKey: true, shiftKey: true, description: 'Theme (Dark / Light)', category: 'View', allowInInput: true },
  { commandId: 'view.toggleThemeAlt', key: 'l', altKey: true, shiftKey: true, description: 'Theme (Dark / Light)', category: 'View', allowInInput: true },
  { commandId: 'view.showOutput', key: '`', ctrlKey: true, description: 'Show Output panel', category: 'View', allowInInput: true },
  { commandId: 'view.showProblems', key: 'p', altKey: true, shiftKey: true, description: 'Show Problems panel', category: 'View', allowInInput: true },
  { commandId: 'view.showSongVisualizer', key: 'v', ctrlKey: true, shiftKey: true, description: 'Show Song Visualizer', category: 'View', allowInInput: true },
  { commandId: 'view.toggleChannelMixer', key: 'm', ctrlKey: true, shiftKey: true, description: 'Toggle Channel Mixer', category: 'View', allowInInput: true },
  { commandId: 'view.toggleToolbar', key: 'b', altKey: true, shiftKey: true, description: 'Toggle Toolbar', category: 'View', allowInInput: true },
  { commandId: 'view.toggleTransportBar', key: 'r', altKey: true, shiftKey: true, description: 'Toggle Transport Bar', category: 'View', allowInInput: true },

  { commandId: 'help.showHelp', key: 'F1', shiftKey: true, description: 'Show Help tab', category: 'Help', allowInInput: true },
  { commandId: 'help.showHelpAlt', key: 'h', altKey: true, shiftKey: true, description: 'Show Help tab', category: 'Help', allowInInput: true },
  { commandId: 'help.showShortcuts', key: 'k', altKey: true, shiftKey: true, description: 'Show Keyboard Shortcuts', category: 'Help', allowInInput: true },

  { commandId: 'tools.openSettings', key: ',', ctrlKey: true, description: 'Open Settings', category: 'Tools', allowInInput: true },
  { commandId: 'tools.verifySyntax', key: 'v', altKey: true, shiftKey: true, description: 'Verify syntax', category: 'Tools', allowInInput: true },
  { commandId: 'tools.openCommandPalette', key: 'p', ctrlKey: true, altKey: true, description: 'Open Command Palette', category: 'Tools', allowInInput: true },
  { commandId: 'tools.toggleCopilot', key: 'i', altKey: true, shiftKey: true, description: 'Toggle AI Copilot', category: 'Tools', allowInInput: true },
];

export function registerDesktopShortcutDescriptors(
  shortcuts: KeyboardShortcuts,
  handlers: DesktopShortcutHandlers,
): void {
  for (const descriptor of DESKTOP_SHORTCUT_DESCRIPTORS) {
    const action = handlers[descriptor.commandId];
    if (!action) continue;
    shortcuts.register({ ...descriptor, action });
  }
}
