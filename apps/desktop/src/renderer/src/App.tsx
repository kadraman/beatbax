import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createAppContext, type ParsePipelineHooks } from '@beatbax/app-core';
import type { BeatBaxEditor } from '@beatbax/app-core/editor';
import { editorContent, editorDirty } from '@beatbax/app-core/stores/editor.store';
import { settingAutoSave, settingDefaultBpm } from '@beatbax/app-core/stores/settings.store';
import type { MenuAction } from '../../shared/electron-api';
import { DesktopWorkspaceShell, mapMenuActionToExport } from './components/DesktopWorkspaceShell';
import { DesktopTitleBar } from './components/DesktopTitleBar';
import { useStoreValue } from './hooks/useStoreValue';
import { getInitialContent } from './lib/bootstrap';
import { autoSaveDocumentToDisk, saveDocumentToDisk } from './lib/desktop-document-save';
import { persistDocumentSession, readPersistedDocument } from './lib/desktop-session';
import type { DesktopWorkspaceHandle } from './lib/desktop-workspace';

interface OpenDocument {
  path: string | null;
  name: string;
}

interface PendingAutoPlay {
  content: string;
}

function hasPlayAuto(ast: unknown): boolean {
  return (ast as { play?: { auto?: boolean } } | null)?.play?.auto === true;
}

function useAppContext(parseHooks: ParsePipelineHooks) {
  const appContextRef = useRef<ReturnType<typeof createAppContext> | null>(null);
  if (!appContextRef.current) {
    appContextRef.current = createAppContext({ parseHooks });
    appContextRef.current.initializePlugins();
  }
  return appContextRef.current;
}

export default function App(): React.JSX.Element {
  const parseHooksRef = useRef<ParsePipelineHooks>({});
  const appContext = useAppContext(parseHooksRef.current);
  const editorRef = useRef<BeatBaxEditor | null>(null);
  const workspaceRef = useRef<DesktopWorkspaceHandle | null>(null);
  const menuBarHostRef = useRef<HTMLDivElement | null>(null);
  const toolbarHostRef = useRef<HTMLDivElement | null>(null);
  const workspaceHostRef = useRef<HTMLDivElement | null>(null);
  const statusBarHostRef = useRef<HTMLDivElement | null>(null);
  const [documentState, setDocumentState] = useState<OpenDocument>(() => readPersistedDocument());
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const defaultBpm = useStoreValue(settingDefaultBpm);
  const initialContent = useMemo(() => getInitialContent(defaultBpm), [defaultBpm]);

  const getEditor = useCallback(() => editorRef.current, []);
  const pendingEditorContentRef = useRef<string | null>(null);
  const pendingAutoPlayRef = useRef<PendingAutoPlay | null>(null);

  const syncDocumentStatus = useCallback((doc: OpenDocument) => {
    workspaceRef.current?.statusBar?.setDocumentInfo({
      name: doc.name,
      path: doc.path,
    });
  }, []);

  const runParse = useCallback((content: string) => {
    workspaceRef.current?.runParse(content);
  }, []);

  const requestAutoPlayAfterParse = useCallback((content: string) => {
    pendingAutoPlayRef.current = { content };
  }, []);

  const stopPlayback = useCallback(() => {
    appContext.playbackManager.stop();
  }, [appContext.playbackManager]);

  const handleEditorReady = useCallback((editor: BeatBaxEditor) => {
    editorRef.current = editor;
    if (pendingEditorContentRef.current !== null) {
      const content = pendingEditorContentRef.current;
      pendingEditorContentRef.current = null;
      editor.setValue(content);
      editorContent.set(content);
      runParse(content);
    }
  }, [runParse]);

  const loadDocument = useCallback((name: string, content: string, filePath: string | null) => {
    stopPlayback();
    requestAutoPlayAfterParse(content);
    const nextDoc = { path: filePath, name };
    setDocumentState(nextDoc);
    persistDocumentSession(filePath, name);
    syncDocumentStatus(nextDoc);
    appContext.eventBus.emit('song:loaded', { filename: name });

    if (editorRef.current) {
      editorRef.current.setValue(content);
      editorContent.set(content);
      editorDirty.set(false);
      runParse(content);
      workspaceRef.current?.refreshEditorViewPrefs();
    } else {
      pendingEditorContentRef.current = content;
      editorContent.set(content);
      editorDirty.set(false);
    }
    void workspaceRef.current?.refreshRecentFiles();
  }, [appContext.eventBus, requestAutoPlayAfterParse, runParse, stopPlayback, syncDocumentStatus]);

  const decodePayload = useCallback((payload: { path: string; name: string; data: Uint8Array }) => {
    const content = new TextDecoder().decode(payload.data);
    loadDocument(payload.name, content, payload.path);
  }, [loadDocument]);

  const handleOpen = useCallback(async () => {
    stopPlayback();
    const payload = await window.electronAPI.openFile();
    if (payload) decodePayload(payload);
  }, [decodePayload, stopPlayback]);

  const handleSave = useCallback(async (saveAs = false) => {
    const api = window.electronAPI;
    if (!api) return;
    const content = editorRef.current?.getValue() ?? editorContent.get();
    try {
      const savedPath = await saveDocumentToDisk(api, content, documentStateRef.current, saveAs);
      if (savedPath) {
        const name = savedPath.split(/[/\\]/).pop() ?? 'untitled.bax';
        const nextDoc = { path: savedPath, name };
        setDocumentState(nextDoc);
        persistDocumentSession(savedPath, name);
        editorDirty.set(false);
        syncDocumentStatus(nextDoc);
        appContext.eventBus.emit('editor:saved', { filename: name });
        void workspaceRef.current?.refreshRecentFiles();
      }
    } catch (error) {
      console.error('Save failed', error);
    }
  }, [appContext.eventBus, syncDocumentStatus]);

  const handleCreateFromWizard = useCallback((source: string, songName: string) => {
    const name = songName.trim() ? `${songName.trim()}.bax` : 'untitled.bax';
    loadDocument(name, source, null);
  }, [loadDocument]);

  const handleLoadDocument = useCallback((name: string, content: string) => {
    loadDocument(name, content, null);
  }, [loadDocument]);

  const handleOpenRecent = useCallback((filePath: string) => {
    stopPlayback();
    window.electronAPI.openRecentFile(filePath);
  }, [stopPlayback]);

  const handleWorkspaceReady = useCallback((handle: DesktopWorkspaceHandle) => {
    workspaceRef.current = handle;
    syncDocumentStatusRef.current(documentStateRef.current);
    void handle.refreshRecentFiles();
  }, []);

  const handleNew = useCallback(() => {
    stopPlayback();
    workspaceRef.current?.openNewSongWizard();
  }, [stopPlayback]);

  const handleMenuAction = useCallback((action: MenuAction) => {
    switch (action) {
      case 'file:new': handleNew(); break;
      case 'file:open': void handleOpen(); break;
      case 'file:save': void handleSave(false); break;
      case 'file:save-as': void handleSave(true); break;
      case 'playback:play':
        workspaceRef.current?.transportBar.playButton.click();
        break;
      case 'playback:pause':
        workspaceRef.current?.transportBar.pauseButton.click();
        break;
      case 'playback:stop':
        workspaceRef.current?.transportBar.stopButton.click();
        break;
      case 'view:toggle-devtools':
        window.electronAPI.toggleDevTools();
        break;
      case 'help:about':
        workspaceRef.current?.aboutModal.open();
        break;
      default: {
        const exportFormat = mapMenuActionToExport(action);
        if (exportFormat) void workspaceRef.current?.handleExport(exportFormat);
        break;
      }
    }
  }, [handleNew, handleOpen, handleSave]);

  const handleMenuActionRef = useRef(handleMenuAction);
  handleMenuActionRef.current = handleMenuAction;
  const decodePayloadRef = useRef(decodePayload);
  decodePayloadRef.current = decodePayload;
  const documentStateRef = useRef(documentState);
  documentStateRef.current = documentState;
  const syncDocumentStatusRef = useRef(syncDocumentStatus);
  syncDocumentStatusRef.current = syncDocumentStatus;

  useEffect(() => {
    if (!window.electronAPI) {
      setBootstrapError('Electron preload failed to load. Restart the app or check the terminal for preload errors.');
      return;
    }
    const cleanupMenu = window.electronAPI.onMenuAction((action) => handleMenuActionRef.current(action));
    const cleanupFileOpen = window.electronAPI.onFileOpened((payload) => decodePayloadRef.current(payload));
    return () => {
      cleanupMenu();
      cleanupFileOpen();
    };
  }, []);

  useEffect(() => {
    if (pendingEditorContentRef.current) return;
    requestAutoPlayAfterParse(initialContent);
    runParse(initialContent);
    syncDocumentStatusRef.current(documentStateRef.current);
  }, [initialContent, requestAutoPlayAfterParse, runParse]);

  useEffect(() => {
    const unsubParseSuccess = appContext.eventBus.on('parse:success', ({ ast }) => {
      const pending = pendingAutoPlayRef.current;
      if (!pending) return;

      const currentContent = editorRef.current?.getValue() ?? editorContent.get();
      if (currentContent !== pending.content) return;

      pendingAutoPlayRef.current = null;
      if (!hasPlayAuto(ast)) return;

      window.setTimeout(() => {
        const workspace = workspaceRef.current;
        if (!workspace) return;
        if ((editorRef.current?.getValue() ?? editorContent.get()) !== pending.content) return;
        if (!workspace.transportBar.playButton.disabled) {
          workspace.transportBar.playButton.click();
        }
      }, 0);
    });

    const clearPendingAutoPlay = () => {
      pendingAutoPlayRef.current = null;
    };
    const unsubParseError = appContext.eventBus.on('parse:error', clearPendingAutoPlay);

    return () => {
      unsubParseSuccess();
      unsubParseError();
    };
  }, [appContext.eventBus]);

  useEffect(() => {
    syncDocumentStatus(documentState);
  }, [documentState, syncDocumentStatus]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    let queuedSave: Promise<void> = Promise.resolve();

    const unsub = appContext.eventBus.on('editor:changed', ({ content }) => {
      if (!settingAutoSave.get()) return;
      const filePath = documentStateRef.current.path;
      if (!filePath) return;

      queuedSave = queuedSave
        .then(async () => {
          const saved = await autoSaveDocumentToDisk(api, content, filePath);
          if (saved) editorDirty.set(false);
        })
        .catch((error) => {
          console.error('Auto-save failed', error);
        });
    });

    return unsub;
  }, [appContext.eventBus]);

  if (bootstrapError) {
    return (
      <div className="desktop-fatal">
        <h1>BeatBax Desktop</h1>
        <p>{bootstrapError}</p>
      </div>
    );
  }

  return (
    <div className="desktop-shell">
      <DesktopTitleBar menuHostRef={menuBarHostRef} />
      <div ref={toolbarHostRef} id="bb-toolbar-host" />
      <div ref={workspaceHostRef} className="desktop-workspace-host" />
      <div ref={statusBarHostRef} id="bb-status-bar-host" className="desktop-status-bar-host" />
      <DesktopWorkspaceShell
        appContext={appContext}
        parseHooks={parseHooksRef.current}
        menuBarHostRef={menuBarHostRef}
        toolbarHostRef={toolbarHostRef}
        workspaceHostRef={workspaceHostRef}
        statusBarHostRef={statusBarHostRef}
        initialContent={initialContent}
        getEditor={getEditor}
        onEditorReady={handleEditorReady}
        onOpen={handleOpen}
        onOpenRecent={handleOpenRecent}
        onSave={handleSave}
        onLoadDocument={handleLoadDocument}
        onCreateFromWizard={handleCreateFromWizard}
        onWorkspaceReady={handleWorkspaceReady}
      />
    </div>
  );
}
