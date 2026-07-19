import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AppContext, ParsePipelineHooks } from '@beatbax/app-core';
import type { BeatBaxEditor } from '@beatbax/app-core/editor';
import type { ExportFormat } from '@beatbax/app-core/export/export-manager';
import type { MenuAction } from '../../../shared/electron-api';
import { createDesktopWorkspace, type DesktopWorkspaceHandle } from '../lib/desktop-workspace';
import { EditorPane } from './EditorPane';

export interface DesktopWorkspaceShellProps {
  appContext: AppContext;
  parseHooks: ParsePipelineHooks;
  menuBarHostRef: React.RefObject<HTMLDivElement | null>;
  toolbarHostRef: React.RefObject<HTMLDivElement | null>;
  workspaceHostRef: React.RefObject<HTMLDivElement | null>;
  statusBarHostRef: React.RefObject<HTMLDivElement | null>;
  initialContent: string;
  getEditor: () => BeatBaxEditor | null;
  onEditorReady: (editor: BeatBaxEditor) => void;
  onOpen: () => void | Promise<void>;
  onOpenRecent?: (filePath: string) => void;
  onSave: (saveAs?: boolean) => void | Promise<void>;
  onLoadDocument: (name: string, content: string) => void;
  onCreateFromWizard: (source: string, songName: string) => void;
  onWorkspaceReady?: (handle: DesktopWorkspaceHandle) => void;
}

export function DesktopWorkspaceShell({
  appContext,
  parseHooks,
  menuBarHostRef,
  toolbarHostRef,
  workspaceHostRef,
  statusBarHostRef,
  initialContent,
  getEditor,
  onEditorReady,
  onOpen,
  onOpenRecent,
  onSave,
  onLoadDocument,
  onCreateFromWizard,
  onWorkspaceReady,
}: DesktopWorkspaceShellProps): React.JSX.Element {
  const workspaceRef = useRef<DesktopWorkspaceHandle | null>(null);
  const [editorHost, setEditorHost] = useState<HTMLElement | null>(null);
  const [shellHostsReady, setShellHostsReady] = useState(false);

  useLayoutEffect(() => {
    const ready = Boolean(
      menuBarHostRef.current
      && toolbarHostRef.current
      && workspaceHostRef.current
      && statusBarHostRef.current,
    );
    if (ready) setShellHostsReady(true);
  });

  // Keep latest callbacks without re-mounting the vanilla DOM workspace.
  const actionsRef = useRef({
    onOpen,
    onOpenRecent,
    onSave,
    onLoadDocument,
    onCreateFromWizard,
    onWorkspaceReady,
  });
  actionsRef.current = {
    onOpen,
    onOpenRecent,
    onSave,
    onLoadDocument,
    onCreateFromWizard,
    onWorkspaceReady,
  };

  useEffect(() => {
    if (!shellHostsReady) return;

    const menuBarHost = menuBarHostRef.current;
    const toolbarHost = toolbarHostRef.current;
    const workspaceHost = workspaceHostRef.current;
    const statusBarHost = statusBarHostRef.current;
    if (!toolbarHost || !workspaceHost || !statusBarHost || !menuBarHost) return;

    // If a previous workspace survived a skipped cleanup (common under Vite HMR),
    // dispose it before mounting again. Do NOT wipe React-root hosts with
    // innerHTML — that orphans nested createRoot trees and causes removeChild errors.
    workspaceRef.current?.dispose();
    workspaceRef.current = null;

    // Imperative-only hosts (menu / status) can be cleared; toolbar + workspace
    // host React roots and must be torn down via dispose()/unmount only.
    menuBarHost.innerHTML = '';
    statusBarHost.innerHTML = '';

    const handle = createDesktopWorkspace({
      container: workspaceHost,
      toolbarHost,
      statusBarHost,
      menuBarHost,
      appContext,
      parseHooks,
      getEditor,
      onOpen: () => actionsRef.current.onOpen(),
      onOpenRecent: (filePath) => actionsRef.current.onOpenRecent?.(filePath),
      onSave: (saveAs) => actionsRef.current.onSave(saveAs),
      onLoadDocument: (name, content) => actionsRef.current.onLoadDocument(name, content),
      onCreateFromWizard: (source, songName) => actionsRef.current.onCreateFromWizard(source, songName),
    });
    workspaceRef.current = handle;
    setEditorHost(handle.editorPane);
    actionsRef.current.onWorkspaceReady?.(handle);

    return () => {
      handle.dispose();
      workspaceRef.current = null;
      setEditorHost(null);
      // Imperative hosts only — React roots already unmounted in dispose().
      menuBarHost.innerHTML = '';
      statusBarHost.innerHTML = '';
    };
  // Mount once shell host refs are attached — document/file callbacks use actionsRef.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appContext, parseHooks, getEditor, shellHostsReady]);

  return (
    <EditorPane
      host={editorHost}
      initialValue={initialContent}
      onReady={(editor) => {
        onEditorReady(editor);
        workspaceRef.current?.setupEditor(editor);
        workspaceRef.current?.focusEditor();
      }}
    />
  );
}

export function mapMenuActionToExport(action: MenuAction): ExportFormat | null {
  switch (action) {
    case 'file:export-json': return 'json';
    case 'file:export-midi': return 'midi';
    case 'file:export-uge': return 'uge';
    case 'file:export-wav': return 'wav';
    default: return null;
  }
}
