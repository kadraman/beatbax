import type { EventBus } from '@beatbax/app-core/utils/event-bus';
import { isFeatureEnabled, FeatureFlag } from '@beatbax/app-core/utils/feature-flags';
import type { buildBottomTabs, buildRightTabs } from '@web-ui/app/tabs';
import type { buildShortcutsModal } from '@web-ui/app/modals';
import type { buildSettingsModal } from '@web-ui/panels/settings-panel';
import type { ChannelMixer } from '@web-ui/panels/channel-mixer';
import type { ThemeManager } from '@web-ui/ui/theme-manager';
import type { TransportBar } from '@web-ui/ui/transport-bar';
import { KeyCode, KeyMod, type IKeyboardEvent, type editor as MonacoEditor, type IDisposable } from 'monaco-editor';
import type { DesktopCopilotHandle } from './desktop-copilot';

type BottomTabs = ReturnType<typeof buildBottomTabs>;
type RightTabs = ReturnType<typeof buildRightTabs>;
type SettingsModal = ReturnType<typeof buildSettingsModal>;
type ShortcutsModal = ReturnType<typeof buildShortcutsModal>;

export interface SetupDesktopMonacoShortcutsOptions {
  editor: MonacoEditor.IStandaloneCodeEditor;
  transportBar: TransportBar;
  rightTabs: RightTabs;
  bottomTabs: BottomTabs;
  shortcutsModal: ShortcutsModal;
  settingsModal: SettingsModal;
  themeManager: ThemeManager;
  channelMixer: ChannelMixer | null;
  copilot: DesktopCopilotHandle | null;
  eventBus: EventBus;
  runParse: (content: string) => void;
  getSource: () => string;
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
    runParse,
    getSource,
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
  add(KeyMod.Alt | KeyMod.Shift | KeyCode.KeyV, () => { runParse(getSource()); });
  add(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL, () => { themeManager.toggle(); });
  add(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyV, () => { rightTabs.show('channels'); });
  add(KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyP, () => {
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
    add(KeyMod.Alt | KeyMod.Shift | KeyCode.KeyI, () => { copilot.toggle(); });
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
