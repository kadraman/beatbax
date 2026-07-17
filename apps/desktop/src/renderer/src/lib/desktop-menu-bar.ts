import type { AppContext } from '@beatbax/app-core';
import { getCurrentCapabilities } from '@beatbax/app-core/client-profile';
import type { BeatBaxEditor } from '@beatbax/app-core/editor';
import type { ExportFormat } from '@beatbax/app-core/export/export-manager';
import type { EditorViewPrefsHandlers } from './editor-view-prefs';
import { scheduleCommentsFoldPreference } from './editor-view-prefs';
import { storage, StorageKey } from '@beatbax/app-core/utils/local-storage';
import { settingAutoSave, settingFoldComments, settingShowToolbar, settingShowTransportBar, settingWordWrap } from '@beatbax/app-core/stores/settings.store';
import { isFeatureEnabled, FeatureFlag } from '@beatbax/app-core/utils/feature-flags';
import { shouldShowChannelMixer } from '@beatbax/app-core/utils/channel-mixer-panel';
import { shouldShowPatternGrid } from '@beatbax/app-core/utils/pattern-grid-panel';
import { shouldShowLegacySongVisualizerTab } from '@beatbax/app-core/utils/song-visualizer-panel';
import type { BottomTabsController, RightTabsController } from '../components/shell/tabs';
import type { AboutModalController, ShortcutsModalController } from '../components/shell/modals';
import { LoadingOverlay } from '../components/shell/loading-overlay';
import { MenuBar } from '../components/shell/menu-bar';
import type { ThemeManager } from './theme-manager';
import type { DesktopCopilotHandle } from './desktop-copilot';
import { blurChromeFocus, suppressChromeTabFocus } from './desktop-focus';
import type { DesktopSettingsModalHandle } from '../components/panels/DesktopSettingsModal';
import type { DesktopToolbarHandle } from '../components/workspace/DesktopToolbar';
import type { DesktopTransportBarHandle } from '../components/workspace/DesktopTransportBar';

function readPanelVis(key: string, defaultVal = true): boolean {
  const raw = storage.get(key);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return defaultVal;
}

export interface SetupDesktopMenuBarOptions {
  container: HTMLElement;
  appContext: AppContext;
  getEditor: () => BeatBaxEditor | null;
  getSource: () => string;
  toolbar: DesktopToolbarHandle;
  transportBar: DesktopTransportBarHandle;
  bottomTabs: BottomTabsController;
  rightTabs: RightTabsController;
  settingsModal: DesktopSettingsModalHandle;
  shortcutsModal: ShortcutsModalController;
  aboutModal: AboutModalController;
  themeManager: ThemeManager;
  copilot: DesktopCopilotHandle | null;
  runParse: (content: string) => void;
  handleExport: (format: ExportFormat) => Promise<void>;
  openNewSongWizard: () => void;
  onOpen: () => void | Promise<void>;
  onOpenRecent?: (filePath: string) => void;
  onClearRecent?: () => void;
  onSave: (saveAs?: boolean) => void | Promise<void>;
  onLoadDocument: (name: string, content: string) => void;
  viewPrefsHandlers: EditorViewPrefsHandlers;
}

export function setupDesktopMenuBar(options: SetupDesktopMenuBarOptions): {
  menuBar: MenuBar;
  dispose: () => void;
} | null {
  const {
    container,
    appContext,
    getEditor,
    getSource,
    toolbar,
    transportBar,
    bottomTabs,
    settingsModal,
    shortcutsModal,
    aboutModal,
    themeManager,
    copilot,
    runParse,
    handleExport,
    openNewSongWizard,
  onOpen,
  onOpenRecent,
  onClearRecent,
  onSave,
    onLoadDocument,
    viewPrefsHandlers,
  } = options;
  const { eventBus, playbackManager, capabilities } = appContext;

  if (!capabilities.export) return null;

  container.innerHTML = '';
  const loadingOverlay = new LoadingOverlay();
  const monacoInst = () => getEditor()?.editor;

  const menuBar = new MenuBar({
    container,
    eventBus,
    loadingOverlay,
    enableGlobalShortcuts: false,
    onOpenCommandPalette: () => {
      monacoInst()?.focus();
      monacoInst()?.trigger('', 'editor.action.quickCommand', null);
    },
    onShowShortcuts: () => shortcutsModal.open(),
    onShowSettings: () => settingsModal.open(),
    onShowAbout: () => aboutModal.open(),
    onExport: (format) => { void handleExport(format as ExportFormat); },
    onNew: () => openNewSongWizard(),
    onOpen: () => { void onOpen(); },
    onOpenRecent: (filePath) => { onOpenRecent?.(filePath); },
    onClearRecent: () => onClearRecent?.(),
    onBeforeExampleLoad: () => playbackManager.stop(),
    onSave: () => { void onSave(false); },
    onSaveAs: () => { void onSave(true); },
    onExit: () => window.electronAPI?.closeWindow(),
    onLoadFile: (filename, content) => {
      playbackManager.stop();
      onLoadDocument(filename, content);
      runParse(content);
      scheduleCommentsFoldPreference(monacoInst(), toolbar);
      loadingOverlay.hide();
    },
    onUndo: () => monacoInst()?.trigger('menu', 'undo', null),
    onRedo: () => monacoInst()?.trigger('menu', 'redo', null),
    onCut: () => monacoInst()?.trigger('menu', 'editor.action.clipboardCutAction', null),
    onCopy: () => monacoInst()?.trigger('menu', 'editor.action.clipboardCopyAction', null),
    onPaste: () => monacoInst()?.trigger('menu', 'editor.action.clipboardPasteAction', null),
    onSelectAll: () => monacoInst()?.trigger('menu', 'editor.action.selectAll', null),
    onFind: () => monacoInst()?.trigger('menu', 'actions.find', null),
    onReplace: () => monacoInst()?.trigger('menu', 'editor.action.startFindReplaceAction', null),
    onZoomIn: () => {
      const cur = (monacoInst()?.getOption(52) as number) || 14;
      monacoInst()?.updateOptions({ fontSize: Math.min(cur + 2, 32) });
    },
    onZoomOut: () => {
      const cur = (monacoInst()?.getOption(52) as number) || 14;
      monacoInst()?.updateOptions({ fontSize: Math.max(cur - 2, 8) });
    },
    onZoomReset: () => monacoInst()?.updateOptions({ fontSize: 14 }),
    onToggleTheme: () => themeManager.toggle(),
    onToggleWrapText: () => viewPrefsHandlers.onToggleWrapText(),
    onToggleFoldAll: () => viewPrefsHandlers.onToggleFoldAll(),
    onToggleAutoSave: () => settingAutoSave.set(!settingAutoSave.get()),
    onToggleAI: () => copilot?.toggle() ?? false,
    getToolbarVisible: () => toolbar.isVisible(),
    getTransportVisible: () => transportBar.isVisible(),
  });

  menuBar.setWrapTextChecked(settingWordWrap.get());
  menuBar.setFoldAllChecked(settingFoldComments.get());
  menuBar.setAutoSaveChecked(settingAutoSave.get());
  const unsubWrap = settingWordWrap.subscribe((wrap) => menuBar.setWrapTextChecked(wrap));
  const unsubFold = settingFoldComments.subscribe((folded) => menuBar.setFoldAllChecked(folded));
  const unsubAutoSave = settingAutoSave.subscribe((enabled) => menuBar.setAutoSaveChecked(enabled));

  menuBar.seedPanelVisible({
    toolbar: settingShowToolbar.get(),
    'transport-bar': settingShowTransportBar.get(),
    'channel-mixer': shouldShowChannelMixer(getCurrentCapabilities()),
    'pattern-grid': shouldShowPatternGrid(getCurrentCapabilities()),
    'song-visualizer': shouldShowLegacySongVisualizerTab(getCurrentCapabilities()),
    'ai-assistant': copilot?.isVisible() ?? false,
    output: bottomTabs.tabOpen.output ?? false,
    problems: bottomTabs.tabOpen.problems ?? true,
    help: false,
  });

  // Keep menu triggers out of the default tab order (see desktop-focus.ts).
  suppressChromeTabFocus(container);
  blurChromeFocus();

  return {
    menuBar,
    dispose: () => {
      unsubWrap();
      unsubFold();
      unsubAutoSave();
      menuBar.dispose();
    },
  };
}
