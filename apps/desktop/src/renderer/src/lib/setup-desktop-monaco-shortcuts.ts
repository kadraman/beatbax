import type { EventBus } from '@beatbax/app-core/utils/event-bus';
import { isFeatureEnabled, FeatureFlag } from '@beatbax/app-core/utils/feature-flags';
import { registerMonacoShortcuts } from '@beatbax/app-core/shortcuts/monaco';
import type { BottomTabsController, RightTabsController } from '../components/shell/tabs';
import type { ShortcutsModalController } from '../components/shell/modals';
import type { ThemeManager } from './theme-manager';
import { KeyCode, type IKeyboardEvent, type editor as MonacoEditor, type IDisposable } from 'monaco-editor';
import type { DesktopCopilotHandle } from './desktop-copilot';
import type { DesktopSettingsModalHandle } from '../components/panels/DesktopSettingsModal';
import type { DesktopChannelMixerHandle } from '../components/panels/DesktopChannelMixer';
import type { DesktopTransportBarHandle } from '../components/workspace/DesktopTransportBar';
import type { DesktopToolbarHandle } from '../components/workspace/DesktopToolbar';
import { storage, StorageKey } from '@beatbax/app-core/utils/local-storage';

export interface SetupDesktopMonacoShortcutsOptions {
  editor: MonacoEditor.IStandaloneCodeEditor;
  transportBar: DesktopTransportBarHandle;
  toolbar: DesktopToolbarHandle;
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

const DESKTOP_CAPABILITIES = {
  export: true,
  copilot: true,
  channelMixer: true,
  songVisualizer: true,
  patternGrid: true,
  advancedEditor: true,
  midiStepEntry: true,
  helpPanel: true,
  problemsPanel: true,
  outputPanel: true,
  settingsPanel: true,
  nativeMenu: true,
  exampleMenu: false,
} as const;

/**
 * Register Monaco editor commands for shortcuts that must work while the editor
 * has focus. The global KeyboardShortcuts registry skips most keys inside inputs.
 */
export function setupDesktopMonacoShortcuts(options: SetupDesktopMonacoShortcutsOptions): () => void {
  const {
    editor,
    transportBar,
    toolbar,
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

  registerMonacoShortcuts(editor, 'desktop-full', [
    { commandId: 'transport.play', handler: () => { transportBar.playButton.click(); } },
    { commandId: 'transport.stop', handler: () => { transportBar.stopButton.click(); } },
    { commandId: 'transport.apply', handler: () => { transportBar.applyButton.click(); } },
    { commandId: 'help.showHelp', handler: () => { rightTabs.show('help'); } },
    { commandId: 'help.showShortcuts', handler: () => { shortcutsModal.open(); } },
    { commandId: 'tools.openSettings', handler: () => { settingsModal.open(); }, requiresCapability: 'settingsPanel' },
    { commandId: 'tools.verifySyntax', handler: () => { onVerify(); } },
    { commandId: 'view.toggleTheme', handler: () => { themeManager.toggle(); } },
    { commandId: 'view.showSongVisualizer', handler: () => {
      eventBus.emit('panel:toggled', { panel: 'song-visualizer', visible: true });
    }, requiresCapability: 'songVisualizer' },
    { commandId: 'tools.openCommandPalette', handler: () => {
      editor.trigger('', 'editor.action.quickCommand', null);
    }, requiresCapability: 'advancedEditor' },
    { commandId: 'view.toggleChannelMixer', handler: () => {
      if (!isFeatureEnabled(FeatureFlag.CHANNEL_MIXER)) return;
      const vis = channelMixer?.isVisible?.() ?? false;
      eventBus.emit('panel:toggled', { panel: 'channel-mixer', visible: !vis });
    }, requiresCapability: 'channelMixer' },
    { commandId: 'view.toggleToolbar', handler: () => {
      const vis = toolbar.isVisible?.() ?? false;
      eventBus.emit('panel:toggled', { panel: 'toolbar', visible: !vis });
    } },
    { commandId: 'view.toggleTransportBar', handler: () => {
      const vis = transportBar.isVisible?.() ?? false;
      eventBus.emit('panel:toggled', { panel: 'transport-bar', visible: !vis });
    } },
    { commandId: 'view.togglePatternGrid', handler: () => {
      if (!isFeatureEnabled(FeatureFlag.PATTERN_GRID)) return;
      const raw = storage.get(StorageKey.PANEL_VIS_PATTERN_GRID);
      const vis = raw === 'true';
      eventBus.emit('panel:toggled', { panel: 'pattern-grid', visible: !vis });
    }, requiresCapability: 'patternGrid' },
  ], DESKTOP_CAPABILITIES);

  if (copilot) {
    registerMonacoShortcuts(editor, 'desktop-full', [
      { commandId: 'tools.toggleCopilot', handler: () => {
        const aiActive = rightTabs.tabOpen.ai && rightTabs.activeTab === 'ai';
        eventBus.emit('panel:toggled', { panel: 'ai-assistant', visible: !aiActive });
      }, requiresCapability: 'copilot' },
    ], DESKTOP_CAPABILITIES);
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
