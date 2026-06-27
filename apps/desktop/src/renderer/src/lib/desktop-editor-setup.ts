import type { AppContext, ParsePipelineHooks } from '@beatbax/app-core';
import type { BeatBaxEditor } from '@beatbax/app-core/editor';
import { setupBeatDecorations } from '@beatbax/app-core/editor/beat-decorations';
import { setupCodeLensPreview } from '@beatbax/app-core/editor/codelens-preview';
import { setupCommandPalette } from '@beatbax/app-core/editor/command-palette';
import type { ExportFormat } from '@beatbax/app-core/export/export-manager';
import {
  createDiagnosticsManager,
  setupDiagnosticsIntegration,
  warningsToDiagnostics,
  type Diagnostic,
} from '@beatbax/app-core/editor/diagnostics';
import { setupGlyphMargin } from '@beatbax/app-core/editor/glyph-margin';
import { resolveScaleContext } from '@beatbax/app-core/editor/scale-context';
import { toggleChannelMuted, toggleChannelSoloed } from '@beatbax/app-core/stores/channel.store';
import { storage, StorageKey } from '@beatbax/app-core/utils/local-storage';
import type { EventBus } from '@beatbax/app-core/utils/event-bus';
import type { StatusBar } from '../components/shell/status-bar';
import type { BottomTabsController } from '../components/shell/tabs';
import {
  applyStoredWordWrap,
  scheduleCommentsFoldPreference,
  syncEditorViewPrefsToToolbar,
} from './editor-view-prefs';
import type { DesktopOutputPanelHandle } from '../components/panels/OutputPanels';
import type { DesktopToolbarHandle } from '../components/workspace/DesktopToolbar';

export interface DesktopEditorSetupOptions {
  editor: BeatBaxEditor;
  appContext: AppContext;
  parseHooks: ParsePipelineHooks;
  bottomTabs: BottomTabsController;
  outputPanel: DesktopOutputPanelHandle;
  statusBar: StatusBar | null;
  getSource: () => string;
  runParse: (content: string) => void;
  handleExport: (format: ExportFormat) => Promise<void>;
  onAstParsed: (ast: unknown) => void;
  toolbar?: DesktopToolbarHandle | null;
}

export interface DesktopEditorSetupHandle {
  getLastDiagnostics: () => Diagnostic[];
  dispose: () => void;
}

export function setupDesktopEditor(options: DesktopEditorSetupOptions): DesktopEditorSetupHandle {
  const {
    editor,
    appContext,
    parseHooks,
    bottomTabs,
    outputPanel,
    statusBar,
    getSource,
    runParse,
    handleExport,
    onAstParsed,
    toolbar,
  } = options;
  const { eventBus, capabilities, playbackManager } = appContext;
  const monacoEditor = editor.editor;
  const cleanups: Array<() => void> = [];
  let lastParsedAst: unknown = null;
  let lastDiagnostics: Diagnostic[] = [];
  let codeLensDispose: (() => void) | null = null;
  let glyphMarginDispose: (() => void) | null = null;

  (window as unknown as Record<string, unknown>).__beatbax_editor = editor;

  monacoEditor.updateOptions({ foldingStrategy: 'auto' });

  applyStoredWordWrap(monacoEditor);
  syncEditorViewPrefsToToolbar(toolbar ?? null);
  scheduleCommentsFoldPreference(monacoEditor, toolbar ?? null);

  const storedFontSize = parseInt(storage.get(StorageKey.FONT_SIZE, '14') ?? '14', 10);
  monacoEditor.updateOptions({
    fontSize: Number.isNaN(storedFontSize) ? 14 : storedFontSize,
  });

  const diagnosticsManager = createDiagnosticsManager(monacoEditor);
  cleanups.push(setupDiagnosticsIntegration(diagnosticsManager));

  parseHooks.onSetValidation = (errors, warnings) => {
    const allDiags = [
      ...errors.map((e) => ({ ...e, level: 'error' as const })),
      ...warnings.map((w) => ({ ...w, level: 'warning' as const })),
    ];
    if (allDiags.length > 0) {
      diagnosticsManager.setDiagnostics(warningsToDiagnostics(allDiags));
    } else {
      diagnosticsManager.clear();
    }
  };

  if (capabilities.advancedEditor) {
    const storedCodeLens = storage.get(StorageKey.CODELENS, 'true') !== 'false';
    codeLensDispose = setupCodeLensPreview(monacoEditor, eventBus, getSource);
    monacoEditor.updateOptions({ codeLens: storedCodeLens });
    glyphMarginDispose = setupGlyphMargin(monacoEditor, eventBus);
  } else {
    monacoEditor.updateOptions({ codeLens: false });
  }

  const storedBeatDecorations = storage.get(StorageKey.BEAT_DECORATIONS, 'true') !== 'false';
  let beatDecorationsCleanup: (() => void) | null = null;
  if (storedBeatDecorations) {
    beatDecorationsCleanup = setupBeatDecorations(monacoEditor, eventBus);
  }
  (window as unknown as Record<string, unknown>).__beatbax_toggleBeatDecorations = (enabled: boolean) => {
    if (enabled && !beatDecorationsCleanup) {
      beatDecorationsCleanup = setupBeatDecorations(monacoEditor, eventBus);
    } else if (!enabled && beatDecorationsCleanup) {
      beatDecorationsCleanup();
      beatDecorationsCleanup = null;
    }
  };

  function refreshScaleContextStrip(): void {
    const model = monacoEditor.getModel();
    if (!model || !statusBar) {
      statusBar?.setScaleContext(null);
      return;
    }
    const pos = monacoEditor.getPosition();
    if (!pos) {
      statusBar.setScaleContext(null);
      return;
    }
    const lineText = model.getLineContent(pos.lineNumber);
    statusBar.setScaleContext(resolveScaleContext(lastParsedAst, lineText, pos.column));
  }

  cleanups.push(
    monacoEditor.onDidChangeCursorPosition((e) => {
      statusBar?.setCursorPosition(e.position.lineNumber, e.position.column);
      refreshScaleContextStrip();
    }).dispose,
    eventBus.on('navigate:to', ({ line, column }) => {
      monacoEditor.setPosition({ lineNumber: line, column });
      monacoEditor.revealLineInCenter(line);
      monacoEditor.focus();
    }),
    eventBus.on('parse:success', ({ ast }: { ast?: unknown }) => {
      lastParsedAst = ast ?? null;
      onAstParsed(lastParsedAst);
      refreshScaleContextStrip();
    }),
    eventBus.on('validation:errors', ({ errors }) => {
      lastDiagnostics = [
        ...lastDiagnostics.filter((d) => d.severity !== 'error'),
        ...errors.map((e: { message: string; loc?: { start?: { line?: number; column?: number } } }) => ({
          message: e.message,
          severity: 'error' as const,
          startLine: e.loc?.start?.line ?? 1,
          startColumn: e.loc?.start?.column ?? 1,
        })),
      ];
    }),
    eventBus.on('validation:warnings', ({ warnings }) => {
      lastDiagnostics = [
        ...lastDiagnostics.filter((d) => d.severity !== 'warning'),
        ...warnings.map((w: { message: string; loc?: { start?: { line?: number; column?: number } } }) => ({
          message: w.message,
          severity: 'warning' as const,
          startLine: w.loc?.start?.line ?? 1,
          startColumn: w.loc?.start?.column ?? 1,
        })),
      ];
    }),
    eventBus.on('preview:error', ({ message }: { message: string }) => {
      outputPanel.addMessage({
        type: 'info',
        message: `Preview failed: ${message}`,
        source: 'preview',
        timestamp: new Date(),
      });
      bottomTabs.show('output');
    }),
  );

  if (capabilities.advancedEditor) {
    const paletteDisposable = setupCommandPalette({
      editor: monacoEditor,
      getSource,
      onExport: (format) => { void handleExport(format as ExportFormat); },
      onVerify: () => runParse(getSource()),
      onToggleMute: (channelId) => toggleChannelMuted(channelId),
      onToggleSolo: (channelId) => toggleChannelSoloed(channelId),
      onStopPreview: () => monacoEditor.trigger('', 'beatbax.stopPreview', null),
      onPlayRaw: (src, chunkInfo) => {
        if (chunkInfo && Object.keys(chunkInfo).length > 0) {
          eventBus.emit('preview:chunkInfo', { chunkInfo });
        }
        bottomTabs.show('output');
        playbackManager.play(src);
      },
    });
    cleanups.push(() => paletteDisposable.dispose());
  }

  return {
    getLastDiagnostics: () => lastDiagnostics,
    dispose: () => {
      codeLensDispose?.();
      glyphMarginDispose?.();
      if (beatDecorationsCleanup) beatDecorationsCleanup();
      for (const unsub of cleanups) unsub();
    },
  };
}
