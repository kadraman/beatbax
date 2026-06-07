import { useEffect, useRef } from 'react';
import { createEditor, configureMonaco, registerBeatBaxLanguage, registerNoteEditCommands } from '@beatbax/app-core/editor';
import type { BeatBaxEditor } from '@beatbax/app-core/editor';

interface EditorPaneProps {
  initialValue: string;
  onReady(editor: BeatBaxEditor): void;
}

let monacoConfigured = false;

export function EditorPane({ initialValue, onReady }: EditorPaneProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (!monacoConfigured) {
      configureMonaco();
      registerBeatBaxLanguage();
      monacoConfigured = true;
    }

    const editor = createEditor({
      container: containerRef.current,
      value: initialValue,
      theme: 'beatbax-dark',
      language: 'beatbax',
      autoSaveDelay: 500,
      emitChangedEvents: true,
    });

    registerNoteEditCommands(editor.editor);
    onReady(editor);

    return () => {
      editor.dispose();
    };
  }, [initialValue, onReady]);

  return <div ref={containerRef} className="editor-pane" />;
}
