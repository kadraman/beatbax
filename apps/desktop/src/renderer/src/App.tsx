import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createAppContext, type ParsePipelineHooks } from '@beatbax/app-core';
import type { BeatBaxEditor } from '@beatbax/app-core/editor';
import { editorContent, editorDirty } from '@beatbax/app-core/stores/editor.store';
import { settingDefaultBpm } from '@beatbax/app-core/stores/settings.store';
import { StorageKey, storage } from '@beatbax/app-core/utils/local-storage';
import type { MenuAction } from '../../shared/electron-api';
import { DesktopWorkspaceShell, mapMenuActionToExport } from './components/DesktopWorkspaceShell';
import { DesktopTitleBar } from './components/DesktopTitleBar';
import { useStoreValue } from './hooks/useStoreValue';
import { getInitialContent } from './lib/bootstrap';
import type { DesktopWorkspaceHandle } from './lib/desktop-workspace';

interface OpenDocument {
  path: string | null;
  name: string;
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
  const [documentState, setDocumentState] = useState<OpenDocument>({ path: null, name: 'untitled.bax' });
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const defaultBpm = useStoreValue(settingDefaultBpm);
  const initialContent = useMemo(() => getInitialContent(defaultBpm), [defaultBpm]);

  const getEditor = useCallback(() => editorRef.current, []);
  const setEditorRef = useCallback((editor: BeatBaxEditor | null) => {
    editorRef.current = editor;
  }, []);

  const syncDocumentStatus = useCallback((doc: OpenDocument) => {
    workspaceRef.current?.statusBar?.setDocumentInfo({
      name: doc.name,
      path: doc.path,
    });
  }, []);

  const runParse = useCallback((content: string) => {
    workspaceRef.current?.runParse(content);
  }, []);

  const loadDocument = useCallback((name: string, content: string, filePath: string | null) => {
    editorRef.current?.setValue(content);
    editorContent.set(content);
    editorDirty.set(false);
    const nextDoc = { path: filePath, name };
    setDocumentState(nextDoc);
    storage.set(StorageKey.LOADED_FILENAME, name);
    syncDocumentStatus(nextDoc);
    workspaceRef.current?.menuBar?.recordRecent(name);
    runParse(content);
  }, [runParse, syncDocumentStatus]);

  const decodePayload = useCallback((payload: { path: string; name: string; data: Uint8Array }) => {
    const content = new TextDecoder().decode(payload.data);
    loadDocument(payload.name, content, payload.path);
  }, [loadDocument]);

  const handleOpen = useCallback(async () => {
    const payload = await window.electronAPI.openFile();
    if (payload) decodePayload(payload);
  }, [decodePayload]);

  const handleSave = useCallback(async (saveAs = false) => {
    const content = editorRef.current?.getValue() ?? editorContent.get();
    const defaultPath = documentState.path ?? documentState.name;
    const savedPath = await window.electronAPI.saveFile(
      { defaultPath, showDialog: saveAs || !documentState.path },
      new TextEncoder().encode(content),
    );
    if (savedPath) {
      const name = savedPath.split(/[/\\]/).pop() ?? 'untitled.bax';
      const nextDoc = { path: savedPath, name };
      setDocumentState(nextDoc);
      editorDirty.set(false);
      syncDocumentStatus(nextDoc);
    }
  }, [documentState.name, documentState.path, syncDocumentStatus]);

  const handleCreateFromWizard = useCallback((source: string, songName: string) => {
    const name = songName.trim() ? `${songName.trim()}.bax` : 'untitled.bax';
    loadDocument(name, source, null);
  }, [loadDocument]);

  const handleLoadDocument = useCallback((name: string, content: string) => {
    loadDocument(name, content, null);
  }, [loadDocument]);

  const handleWorkspaceReady = useCallback((handle: DesktopWorkspaceHandle) => {
    workspaceRef.current = handle;
    syncDocumentStatusRef.current(documentStateRef.current);
  }, []);

  const handleNew = useCallback(() => {
    workspaceRef.current?.openNewSongWizard();
  }, []);

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
    runParse(initialContent);
    syncDocumentStatusRef.current({ path: null, name: 'untitled.bax' });
  }, [initialContent, runParse]);

  useEffect(() => {
    syncDocumentStatus(documentState);
  }, [documentState, syncDocumentStatus]);

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
        setEditorRef={setEditorRef}
        onOpen={handleOpen}
        onSave={handleSave}
        onLoadDocument={handleLoadDocument}
        onCreateFromWizard={handleCreateFromWizard}
        onWorkspaceReady={handleWorkspaceReady}
      />
    </div>
  );
}
