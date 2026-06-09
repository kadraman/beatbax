import { useEffect, useRef, useState } from 'react';
import { createEditor, configureMonaco, registerBeatBaxLanguage, registerNoteEditCommands } from '@beatbax/app-core/editor';
import type { BeatBaxEditor } from '@beatbax/app-core/editor';

interface EditorPaneProps {
  host: HTMLElement | null;
  initialValue: string;
  onReady(editor: BeatBaxEditor): void;
}

let monacoConfigured = false;

export function EditorPane({ host, initialValue, onReady }: EditorPaneProps): React.JSX.Element | null {
  const onReadyRef = useRef(onReady);
  const [editorError, setEditorError] = useState<string | null>(null);
  onReadyRef.current = onReady;

  useEffect(() => {
    if (!host) return;

    try {
      if (!monacoConfigured) {
        configureMonaco();
        registerBeatBaxLanguage();
        monacoConfigured = true;
      }

      host.style.height = '100%';
      host.style.minHeight = '0';

      const editor = createEditor({
        container: host,
        value: initialValue,
        theme: 'beatbax-dark',
        language: 'beatbax',
        autoSaveDelay: 500,
        emitChangedEvents: true,
      });

      registerNoteEditCommands(editor.editor);
      onReadyRef.current(editor);
      setEditorError(null);

      return () => {
        editor.dispose();
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Monaco editor failed to start:', error);
      setEditorError(message);
      return undefined;
    }
  }, [host]);

  if (!host) return null;

  if (editorError) {
    return (
      <div className="editor-pane editor-pane--error">
        <p>Editor failed to start: {editorError}</p>
      </div>
    );
  }

  return null;
}
