/**
 * Monaco Editor setup and configuration
 * Provides factory functions for creating and configuring editor instances
 */

import * as monaco from 'monaco-editor';
import { eventBus } from '../utils/event-bus';

export interface EditorOptions {
  /** Container element for the editor */
  container: HTMLElement;
  /** Initial content */
  value?: string;
  /** Theme (default: 'beatbax-dark') */
  theme?: 'vs-dark' | 'vs-light' | 'beatbax-dark';
  /** Language (default: 'beatbax') */
  language?: string;
  /** Read-only mode */
  readOnly?: boolean;
  /** Enable minimap */
  minimap?: boolean;
  /** Font size */
  fontSize?: number;
  /** Tab size */
  tabSize?: number;
  /** Auto-save delay in ms (0 to disable) */
  autoSaveDelay?: number;
}

export interface BeatBaxEditor {
  /** Monaco editor instance */
  editor: monaco.editor.IStandaloneCodeEditor;
  /** Get current content */
  getValue: () => string;
  /** Set content */
  setValue: (value: string) => void;
  /** Get selection */
  getSelection: () => string | null;
  /** Insert text at cursor */
  insertText: (text: string) => void;
  /** Focus the editor */
  focus: () => void;
  /** Dispose the editor */
  dispose: () => void;
  /** Update theme */
  updateTheme: (theme: 'vs-dark' | 'vs-light' | 'beatbax-dark') => void;
  /** Get cursor position */
  getCursorPosition: () => { line: number; column: number };
  /** Set cursor position */
  setCursorPosition: (line: number, column: number) => void;
}

/**
 * Create a Monaco editor instance configured for BeatBax
 */
export function createEditor(options: EditorOptions): BeatBaxEditor {
  const {
    container,
    value = '',
    theme = 'vs-dark',
    language = 'beatbax',
    readOnly = false,
    minimap = true,
    fontSize = 14,
    tabSize = 2,
    autoSaveDelay = 0,
  } = options;

  // Create editor instance
  const editor = monaco.editor.create(container, {
    value,
    language,
    theme,
    readOnly,
    fontSize,
    tabSize,
    automaticLayout: true, // Auto-resize with container
    minimap: { enabled: minimap },
    scrollBeyondLastLine: false,
    renderWhitespace: 'selection',
    lineNumbers: 'on',
    glyphMargin: true,
    folding: true,
    bracketPairColorization: { enabled: true },
    suggest: {
      showKeywords: true,
      showSnippets: true,
    },
    quickSuggestions: {
      other: true,
      comments: false,
      strings: false,
    },
  });

  // Auto-save support
  let autoSaveTimeout: number | null = null;
  if (autoSaveDelay > 0) {
    editor.onDidChangeModelContent(() => {
      if (autoSaveTimeout !== null) {
        clearTimeout(autoSaveTimeout);
      }
      autoSaveTimeout = window.setTimeout(() => {
        eventBus.emit('editor:changed', { content: editor.getValue() });
      }, autoSaveDelay);
    });
  }

  // Emit change events immediately (without debounce)
  editor.onDidChangeModelContent(() => {
    eventBus.emit('editor:changed', { content: editor.getValue() });
  });

  // Handle window resize
  const resizeObserver = new ResizeObserver(() => {
    editor.layout();
  });
  resizeObserver.observe(container);

  // Return wrapped editor API
  const beatbaxEditor: BeatBaxEditor = {
    editor,

    getValue: () => editor.getValue(),

    setValue: (newValue: string) => {
      editor.setValue(newValue);
    },

    getSelection: () => {
      const selection = editor.getSelection();
      if (!selection) return null;
      const model = editor.getModel();
      if (!model) return null;
      return model.getValueInRange(selection);
    },

    insertText: (text: string) => {
      const selection = editor.getSelection();
      if (!selection) return;
      editor.executeEdits('', [
        {
          range: selection,
          text,
        },
      ]);
      editor.focus();
    },

    focus: () => {
      editor.focus();
    },

    dispose: () => {
      resizeObserver.disconnect();
      editor.dispose();
    },

    updateTheme: (newTheme: 'vs-dark' | 'vs-light' | 'beatbax-dark') => {
      monaco.editor.setTheme(newTheme);
    },

    getCursorPosition: () => {
      const position = editor.getPosition();
      return position
        ? { line: position.lineNumber, column: position.column }
        : { line: 1, column: 1 };
    },

    setCursorPosition: (line: number, column: number) => {
      editor.setPosition({ lineNumber: line, column });
      editor.revealPositionInCenter({ lineNumber: line, column });
    },
  };

  return beatbaxEditor;
}

/**
 * Configure Monaco editor global settings
 */
export function configureMonaco(): void {
  // Configure Monaco web workers using blob URLs to avoid CORS issues
  (window as any).MonacoEnvironment = {
    getWorker: function (_workerId: string, label: string) {
      // Create workers using blob URLs from local Monaco installation
      const getWorkerModule = (moduleUrl: string, label: string) => {
        // Use window.location as fallback for test environments
        const baseUrl = typeof window !== 'undefined' && window.location
          ? window.location.origin + '/'
          : '/';
        return new Worker(
          URL.createObjectURL(
            new Blob(
              [
                `
                self.MonacoEnvironment = { baseUrl: '${baseUrl}' };
                importScripts('${moduleUrl}');
              `,
              ],
              { type: 'text/javascript' }
            )
          ),
          { name: label }
        );
      };

      // For now, use a simple approach: return a basic worker
      // Monaco will fall back to running in the main thread if workers fail
      return new Worker(
        URL.createObjectURL(
          new Blob(['self.onmessage = () => {};'], { type: 'text/javascript' })
        ),
        { name: label }
      );
    },
  };

  // Configure Monaco options globally if needed
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
  });

  // Additional global configuration can go here
}
