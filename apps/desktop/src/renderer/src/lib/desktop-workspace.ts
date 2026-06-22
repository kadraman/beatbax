import type { AppContext, ParsePipelineHooks } from '@beatbax/app-core';
import type { BeatBaxEditor } from '@beatbax/app-core/editor';
import type { ExportFormat } from '@beatbax/app-core/export/export-manager';
import { sanitizeFilename } from '@beatbax/app-core/export/download-helper';
import { TransportControls } from '@beatbax/app-core/playback/transport-controls';
import { ensureChannels } from '@beatbax/app-core/stores/channel.store';
import { settingDefaultBpm, settingSongArtist } from '@beatbax/app-core/stores/settings.store';
import { storage, StorageKey } from '@beatbax/app-core/utils/local-storage';
import { isFeatureEnabled, FeatureFlag } from '@beatbax/app-core/utils/feature-flags';
import { chipRegistry } from '@beatbax/engine/chips';
import { buildBottomTabs, buildRightTabs } from '@web-ui/app/tabs';
import { buildShortcutsModal, buildAboutModal } from '@web-ui/app/modals';
import { ChannelMixer } from '@web-ui/panels/channel-mixer';
import {
  buildNewSongWizard,
  claimNewSongWizardOnboarding,
  type NewSongWizardController,
} from '@web-ui/panels/new-song-wizard';
import { SongVisualizer } from '@web-ui/panels/song-visualizer';
import { createThreePaneLayout } from '@web-ui/ui/layout';
import type { PanelMenuId, PanelMenuState } from '@web-ui/ui/panels-menu';
import { StatusBar } from '@web-ui/ui/status-bar';
import { ThemeManager } from '@web-ui/ui/theme-manager';
import { installGlobalErrorHandlers } from '@web-ui/utils/error-boundary';
import { KeyboardShortcuts } from '@web-ui/utils/keyboard-shortcuts';
import { setupDesktopCopilot, type DesktopCopilotHandle } from './desktop-copilot';
import { setupDesktopEditor, type DesktopEditorSetupHandle } from './desktop-editor-setup';
import { handleDesktopExport } from './export-handler';
import { setupDesktopMenuBar } from './desktop-menu-bar';
import type { MenuBar } from '@web-ui/ui/menu-bar';
import { registerDesktopShortcuts } from './register-shortcuts';
import { setupDesktopMonacoShortcuts } from './setup-desktop-monaco-shortcuts';
import { setupFullIdeFeatures, type TransportDisplayState } from '@web-ui/app/full-ide-setup';
import { createEditorViewPrefsHandlers, syncEditorViewPrefsToToolbar, scheduleCommentsFoldPreference } from '@web-ui/app/editor-view-prefs';
import { settingFoldComments, settingWordWrap } from '@beatbax/app-core/stores/settings.store';
import { blurChromeFocus, focusWorkspaceEditor, suppressChromeTabFocus } from './desktop-focus';
import { createDesktopOutputPanel, type DesktopOutputPanelHandle } from '../components/panels/OutputPanels';
import { createDesktopHelpPanel, type DesktopHelpPanelHandle } from '../components/panels/HelpPanel';
import { createDesktopSettingsModal, noopDesktopSettingsModal, type DesktopSettingsModalHandle } from '../components/panels/DesktopSettingsModal';
import { createDesktopPatternGrid, type DesktopPatternGridHandle } from '../components/panels/DesktopPatternGrid';
import { createDesktopToolbar, type DesktopToolbarHandle } from '../components/workspace/DesktopToolbar';
import { createDesktopTransportBar, type DesktopTransportBarHandle } from '../components/workspace/DesktopTransportBar';

function readPanelVis(key: string, defaultVal = true): boolean {
  const raw = storage.get(key);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return defaultVal;
}

export interface DesktopWorkspaceOptions {
  container: HTMLElement;
  toolbarHost: HTMLElement;
  statusBarHost: HTMLElement;
  menuBarHost?: HTMLElement;
  appContext: AppContext;
  parseHooks: ParsePipelineHooks;
  getEditor: () => BeatBaxEditor | null;
  onOpen: () => void | Promise<void>;
  onOpenRecent?: (filePath: string) => void;
  onSave: (saveAs?: boolean) => void | Promise<void>;
  onLoadDocument: (name: string, content: string) => void;
  onCreateFromWizard: (source: string, songName: string) => void;
}

export interface DesktopWorkspaceHandle {
  editorPane: HTMLElement;
  toolbar: DesktopToolbarHandle;
  transportBar: DesktopTransportBarHandle;
  problemsPanel: DesktopOutputPanelHandle;
  outputPanel: DesktopOutputPanelHandle;
  helpPanel: DesktopHelpPanelHandle | null;
  settingsModal: DesktopSettingsModalHandle;
  shortcutsModal: ReturnType<typeof buildShortcutsModal>;
  aboutModal: ReturnType<typeof buildAboutModal>;
  keyboardShortcuts: KeyboardShortcuts;
  themeManager: ThemeManager;
  statusBar: StatusBar | null;
  newSongWizard: NewSongWizardController | null;
  copilot: DesktopCopilotHandle | null;
  runParse: (content: string) => void;
  handleExport: (format: ExportFormat) => Promise<void>;
  setupEditor: (editor: BeatBaxEditor) => void;
  openNewSongWizard: () => void;
  menuBar: MenuBar | null;
  focusEditor: () => void;
  refreshEditorViewPrefs: () => void;
  refreshRecentFiles: () => Promise<void>;
  dispose: () => void;
}

export function createDesktopWorkspace(options: DesktopWorkspaceOptions): DesktopWorkspaceHandle {
  const {
    container,
    toolbarHost,
    statusBarHost,
    menuBarHost,
    appContext,
    parseHooks,
    getEditor,
  } = options;
  const { eventBus, playbackManager, exportManager, capabilities } = appContext;
  const cleanups: Array<() => void> = [];
  let editorSetup: DesktopEditorSetupHandle | null = null;

  container.style.cssText = 'flex:1 1 0;min-height:0;display:flex;flex-direction:column;overflow:hidden;';

  const layoutHost = document.createElement('div');
  layoutHost.style.cssText =
    'flex:1 1 0;overflow:hidden;display:flex;flex-direction:column;';
  container.appendChild(layoutHost);

  const patternGridContainer = document.createElement('div');
  patternGridContainer.id = 'bb-pattern-grid-host';
  if (capabilities.patternGrid) {
    layoutHost.appendChild(patternGridContainer);
  } else {
    patternGridContainer.style.display = 'none';
  }

  const layout = createThreePaneLayout({ container: layoutHost, persist: true });
  const editorPane = layout.getEditorPane();
  const outputPane = layout.getOutputPane();
  const rightPane = layout.getRightPane();
  outputPane.style.padding = '0';
  outputPane.style.overflow = 'hidden';
  outputPane.style.display = 'flex';
  outputPane.style.flexDirection = 'column';
  outputPane.style.fontFamily = '';
  outputPane.style.fontSize = '';
  rightPane.style.padding = '0';
  rightPane.style.overflow = 'hidden';
  rightPane.style.display = 'flex';
  rightPane.style.flexDirection = 'column';

  const inlineMixerContainer = document.createElement('div');
  inlineMixerContainer.id = 'bb-inline-mixer-host';
  inlineMixerContainer.style.flexShrink = '0';
  if (capabilities.channelMixer) {
    layout.getLeftContentArea().appendChild(inlineMixerContainer);
  } else {
    inlineMixerContainer.style.display = 'none';
  }

  const mixerHostContainer = document.createElement('div');
  mixerHostContainer.id = 'bb-mixer-host';
  if (capabilities.channelMixer) {
    layoutHost.appendChild(mixerHostContainer);
  } else {
    mixerHostContainer.style.display = 'none';
  }

  const transportBar = createDesktopTransportBar(layoutHost);
  if (!readPanelVis(StorageKey.PANEL_VIS_TRANSPORT_BAR)) transportBar.hide();
  suppressChromeTabFocus(transportBar.el);

  let patternGrid: DesktopPatternGridHandle | null = null;
  if (capabilities.patternGrid) {
    if (!readPanelVis(StorageKey.PANEL_VIS_PATTERN_GRID, false)) {
      patternGridContainer.style.display = 'none';
    }
    patternGrid = createDesktopPatternGrid(patternGridContainer, { onNavigate: (patName: string) => {
      const monacoEditor = getEditor()?.editor;
      const source = getEditor()?.getValue() ?? '';
      const lines = source.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^\s*pat\s+(\S+)/);
        if (m && m[1] === patName) {
          monacoEditor?.setPosition({ lineNumber: i + 1, column: 1 });
          monacoEditor?.revealLineInCenter(i + 1);
          break;
        }
      }
    } });
  }

  const bottomTabs = buildBottomTabs(outputPane, layout, {
    onActiveTabChange: (tab) => {
      if (tab !== 'problems') problemsPanel?.dismissQuickFixMenu();
    },
  });
  const rightTabs = buildRightTabs(rightPane, layout);

  const problemsContainer = bottomTabs.tabContents.problems;
  const outputLogsContainer = bottomTabs.tabContents.output;
  const problemsPanel = createDesktopOutputPanel(problemsContainer, eventBus, {
    singleTab: 'problems',
    getTextModel: () => getEditor()?.editor.getModel() ?? null,
  });
  const outputPanel = createDesktopOutputPanel(outputLogsContainer, eventBus, { singleTab: 'output' });

  const panelMenuBridge = {
    getState(): PanelMenuState {
      return {
        outputOpen: bottomTabs.tabOpen.output ?? false,
        problemsOpen: bottomTabs.tabOpen.problems ?? true,
        outputPaneVisible: bottomTabs.isPaneVisible(),
        channelsOpen: rightTabs.tabOpen.channels ?? false,
        helpOpen: rightTabs.tabOpen.help ?? false,
        rightPaneVisible: layout.isRightPaneVisible(),
        toolbarVisible: toolbarRef.current?.isVisible?.() ?? true,
        transportVisible: transportBar?.isVisible?.() ?? true,
        channelMixerVisible: channelMixerRef.current?.isVisible?.() ?? false,
        patternGridVisible: patternGridContainer.style.display !== 'none',
        aiOpen: rightTabs.tabOpen.ai ?? false,
      };
    },
    toggle(_id: PanelMenuId): void { /* assigned after toolbar init */ },
    showProblems(): void {
      eventBus.emit('panel:toggled', { panel: 'problems', visible: true });
    },
  };

  const toolbarRef: { current: DesktopToolbarHandle | null } = { current: null };
  const channelMixerRef: { current: ChannelMixer | null } = { current: null };
  let statusBar: StatusBar | null = null;

  cleanups.push(installGlobalErrorHandlers((message) => {
    problemsPanel.addMessage({
      type: 'error',
      message: `Uncaught error: ${message}`,
      source: 'runtime',
      timestamp: new Date(),
    });
    bottomTabs.show('problems');
  }));

  let badgeErrors = 0;
  let badgeWarnings = 0;
  cleanups.push(
    eventBus.on('parse:error', () => bottomTabs.show('problems')),
    eventBus.on('validation:errors', ({ errors }) => {
      if (errors.length > 0) bottomTabs.show('problems');
      badgeErrors = errors.length;
      bottomTabs.updateBadge(badgeErrors, badgeWarnings);
    }),
    eventBus.on('validation:warnings', ({ warnings }) => {
      if (warnings.length > 0) bottomTabs.show('problems');
      badgeWarnings = warnings.length;
      bottomTabs.updateBadge(badgeErrors, badgeWarnings);
    }),
    eventBus.on('parse:error', () => {
      badgeErrors = 1;
      bottomTabs.updateBadge(badgeErrors, badgeWarnings);
    }),
    eventBus.on('playback:started', () => {
      if (capabilities.outputPanel) bottomTabs.show('output');
    }),
  );

  const ccContainer = document.createElement('div');
  ccContainer.id = 'bb-channel-controls-host';
  ccContainer.className = 'bb-right-panel-scroll';
  rightTabs.tabContents.channels!.appendChild(ccContainer);
  const songVisualizer = new SongVisualizer({
    container: ccContainer,
    eventBus,
    playbackManager,
    onPlay: () => transportBar.playButton.click(),
    onStop: () => transportBar.stopButton.click(),
  });
  void songVisualizer;

  let channelMixer: ChannelMixer | null = null;
  if (capabilities.channelMixer) {
    channelMixer = new ChannelMixer({
      container: mixerHostContainer,
      inlineContainer: inlineMixerContainer,
      eventBus,
      playbackManager,
    });
    channelMixerRef.current = channelMixer;
  }

  const helpContainer = document.createElement('div');
  helpContainer.style.cssText = 'flex:1 1 0;overflow:hidden;display:flex;flex-direction:column;';
  rightTabs.tabContents.help!.appendChild(helpContainer);

  const ks = new KeyboardShortcuts();
  const settingsModal = capabilities.settingsPanel
    ? createDesktopSettingsModal({
        onClose: () => {
          getEditor()?.editor.focus();
          getEditor()?.editor.layout();
        },
      })
    : noopDesktopSettingsModal;
  const shortcutsModal = buildShortcutsModal();
  const aboutModal = buildAboutModal(
    {
      version: window.electronAPI?.getVersion?.() ?? '0.1.0',
      commitId: typeof __BEATBAX_GIT_COMMIT__ !== 'undefined' ? __BEATBAX_GIT_COMMIT__ : 'unknown',
      platform: window.electronAPI?.getPlatform?.(),
    },
    {
      onOpenLink: (url) => {
        if (window.electronAPI?.openExternal) void window.electronAPI.openExternal(url);
        else window.open(url, '_blank', 'noopener,noreferrer');
      },
    },
  );

  let helpPanel: DesktopHelpPanelHandle | null = null;
  if (capabilities.helpPanel) {
    helpPanel = createDesktopHelpPanel(helpContainer, {
      eventBus,
      embedded: true,
      defaultVisible: true,
      getShortcuts: () => ks.list(),
      onInsertSnippet: (snippet) => {
        const monacoEditor = getEditor()?.editor;
        if (!monacoEditor) return;
        const selection = monacoEditor.getSelection();
        if (!selection) return;
        monacoEditor.executeEdits('help-panel', [{
          range: selection,
          text: snippet,
          forceMoveMarkers: true,
        }]);
        monacoEditor.focus();
      },
      onReplaceEditor: (text) => {
        getEditor()?.setValue(text);
        getEditor()?.focus();
      },
    });
  }

  let copilot: DesktopCopilotHandle | null = null;
  if (capabilities.copilot) {
    copilot = setupDesktopCopilot({
      rightTabs,
      eventBus,
      getEditor,
      getDiagnostics: () => editorSetup?.getLastDiagnostics() ?? [],
      onSettingsRefresh: () => settingsModal.refresh(),
      onOpenSettings: () => settingsModal.open('ai'),
    });
  }

  const themeManager = new ThemeManager({ eventBus });
  themeManager.init();
  (window as unknown as Record<string, unknown>).__beatbax_themeManager = themeManager;

  const getSource = () => getEditor()?.getValue() ?? '';
  let parseTimeout: number | null = null;
  let verifyPending = false;
  const runParse = (content: string) => {
    if (parseTimeout !== null) window.clearTimeout(parseTimeout);
    parseTimeout = window.setTimeout(() => {
      void appContext.emitParse(content);
    }, 180);
  };

  const runVerify = () => {
    const source = getSource();
    if (!source.trim()) {
      problemsPanel.addMessage({
        type: 'warning',
        message: 'Nothing to verify - the editor is empty. Use File > Open or type a song.',
        source: 'verify',
        timestamp: new Date(),
      });
      bottomTabs.show('problems');
      return;
    }
    verifyPending = true;
    runParse(source);
  };

  const getFilename = () => storage.get(StorageKey.LOADED_FILENAME, 'song') ?? 'song';

  const handleExport = async (format: ExportFormat) => {
    playbackManager.stop();
    await handleDesktopExport(format, {
      eventBus,
      exportManager,
      getSource,
      getFilename,
      problemsPanel,
      outputPanel,
      showProblems: () => bottomTabs.show('problems'),
    });
  };

  let newSongWizard: NewSongWizardController | null = null;
  if (capabilities.export) {
    newSongWizard = buildNewSongWizard({
      getEnabledChips: () => chipRegistry.listCanonical().flatMap((id) => {
        const plugin = chipRegistry.get(id);
        return plugin ? [{ id, plugin }] : [];
      }),
      getDefaultBpm: () => settingDefaultBpm.get(),
      getDefaultArtist: () => settingSongArtist.get(),
      onCreate: ({ source, songName }) => {
        playbackManager.stop();
        const stem = sanitizeFilename(songName.toLowerCase()) || 'song';
        storage.set(StorageKey.LOADED_FILENAME, `${stem}.bax`);
        outputPanel.addMessage({
          type: 'info',
          message: '📄 New song',
          source: 'app',
          timestamp: new Date(),
        });
        options.onCreateFromWizard(source, songName);
      },
    });

    if (claimNewSongWizardOnboarding(
      (key) => storage.get(key),
      (key, value) => storage.set(key, value),
      StorageKey.NEW_SONG_WIZARD_ONBOARDED,
    )) {
      newSongWizard.open();
    }
  }

  const openNewSongWizard = () => {
    if (newSongWizard) newSongWizard.open();
    else options.onCreateFromWizard('', 'untitled');
  };

  let viewPrefsHandlers: ReturnType<typeof createEditorViewPrefsHandlers> | null = null;

  const refreshEditorViewPrefs = () => {
    scheduleCommentsFoldPreference(getEditor()?.editor ?? null, toolbarRef.current);
    syncEditorViewPrefsToToolbar(toolbarRef.current);
  };

  const toolbar = createDesktopToolbar(toolbarHost, {
    eventBus,
    onBeforeOpenFile: () => playbackManager.stop(),
    onLoad: (filename, content) => options.onLoadDocument(filename, content),
    onOpen: options.onOpen,
    onExport: (format: ExportFormat) => { void handleExport(format); },
    onVerify: runVerify,
    onNew: openNewSongWizard,
    onSave: () => { void options.onSave(false); },
    onUndo: () => getEditor()?.editor.trigger('toolbar', 'undo', null),
    onRedo: () => getEditor()?.editor.trigger('toolbar', 'redo', null),
    onToggleTheme: () => themeManager.toggle(),
    onToggleWrap: (wrap) => viewPrefsHandlers?.onToggleWrap(wrap),
    onToggleFoldComments: () => viewPrefsHandlers?.onToggleFoldComments(),
  });

  viewPrefsHandlers = createEditorViewPrefsHandlers(
    () => getEditor()?.editor ?? null,
    toolbar,
  );
  (window as unknown as Record<string, unknown>).__beatbax_toolbar = toolbar;

  if (!readPanelVis(StorageKey.PANEL_VIS_TOOLBAR)) toolbar.hide();
  toolbarRef.current = toolbar;
  syncEditorViewPrefsToToolbar(toolbar);
  if (settingFoldComments.get()) {
    scheduleCommentsFoldPreference(getEditor()?.editor ?? null, toolbar);
  }
  cleanups.push(
    settingWordWrap.subscribe((wrap) => {
      getEditor()?.editor.updateOptions({ wordWrap: wrap ? 'on' : 'off' });
      toolbar.setWrapActive(wrap);
    }),
    settingFoldComments.subscribe((folded) => {
      toolbar.setFoldCommentsActive(folded);
    }),
  );
  suppressChromeTabFocus(toolbarHost);
  blurChromeFocus();

  let menuBar: MenuBar | null = null;
  let disposeMenuBar: (() => void) | null = null;

  const refreshRecentFiles = async (): Promise<void> => {
    if (!menuBar || !window.electronAPI) return;
    const paths = await window.electronAPI.getRecentFiles();
    menuBar.setRecentFiles(paths.map((filePath) => ({
      filename: filePath.split(/[/\\]/).pop() ?? filePath,
      path: filePath,
      opened: new Date().toISOString(),
    })));
  };

  if (menuBarHost) {
    const menuSetup = setupDesktopMenuBar({
      container: menuBarHost,
      appContext,
      getEditor,
      getSource,
      toolbar,
      bottomTabs,
      rightTabs,
      settingsModal,
      shortcutsModal,
      aboutModal,
      themeManager,
      copilot,
      runParse,
      handleExport,
      openNewSongWizard,
      onOpen: options.onOpen,
      onOpenRecent: options.onOpenRecent,
      onClearRecent: () => {
        void window.electronAPI?.clearRecentFiles().then(refreshRecentFiles);
      },
      onSave: options.onSave,
      onLoadDocument: options.onLoadDocument,
      viewPrefsHandlers,
    });
    if (menuSetup) {
      menuBar = menuSetup.menuBar;
      disposeMenuBar = menuSetup.dispose;
      void refreshRecentFiles();
    }
  }

  statusBarHost.innerHTML = '';
  statusBar = new StatusBar({
    container: statusBarHost,
    showDocumentInfo: true,
    getPanelMenuState: () => panelMenuBridge.getState(),
    onPanelMenuToggle: (id) => panelMenuBridge.toggle(id),
    onShowProblems: () => panelMenuBridge.showProblems(),
  });
  suppressChromeTabFocus(statusBarHost);

  panelMenuBridge.toggle = (id: PanelMenuId): void => {
    const s = panelMenuBridge.getState();
    switch (id) {
      case 'output':
        eventBus.emit('panel:toggled', { panel: 'output', visible: !(s.outputOpen && s.outputPaneVisible) });
        break;
      case 'problems':
        eventBus.emit('panel:toggled', { panel: 'problems', visible: !(s.problemsOpen && s.outputPaneVisible) });
        break;
      case 'song-visualizer':
        eventBus.emit('panel:toggled', { panel: 'song-visualizer', visible: !(s.channelsOpen && s.rightPaneVisible) });
        break;
      case 'help':
        eventBus.emit('panel:toggled', { panel: 'help', visible: !(s.helpOpen && s.rightPaneVisible) });
        break;
      case 'ai-assistant':
        eventBus.emit('panel:toggled', { panel: 'ai-assistant', visible: !(s.aiOpen && s.rightPaneVisible) });
        break;
      case 'toolbar':
        eventBus.emit('panel:toggled', { panel: 'toolbar', visible: !s.toolbarVisible });
        break;
      case 'transport-bar':
        eventBus.emit('panel:toggled', { panel: 'transport-bar', visible: !s.transportVisible });
        break;
      case 'channel-mixer':
        eventBus.emit('panel:toggled', { panel: 'channel-mixer', visible: !s.channelMixerVisible });
        break;
      case 'pattern-grid':
        eventBus.emit('panel:toggled', { panel: 'pattern-grid', visible: !s.patternGridVisible });
        break;
    }
    statusBar?.refreshPanelsMenu();
  };

  const transportControls = new TransportControls(
    {
      playButton: transportBar.playButton,
      pauseButton: transportBar.pauseButton,
      stopButton: transportBar.stopButton,
      applyButton: transportBar.applyButton,
      enableKeyboardShortcuts: false,
    },
    playbackManager,
    eventBus,
    getSource,
  );

  const transportDisplay: TransportDisplayState = { currentBpm: 120, currentSig: 4 };
  let lastBeat = -1;

  const fullIdeSetup = setupFullIdeFeatures({
    playbackManager,
    eventBus,
    transportBar,
    transportControls,
    outputPanel,
    getEditor,
    getSource,
    runParse,
    capabilities,
    transportDisplay,
  });

  cleanups.push(
    eventBus.on('parse:success', ({ ast, song }: { ast?: unknown; song?: unknown }) => {
      try {
        const channels = (ast as { channels?: Array<{ id: number }> })?.channels;
        if (channels?.length) ensureChannels(channels.map((c) => c.id));
        if (song && patternGrid) patternGrid.setSong(song, ast);
        toolbar.setChip((ast as { chip?: string })?.chip || 'gameboy');
        toolbar.setExportEnabled(true);
        menuBar?.setChip((ast as { chip?: string })?.chip || 'gameboy');
        if (verifyPending) {
          verifyPending = false;
          outputPanel.addMessage({
            type: 'success',
            message: 'Verification passed',
            source: 'verify',
            timestamp: new Date(),
          });
          toolbar.setStatus('Verification passed', 'success');
          bottomTabs.show('output');
        }
      } catch { /* ignore */ }
    }),
    eventBus.on('parse:error', ({ message }) => {
      toolbar.setExportEnabled(false);
      if (verifyPending) {
        verifyPending = false;
        problemsPanel.addMessage({
          type: 'error',
          message: `Verification failed: ${message}`,
          source: 'verify',
          timestamp: new Date(),
        });
        toolbar.setStatus('Verification failed', 'error');
        bottomTabs.show('problems');
      }
    }),
    eventBus.on('editor:saved', ({ filename }) => {
      outputPanel.addMessage({
        type: 'success',
        message: `Saved ${filename}`,
        source: 'file',
        timestamp: new Date(),
      });
      toolbar.setStatus(`Saved ${filename}`, 'success');
      bottomTabs.show('output');
    }),
    eventBus.on('theme:changed', ({ theme }: { theme: 'dark' | 'light' }) => {
      toolbar.setThemeIcon(theme);
      transportBar.volKnob.redraw();
    }),
    eventBus.on('playback:position', ({ current, total }) => {
      const mins = Math.floor(current / 60);
      const secs = Math.floor(current % 60);
      transportBar.setTimeLabel(`${mins}:${secs.toString().padStart(2, '0')}`);
      const { currentBpm, currentSig } = transportDisplay;
      if (currentBpm > 0 && currentSig > 0) {
        const secondsPerStep = 60 / currentBpm;
        const totalSteps = Math.floor(current / secondsPerStep);
        const bar = Math.floor(totalSteps / currentSig) + 1;
        const beat = (totalSteps % currentSig) + 1;
        transportBar.setBarBeat(bar, beat);
        if (beat !== lastBeat) {
          lastBeat = beat;
          transportBar.flashBeatLed();
        }
      }
      patternGrid?.setGlobalProgress(total > 0 ? current / total : 0);
    }),
    eventBus.on('playback:position-changed', ({ channelId, position }) => {
      if (channelId === 1) {
        transportBar.setStep((position.eventIndex ?? 0) + 1, (position.totalEvents ?? 0) || 1);
      }
      patternGrid?.setPosition(channelId, position.progress ?? 0);
    }),
    eventBus.on('playback:stopped', () => {
      transportBar.resetPosition();
      patternGrid?.clearPositions();
      lastBeat = -1;
    }),
    eventBus.on('playback:paused', () => patternGrid?.pausePositions()),
    eventBus.on('playback:started', () => patternGrid?.resumePositions()),
    eventBus.on('playback:resumed', () => patternGrid?.resumePositions()),
    eventBus.on('panel:toggled', ({ panel, visible }) => {
      if (panel === 'output') visible ? bottomTabs.show('output') : bottomTabs.close('output');
      if (panel === 'problems') visible ? bottomTabs.show('problems') : bottomTabs.close('problems');
      if (panel === 'song-visualizer' || panel === 'channels') {
        if (visible && capabilities.export && !isFeatureEnabled(FeatureFlag.SONG_VISUALIZER)) return;
        visible ? rightTabs.show('channels') : rightTabs.close('channels');
      }
      if (panel === 'help') visible ? rightTabs.show('help') : rightTabs.close('help');
      if (panel === 'channel-mixer') {
        if (!isFeatureEnabled(FeatureFlag.CHANNEL_MIXER)) return;
        channelMixer?.[visible ? 'show' : 'hide']?.();
      }
      if (panel === 'toolbar') toolbar[visible ? 'show' : 'hide']?.();
      if (panel === 'transport-bar') transportBar[visible ? 'show' : 'hide']?.();
      if (panel === 'pattern-grid') {
        patternGridContainer.style.display = visible ? '' : 'none';
        storage.set(StorageKey.PANEL_VIS_PATTERN_GRID, String(visible));
      }
      statusBar?.refreshPanelsMenu();
    }),
    eventBus.on('feature-flag:changed', ({ flag, enabled }) => {
      if (flag === FeatureFlag.CHANNEL_MIXER) {
        eventBus.emit('panel:toggled', { panel: 'channel-mixer', visible: enabled });
      }
      if (flag === FeatureFlag.PATTERN_GRID) {
        patternGridContainer.style.display = enabled ? '' : 'none';
        storage.set(StorageKey.PANEL_VIS_PATTERN_GRID, String(enabled));
      }
      if (flag === FeatureFlag.SONG_VISUALIZER) {
        enabled ? rightTabs.show('channels') : rightTabs.close('channels');
      }
      if (flag === FeatureFlag.AI_ASSISTANT && capabilities.settingsPanel) {
        settingsModal.refresh();
      }
    }),
  );

  registerDesktopShortcuts({
    ks,
    eventBus,
    getEditor,
    transportBar,
    toolbar,
    bottomTabs,
    rightTabs,
    settingsModal,
    shortcutsModal,
    runParse,
    getSource,
    onNew: openNewSongWizard,
    onOpen: options.onOpen,
    onSave: options.onSave,
    themeManager,
    channelMixer,
    copilot,
  });
  ks.mount();

  const shortcutsPanel = createDesktopHelpPanel(shortcutsModal.container, {
    eventBus,
    embedded: true,
    singleSection: 'shortcuts',
    hideHeader: true,
    twoColumns: true,
    defaultVisible: true,
    getShortcuts: () => ks.list(),
  });

  helpPanel?.refresh();

  suppressChromeTabFocus(container);
  blurChromeFocus();

  rightTabs.restorePersistedTab();
  const restoredRightTab = rightTabs.activeTab;
  if (isFeatureEnabled(FeatureFlag.AI_ASSISTANT)) {
    window.setTimeout(() => {
      copilot?.show({ activate: restoredRightTab === 'ai' });
      menuBar?.seedPanelVisible({ 'ai-assistant': copilot?.isVisible() ?? false });
      statusBar?.refreshPanelsMenu();
    }, 0);
  }
  if (!isFeatureEnabled(FeatureFlag.SONG_VISUALIZER)) {
    rightTabs.close('channels');
  }
  menuBar?.seedPanelVisible({
    help: rightTabs.tabOpen.help,
    'song-visualizer': rightTabs.tabOpen.channels,
    'ai-assistant': copilot?.isVisible() ?? false,
  });

  let monacoShortcutsDispose: (() => void) | null = null;

  const setupEditor = (editor: BeatBaxEditor) => {
    editorSetup?.dispose();
    monacoShortcutsDispose?.();
    editorSetup = setupDesktopEditor({
      editor,
      appContext,
      parseHooks,
      bottomTabs,
      outputPanel,
      statusBar,
      getSource,
      runParse,
      handleExport,
      onAstParsed: () => { /* scale context refreshed inside setup */ },
      toolbar: toolbarRef.current,
    });
    monacoShortcutsDispose = setupDesktopMonacoShortcuts({
      editor: editor.editor,
      transportBar,
      rightTabs,
      bottomTabs,
      shortcutsModal,
      settingsModal,
      themeManager,
      channelMixer,
      copilot,
      eventBus,
      runParse,
      getSource,
    });
    refreshEditorViewPrefs();
    focusWorkspaceEditor(editor);
    bottomTabs.expandPane();
    window.dispatchEvent(new Event('resize'));
  };

  const dispose = () => {
    fullIdeSetup.dispose();
    editorSetup?.dispose();
    monacoShortcutsDispose?.();
    copilot?.dispose();
    settingsModal.dispose();
    patternGrid?.dispose();
    disposeMenuBar?.();
    problemsPanel.dispose();
    outputPanel.dispose();
    shortcutsPanel.dispose();
    helpPanel?.dispose();
    statusBar?.dispose();
    transportBar.dispose();
    ks.dispose();
    toolbar.dispose();
    transportControls.dispose();
    layout.dispose();
    layoutHost.remove();
    if (parseTimeout !== null) window.clearTimeout(parseTimeout);
    for (const unsub of cleanups) unsub();
  };

  return {
    editorPane,
    toolbar,
    transportBar,
    problemsPanel,
    outputPanel,
    helpPanel,
    settingsModal,
    shortcutsModal,
    aboutModal,
    keyboardShortcuts: ks,
    themeManager,
    statusBar,
    newSongWizard,
    copilot,
    runParse,
    handleExport,
    setupEditor,
    openNewSongWizard,
    menuBar,
    focusEditor: () => {
      const editor = getEditor();
      if (editor) focusWorkspaceEditor(editor);
    },
    refreshEditorViewPrefs,
    refreshRecentFiles,
    dispose,
  };
}
