import type { EventBus } from '@beatbax/app-core/utils/event-bus';
import type { BeatBaxEditor } from '@beatbax/app-core/editor';
import { isFeatureEnabled, FeatureFlag } from '@beatbax/app-core/utils/feature-flags';
import type { BottomTabsController, RightTabsController } from '../components/shell/tabs';
import type { ShortcutsModalController } from '../components/shell/modals';
import type { ThemeManager } from './theme-manager';
import { KeyboardShortcuts } from '../utils/keyboard-shortcuts';
import { registerDesktopShortcutDescriptors, type DesktopShortcutHandlers } from './desktop-shortcut-descriptors';
import type { DesktopCopilotHandle } from './desktop-copilot';
import type { DesktopSettingsModalHandle } from '../components/panels/DesktopSettingsModal';
import type { DesktopChannelMixerHandle } from '../components/panels/DesktopChannelMixer';
import type { DesktopToolbarHandle } from '../components/workspace/DesktopToolbar';
import type { DesktopTransportBarHandle } from '../components/workspace/DesktopTransportBar';

export interface RegisterDesktopShortcutsOptions {
  ks: KeyboardShortcuts;
  eventBus: EventBus;
  getEditor: () => BeatBaxEditor | null;
  transportBar: DesktopTransportBarHandle;
  toolbar: DesktopToolbarHandle;
  bottomTabs: BottomTabsController;
  rightTabs: RightTabsController;
  settingsModal: DesktopSettingsModalHandle;
  shortcutsModal: ShortcutsModalController;
  onVerify: () => void;
  onNew: () => void;
  onOpen: () => void | Promise<void>;
  onSave: (saveAs?: boolean) => void | Promise<void>;
  themeManager: ThemeManager;
  channelMixer: DesktopChannelMixerHandle | null;
  copilot: DesktopCopilotHandle | null;
}

/**
 * Desktop-global shortcuts. Unlike the browser client, standard file shortcuts
 * (Ctrl+N/O/S) are available here. Editor-focused transport keys (F5/F8,
 * Ctrl+Enter) are duplicated in setupDesktopMonacoShortcuts().
 */
export function registerDesktopShortcuts(opts: RegisterDesktopShortcutsOptions): void {
  const {
    ks, eventBus, getEditor, transportBar, toolbar, bottomTabs, rightTabs,
    settingsModal, shortcutsModal,
    onVerify, onNew, onOpen, onSave, themeManager, channelMixer, copilot,
  } = opts;

  const monacoInst = () => getEditor()?.editor;

  const handlers: DesktopShortcutHandlers = {
    'transport.play': () => transportBar.playButton.click(),
    'transport.stop': () => transportBar.stopButton.click(),
    'transport.apply': () => transportBar.applyButton.click(),

    'file.new': () => onNew(),
    'file.open': () => { void onOpen(); },
    'file.save': () => { void onSave(false); },
    'file.saveAs': () => { void onSave(true); },

    'edit.undo': () => monacoInst()?.trigger('menu', 'undo', null),
    'edit.redo': () => monacoInst()?.trigger('menu', 'redo', null),

    // Monaco handles these while the editor is focused; these entries keep
    // the desktop-owned shortcut list complete for Help/Shortcuts.
    'editor.noteSemitoneUp': () => {},
    'editor.noteSemitoneDown': () => {},
    'editor.noteOctaveUp': () => {},
    'editor.noteOctaveDown': () => {},

    'view.toggleTheme': () => themeManager.toggle(),
    'view.toggleThemeAlt': () => themeManager.toggle(),
    'view.showOutput': () => bottomTabs.show('output'),
    'view.showProblems': () => bottomTabs.show('problems'),
    'view.showSongVisualizer': () => rightTabs.show('channels'),
    'view.toggleChannelMixer': () => {
      if (!isFeatureEnabled(FeatureFlag.CHANNEL_MIXER)) return;
      const vis = channelMixer?.isVisible?.() ?? false;
      eventBus.emit('panel:toggled', { panel: 'channel-mixer', visible: !vis });
    },
    'view.toggleToolbar': () => {
      const vis = toolbar.isVisible?.() ?? false;
      eventBus.emit('panel:toggled', { panel: 'toolbar', visible: !vis });
    },
    'view.toggleTransportBar': () => {
      const vis = transportBar.isVisible?.() ?? false;
      eventBus.emit('panel:toggled', { panel: 'transport-bar', visible: !vis });
    },

    'help.showHelp': () => rightTabs.show('help'),
    'help.showHelpAlt': () => rightTabs.show('help'),
    'help.showShortcuts': () => shortcutsModal.open(),

    'tools.openSettings': () => settingsModal.open(),
    'tools.verifySyntax': () => onVerify(),
    'tools.openCommandPalette': () => {
      const ed = monacoInst();
      if (!ed) return;
      ed.focus();
      window.setTimeout(() => ed.trigger('', 'editor.action.quickCommand', null), 50);
    },
  };

  if (copilot) {
    handlers['tools.toggleCopilot'] = () => copilot.toggle();
  }

  registerDesktopShortcutDescriptors(ks, handlers);
}
