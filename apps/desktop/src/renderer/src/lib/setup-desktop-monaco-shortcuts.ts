import type { EventBus } from '@beatbax/app-core/utils/event-bus';
import { isFeatureEnabled, FeatureFlag } from '@beatbax/app-core/utils/feature-flags';
import type { BottomTabsController, RightTabsController } from '../components/shell/tabs';
import type { ShortcutsModalController } from '../components/shell/modals';
import type { ThemeManager } from './theme-manager';
import { KeyCode, KeyMod, type IKeyboardEvent, type editor as MonacoEditor, type IDisposable } from 'monaco-editor';
import type { DesktopCopilotHandle } from './desktop-copilot';
import type { DesktopSettingsModalHandle } from '../components/panels/DesktopSettingsModal';
import type { DesktopChannelMixerHandle } from '../components/panels/DesktopChannelMixer';
import type { DesktopTransportBarHandle } from '../components/workspace/DesktopTransportBar';

export interface SetupDesktopMonacoShortcutsOptions {
  editor: MonacoEditor.IStandaloneCodeEditor;
  transportBar: DesktopTransportBarHandle;
  rightTabs: RightTabsController;
  bottomTabs: BottomTabsController;
  shortcutsModal: ShortcutsModalController;
  settingsModal: DesktopSettingsModalHandle;
  themeManager: ThemeManager;
  channelMixer: DesktopChannelMixerHandle | null;
  copilot: DesktopCopilotHandle | null;
  eventBus: EventBus;
  onVerify: () => void;
}

/**
 * Register Monaco editor commands for shortcuts that must work while the editor
 * has focus. The global KeyboardShortcuts registry skips most keys inside inputs.
 */
export function setupDesktopMonacoShortcuts(options: SetupDesktopMonacoShortcutsOptions): () => void {
  const {
    editor,
    transportBar,
    rightTabs,
    shortcutsModal,
    settingsModal,
    themeManager,
    channelMixer,
    copilot,
    eventBus,
    onVerify,
  } = options;

  const disposables: IDisposable[] = [];

  const add = (id: number, handler: () => void) => {
    editor.addCommand(id, handler);
  };

  add(KeyCode.F5, () => { transportBar.playButton.click(); });
  add(KeyCode.F8, () => { transportBar.stopButton.click(); });
  add(KeyMod.CtrlCmd | KeyCode.Enter, () => { transportBar.applyButton.click(); });
  add(KeyMod.Shift | KeyCode.F1, () => { rightTabs.show('help'); });
  add(KeyMod.Alt | KeyMod.Shift | KeyCode.KeyK, () => { shortcutsModal.open(); });
  add(KeyMod.CtrlCmd | KeyCode.Comma, () => { settingsModal.open(); });
  add(KeyMod.Alt | KeyCode.KeyV, () => { onVerify(); });
  add(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL, () => { themeManager.toggle(); });
  add(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyV, () => { rightTabs.show('channels'); });
  add(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyP, () => {
    editor.trigger('', 'editor.action.quickCommand', null);
  });

  if (channelMixer) {
    add(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyM, () => {
      if (!isFeatureEnabled(FeatureFlag.CHANNEL_MIXER)) return;
      const vis = channelMixer.isVisible?.() ?? false;
      eventBus.emit('panel:toggled', { panel: 'channel-mixer', visible: !vis });
    });
  }

  if (copilot) {
    add(KeyMod.Alt | KeyMod.Shift | KeyCode.KeyI, () => {
      const aiActive = rightTabs.tabOpen.ai && rightTabs.activeTab === 'ai';
      eventBus.emit('panel:toggled', { panel: 'ai-assistant', visible: !aiActive });
    });
  }

  disposables.push(editor.onKeyDown((e: IKeyboardEvent) => {
    if (e.keyCode === KeyCode.Escape && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      if (rightTabs.activeTab === 'help') rightTabs.switch('channels');
    }
  }));

  return () => {
    for (const disposable of disposables) disposable.dispose();
  };
}
