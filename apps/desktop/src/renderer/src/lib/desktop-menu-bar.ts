import type { AppContext } from '@beatbax/app-core';
import type { BeatBaxEditor } from '@beatbax/app-core/editor';
import type { ExportFormat } from '@beatbax/app-core/export/export-manager';
import type { EditorViewPrefsHandlers } from '../desktop-web-ui/app/editor-view-prefs';
import { scheduleCommentsFoldPreference } from '../desktop-web-ui/app/editor-view-prefs';
import { storage, StorageKey } from '@beatbax/app-core/utils/local-storage';
import { settingFoldComments, settingWordWrap } from '@beatbax/app-core/stores/settings.store';
import { isFeatureEnabled, FeatureFlag } from '@beatbax/app-core/utils/feature-flags';
import type { buildBottomTabs, buildRightTabs } from '../components/shell/tabs';
import type { buildShortcutsModal, buildAboutModal } from '../components/shell/modals';
import { LoadingOverlay } from '../components/shell/loading-overlay';
import { MenuBar } from '../components/shell/menu-bar';
import type { ThemeManager } from './theme-manager';
import type { DesktopCopilotHandle } from './desktop-copilot';
import { blurChromeFocus, suppressChromeTabFocus } from './desktop-focus';
import type { DesktopSettingsModalHandle } from '../components/panels/DesktopSettingsModal';
import type { DesktopToolbarHandle } from '../components/workspace/DesktopToolbar';

type BottomTabs = ReturnType<typeof buildBottomTabs>;
type RightTabs = ReturnType<typeof buildRightTabs>;
type ShortcutsModal = ReturnType<typeof buildShortcutsModal>;
type AboutModal = ReturnType<typeof buildAboutModal>;

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
  bottomTabs: BottomTabs;
  rightTabs: RightTabs;
  settingsModal: DesktopSettingsModalHandle;
  shortcutsModal: ShortcutsModal;
  aboutModal: AboutModal;
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
    onToggleAI: () => copilot?.toggle() ?? false,
  });

  menuBar.setWrapTextChecked(settingWordWrap.get());
  menuBar.setFoldAllChecked(settingFoldComments.get());
  const unsubWrap = settingWordWrap.subscribe((wrap) => menuBar.setWrapTextChecked(wrap));
  const unsubFold = settingFoldComments.subscribe((folded) => menuBar.setFoldAllChecked(folded));

  menuBar.seedPanelVisible({
    toolbar: readPanelVis(StorageKey.PANEL_VIS_TOOLBAR),
    'transport-bar': readPanelVis(StorageKey.PANEL_VIS_TRANSPORT_BAR),
    'channel-mixer': isFeatureEnabled(FeatureFlag.CHANNEL_MIXER)
      && readPanelVis(StorageKey.PANEL_VIS_CHANNEL_MIXER),
    'pattern-grid': isFeatureEnabled(FeatureFlag.PATTERN_GRID)
      && readPanelVis(StorageKey.PANEL_VIS_PATTERN_GRID, false),
    'song-visualizer': isFeatureEnabled(FeatureFlag.SONG_VISUALIZER)
      && readPanelVis(StorageKey.PANEL_VIS_SONG_VISUALIZER, false),
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
      menuBar.dispose();
    },
  };
}
