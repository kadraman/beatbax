import './styles.css';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createAppContext } from '@beatbax/app-core';
import type { BeatBaxEditor } from '@beatbax/app-core/editor';
import type { ValidationIssue } from '@beatbax/app-core/types/validation';
import { editorContent, editorDirty } from '@beatbax/app-core/stores/editor.store';
import { playbackStatus, playbackTimeLabel, playbackBpm } from '@beatbax/app-core/stores/playback.store';
import { settingDefaultBpm } from '@beatbax/app-core/stores/settings.store';
import { StorageKey, storage } from '@beatbax/app-core/utils/local-storage';
import type { MenuAction } from '../../shared/electron-api';
import { EditorPane } from './components/EditorPane';
import { HelpPanel } from './components/HelpPanel';
import { OutputPanel, type OutputEntry } from './components/OutputPanel';
import { Toolbar } from './components/Toolbar';
import { TransportBar } from './components/TransportBar';
import { useStoreValue } from './hooks/useStoreValue';
import { getInitialContent, getStarterSong } from './lib/bootstrap';

interface OpenDocument {
  path: string | null;
  name: string;
}

function useAppContext() {
  const appContextRef = useRef<ReturnType<typeof createAppContext> | null>(null);

  if (!appContextRef.current) {
    appContextRef.current = createAppContext();
    appContextRef.current.initializePlugins();
  }

  return appContextRef.current;
}

function normalizeIssues(issues: ValidationIssue[], tone: OutputEntry['tone']): OutputEntry[] {
  return issues.map((issue, index) => ({
    id: index,
    tone,
    message: `${issue.component}: ${issue.message}`,
  }));
}

export default function App(): React.JSX.Element {
  const appContext = useAppContext();
  const editorRef = useRef<BeatBaxEditor | null>(null);
  const parseTimeoutRef = useRef<number | null>(null);
  const [version, setVersion] = useState('0.0.0');
  const [documentState, setDocumentState] = useState<OpenDocument>({ path: null, name: 'untitled.bax' });
  const [validationErrors, setValidationErrors] = useState<ValidationIssue[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<ValidationIssue[]>([]);
  const [outputEntries, setOutputEntries] = useState<OutputEntry[]>([]);

  const currentContent = useStoreValue(editorContent);
  const isDirty = useStoreValue(editorDirty);
  const currentPlaybackState = useStoreValue(playbackStatus);
  const timeLabel = useStoreValue(playbackTimeLabel);
  const bpm = useStoreValue(playbackBpm);
  const defaultBpm = useStoreValue(settingDefaultBpm);

  const initialContent = useMemo(() => getInitialContent(defaultBpm), [defaultBpm]);

  const appendOutput = useCallback((tone: OutputEntry['tone'], message: string) => {
    setOutputEntries((entries) => [
      ...entries,
      { id: Date.now() + entries.length, tone, message },
    ]);
  }, []);

  const runParse = useCallback((content: string) => {
    if (parseTimeoutRef.current !== null) {
      window.clearTimeout(parseTimeoutRef.current);
    }
    parseTimeoutRef.current = window.setTimeout(() => {
      void appContext.emitParse(content);
    }, 180);
  }, [appContext]);

  const loadDocument = useCallback((name: string, content: string, filePath: string | null) => {
    editorRef.current?.setValue(content);
    editorContent.set(content);
    editorDirty.set(false);
    setDocumentState({ path: filePath, name });
    storage.set(StorageKey.LOADED_FILENAME, name);
    appendOutput('info', `Loaded ${name}`);
    runParse(content);
  }, [appendOutput, runParse]);

  const decodePayload = useCallback((payload: { path: string; name: string; data: Uint8Array }) => {
    const content = new TextDecoder().decode(payload.data);
    loadDocument(payload.name, content, payload.path);
  }, [loadDocument]);

  const handleOpen = useCallback(async () => {
    const payload = await window.electronAPI.openFile();
    if (payload) {
      decodePayload(payload);
    }
  }, [decodePayload]);

  const handleSave = useCallback(async (saveAs = false) => {
    const content = editorRef.current?.getValue() ?? currentContent;
    const defaultPath = documentState.path ?? documentState.name;
    const savedPath = await window.electronAPI.saveFile(
      { defaultPath, showDialog: saveAs || !documentState.path },
      new TextEncoder().encode(content),
    );

    if (savedPath) {
      const name = savedPath.split(/[/\\]/).pop() ?? 'untitled.bax';
      setDocumentState({ path: savedPath, name });
      editorDirty.set(false);
      appendOutput('info', `Saved ${name}`);
    }
  }, [appendOutput, currentContent, documentState.name, documentState.path]);

  const handleNew = useCallback(() => {
    const content = getStarterSong(defaultBpm);
    loadDocument('untitled.bax', content, null);
  }, [defaultBpm, loadDocument]);

  const handlePlay = useCallback(async () => {
    const source = editorRef.current?.getValue() ?? currentContent;
    if (currentPlaybackState === 'paused') {
      await appContext.playbackManager.resume();
      return;
    }
    await appContext.playbackManager.play(source);
  }, [appContext.playbackManager, currentContent, currentPlaybackState]);

  const handlePause = useCallback(async () => {
    if (currentPlaybackState === 'playing') {
      await appContext.playbackManager.pause();
    }
  }, [appContext.playbackManager, currentPlaybackState]);

  const handleStop = useCallback(() => {
    appContext.playbackManager.stop();
  }, [appContext.playbackManager]);

  const handleMenuAction = useCallback((action: MenuAction) => {
    switch (action) {
      case 'file:new':
        handleNew();
        break;
      case 'file:open':
        void handleOpen();
        break;
      case 'file:save':
        void handleSave(false);
        break;
      case 'file:save-as':
        void handleSave(true);
        break;
      case 'playback:play':
        void handlePlay();
        break;
      case 'playback:pause':
        void handlePause();
        break;
      case 'playback:stop':
        handleStop();
        break;
      case 'view:toggle-devtools':
      case 'help:docs':
      case 'help:repo':
      case 'file:export-json':
      case 'file:export-midi':
      case 'file:export-uge':
      case 'file:export-wav':
        appendOutput('warning', `${action} is wired through the native menu; richer desktop integrations are next.`);
        break;
      default:
        break;
    }
  }, [appendOutput, handleNew, handleOpen, handlePause, handlePlay, handleSave, handleStop]);

  useEffect(() => {
    setVersion(window.electronAPI.getVersion());

    const cleanupMenu = window.electronAPI.onMenuAction(handleMenuAction);
    const cleanupFileOpen = window.electronAPI.onFileOpened(decodePayload);

    const removeEditorChanged = appContext.eventBus.on('editor:changed', ({ content }) => {
      runParse(content);
    });
    const removeParseError = appContext.eventBus.on('parse:error', ({ message }) => {
      appendOutput('error', message);
    });
    const removePlaybackError = appContext.eventBus.on('playback:error', ({ error }) => {
      appendOutput('error', error.message);
    });
    const removeValidationErrors = appContext.eventBus.on('validation:errors', ({ errors }) => {
      setValidationErrors(errors);
    });
    const removeValidationWarnings = appContext.eventBus.on('validation:warnings', ({ warnings }) => {
      setValidationWarnings(warnings);
    });

    runParse(initialContent);

    return () => {
      cleanupMenu();
      cleanupFileOpen();
      removeEditorChanged();
      removeParseError();
      removePlaybackError();
      removeValidationErrors();
      removeValidationWarnings();
      if (parseTimeoutRef.current !== null) {
        window.clearTimeout(parseTimeoutRef.current);
      }
    };
  }, [appContext, appendOutput, decodePayload, handleMenuAction, initialContent, runParse]);

  const diagnostics = useMemo(
    () => [...normalizeIssues(validationErrors, 'error'), ...normalizeIssues(validationWarnings, 'warning')],
    [validationErrors, validationWarnings],
  );

  return (
    <div className="desktop-shell">
      <Toolbar
        documentName={documentState.name}
        isDirty={isDirty}
        version={version}
        onNew={handleNew}
        onOpen={() => void handleOpen()}
        onSave={() => void handleSave(false)}
        onSaveAs={() => void handleSave(true)}
        onVerify={() => runParse(editorRef.current?.getValue() ?? currentContent)}
      />
      <TransportBar
        playbackState={currentPlaybackState}
        bpm={bpm}
        timeLabel={timeLabel}
        onPlay={() => void handlePlay()}
        onPause={() => void handlePause()}
        onStop={handleStop}
      />
      <main className="workspace-grid">
        <section className="workspace-grid__editor">
          <EditorPane initialValue={initialContent} onReady={(editor) => { editorRef.current = editor; }} />
        </section>
        <aside className="workspace-grid__side">
          <HelpPanel />
        </aside>
        <section className="workspace-grid__bottom">
          <OutputPanel title="Problems" entries={diagnostics} />
          <OutputPanel title="Output" entries={outputEntries} />
        </section>
      </main>
      <footer className="status-bar">
        <span>Profile: {appContext.profile}</span>
        <span>Native menu: {appContext.capabilities.nativeMenu ? 'enabled' : 'disabled'}</span>
        <span>Current file: {documentState.path ?? 'Unsaved draft'}</span>
      </footer>
    </div>
  );
}
