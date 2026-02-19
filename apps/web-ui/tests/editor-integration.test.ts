/**
 * Integration tests for editor initialization and component interaction
 * Tests the full flow: Monaco + BeatBax language + Diagnostics + EventBus + Layout
 */

import { EventBus } from '../src/utils/event-bus';
import { createEditor, registerBeatBaxLanguage, configureMonaco } from '../src/editor';
import { createDiagnosticsManager, setupDiagnosticsIntegration } from '../src/editor/diagnostics';
import { createLayout } from '../src/ui/layout';
import * as monaco from 'monaco-editor';
import { createLogger } from '@beatbax/engine/util/logger';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('Editor Integration', () => {
  let container: HTMLElement;
  let eventBus: EventBus;

  beforeEach(() => {
    // Mock ResizeObserver
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any;

    // Create DOM container
    container = document.createElement('div');
    container.id = 'test-container';
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);

    // Fresh EventBus for each test
    eventBus = new EventBus();

    // Clear localStorage
    localStorageMock.clear();

    // Clear Monaco mocks and logger mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Cleanup
    document.body.removeChild(container);
    eventBus.clear();
  });

  describe('Full Initialization Flow', () => {
    it('should initialize Monaco editor with BeatBax language', () => {
      // Configure Monaco globally
      configureMonaco();
      registerBeatBaxLanguage();

      // Verify Monaco configuration was called
      expect(monaco.languages.register).toHaveBeenCalledWith({
        id: 'beatbax',
      });

      expect(monaco.languages.setMonarchTokensProvider).toHaveBeenCalledWith(
        'beatbax',
        expect.objectContaining({
          tokenizer: expect.any(Object),
        })
      );

      // Verify hover provider was registered
      expect(monaco.languages.registerHoverProvider).toHaveBeenCalledWith(
        'beatbax',
        expect.objectContaining({
          provideHover: expect.any(Function),
        })
      );

      // Verify completion provider was registered
      expect(monaco.languages.registerCompletionItemProvider).toHaveBeenCalledWith(
        'beatbax',
        expect.objectContaining({
          provideCompletionItems: expect.any(Function),
        })
      );
    });

    it('should create editor instance with correct configuration', () => {
      const mockEditor = {
        getValue: jest.fn(() => ''),
        setValue: jest.fn(),
        onDidChangeModelContent: jest.fn(),
        getModel: jest.fn(() => null),
        layout: jest.fn(),
      };

      (monaco.editor.create as jest.Mock).mockReturnValue(mockEditor);

      const editorPane = document.createElement('div');
      const editor = createEditor({
        container: editorPane,
        value: 'chip gameboy\nbpm 120',
        theme: 'beatbax-dark',
        language: 'beatbax',
        autoSaveDelay: 500,
      });

      // Verify editor.create was called
      expect(monaco.editor.create).toHaveBeenCalledWith(
        editorPane,
        expect.objectContaining({
          value: 'chip gameboy\nbpm 120',
          language: 'beatbax',
          theme: 'beatbax-dark',
        })
      );

      // Verify editor exposes expected API
      expect(editor).toHaveProperty('editor');
      expect(editor).toHaveProperty('getValue');
      expect(editor).toHaveProperty('setValue');
    });

    it('should integrate diagnostics with EventBus', () => {
      const mockEditor = {
        getValue: jest.fn(() => ''),
        setValue: jest.fn(),
        onDidChangeModelContent: jest.fn(),
        getModel: jest.fn(() => ({
          uri: { toString: () => 'file://test.bax' },
        })),
        layout: jest.fn(),
      };

      const diagnosticsManager = createDiagnosticsManager(mockEditor as any);
      setupDiagnosticsIntegration(diagnosticsManager);

      // Verify diagnostics manager has expected methods
      expect(diagnosticsManager).toHaveProperty('setDiagnostics');
      expect(diagnosticsManager).toHaveProperty('clear');
      expect(diagnosticsManager).toHaveProperty('getCounts');

      // Test setting diagnostics
      diagnosticsManager.setDiagnostics([
        {
          severity: 'error',
          message: 'Test error',
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 10,
        },
      ]);

      expect(monaco.editor.setModelMarkers).toHaveBeenCalled();
    });

    it('should create split pane layout with persistence', () => {
      const layout = createLayout({
        container,
        editorSize: 70,
        outputSize: 30,
        persist: true,
        storageKey: 'test-layout',
      });

      // Verify layout created panes
      expect(layout.getEditorPane()).toBeInstanceOf(HTMLElement);
      expect(layout.getOutputPane()).toBeInstanceOf(HTMLElement);

      // Verify methods exist
      expect(layout).toHaveProperty('saveSizes');
      expect(layout).toHaveProperty('loadSizes');
      expect(layout).toHaveProperty('reset');

      // Test persistence
      layout.saveSizes();
      const savedData = localStorageMock.getItem('test-layout');
      expect(savedData).toBeTruthy();

      const parsed = JSON.parse(savedData!);
      expect(parsed).toHaveProperty('editor');
      expect(parsed).toHaveProperty('output');
    });

    it.skip('should coordinate editor changes through EventBus', (done) => {
      const mockEditor = {
        getValue: jest.fn(() => 'chip gameboy'),
        setValue: jest.fn(),
        onDidChangeModelContent: jest.fn((callback) => {
          // Simulate content change
          setTimeout(() => callback(), 10);
          return { dispose: jest.fn() };
        }),
        getModel: jest.fn(() => null),
        layout: jest.fn(),
      };

      (monaco.editor.create as jest.Mock).mockReturnValue(mockEditor);

      const editorPane = document.createElement('div');
      const editor = createEditor({
        container: editorPane,
        value: 'chip gameboy',
        language: 'beatbax',
        autoSaveDelay: 100,
      });

      // Listen for editor change events
      const changeHandler = jest.fn((data) => {
        expect(data.content).toBe('chip gameboy');
        done();
      });

      eventBus.on('editor:changed', changeHandler);

      // Trigger change (mocked by onDidChangeModelContent)
    });
  });

  describe('Validation Flow Integration', () => {
    it('should emit parse errors through EventBus', () => {
      const parseErrorHandler = jest.fn();
      eventBus.on('parse:error', parseErrorHandler);

      // Simulate parse error
      const error = new Error('Unexpected token');
      eventBus.emit('parse:error', {
        error,
        message: error.message
      });

      expect(parseErrorHandler).toHaveBeenCalledWith({
        error,
        message: 'Unexpected token',
      });
    });

    it('should emit validation warnings through EventBus', () => {
      const warningHandler = jest.fn();
      eventBus.on('validation:warnings', warningHandler);

      const warnings = [
        { component: 'resolver', message: 'Undefined instrument: snare', loc: { line: 5 } },
        { component: 'resolver', message: 'Undefined pattern: melody', loc: { line: 10 } },
      ];

      eventBus.emit('validation:warnings', { warnings });

      expect(warningHandler).toHaveBeenCalledWith({ warnings });
    });

    it('should clear diagnostics when content is valid', () => {
      const mockEditor = {
        getValue: jest.fn(() => ''),
        setValue: jest.fn(),
        onDidChangeModelContent: jest.fn(),
        getModel: jest.fn(() => ({
          uri: { toString: () => 'file://test.bax' },
        })),
        layout: jest.fn(),
      };

      const diagnosticsManager = createDiagnosticsManager(mockEditor as any);

      // Set some diagnostics
      diagnosticsManager.setDiagnostics([
        {
          severity: 'error',
          message: 'Test error',
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 10,
        },
      ]);

      // Clear diagnostics
      diagnosticsManager.clear();

      // Verify setModelMarkers was called with empty array
      expect(monaco.editor.setModelMarkers).toHaveBeenLastCalledWith(
        expect.anything(),
        'beatbax',
        []
      );
    });
  });

  describe('Component Interaction', () => {
    it.skip('should coordinate layout, editor, and diagnostics', () => {
      // Create layout
      const layout = createLayout({
        container,
        editorSize: 70,
        outputSize: 30,
      });

      const editorPane = layout.getEditorPane();
      const outputPane = layout.getOutputPane();

      expect(editorPane).toBeInstanceOf(HTMLElement);
      expect(outputPane).toBeInstanceOf(HTMLElement);

      // Create editor in editor pane
      const mockEditor = {
        getValue: jest.fn(() => 'chip gameboy\nbpm 120'),
        setValue: jest.fn(),
        onDidChangeModelContent: jest.fn(),
        getModel: jest.fn(() => ({
          uri: { toString: () => 'file://test.bax' },
        })),
        layout: jest.fn(),
        focus: jest.fn(),
      };

      (monaco.editor.create as jest.Mock).mockReturnValue(mockEditor);

      const editor = createEditor({
        container: editorPane,
        value: 'chip gameboy\nbpm 120',
        language: 'beatbax',
      });

      // Create diagnostics for editor
      const diagnosticsManager = createDiagnosticsManager(mockEditor as any);

      // Verify all components are connected
      expect(editor.getValue()).toBe('chip gameboy\nbpm 120');
      expect(mockEditor.layout).toHaveBeenCalled();
      expect(diagnosticsManager).toBeDefined();
    });

    it('should persist and restore layout sizes', () => {
      // Create layout with persistence
      const layout1 = createLayout({
        container,
        editorSize: 60,
        outputSize: 40,
        persist: true,
        storageKey: 'test-persist',
      });

      layout1.saveSizes();

      // Create new layout that should load saved sizes
      const layout2 = createLayout({
        container,
        editorSize: 50, // Different default
        outputSize: 50,
        persist: true,
        storageKey: 'test-persist',
      });

      layout2.loadSizes();

      // Verify sizes were persisted
      const savedData = localStorageMock.getItem('test-persist');
      expect(savedData).toBeTruthy();

      const parsed = JSON.parse(savedData!);
      expect(parsed.editor).toBe(60);
      expect(parsed.output).toBe(40);
    });
  });

  describe('Error Handling', () => {
    it('should handle Monaco editor creation failure gracefully', () => {
      (monaco.editor.create as jest.Mock).mockImplementation(() => {
        throw new Error('Monaco initialization failed');
      });

      const editorPane = document.createElement('div');

      expect(() => {
        createEditor({
          container: editorPane,
          value: '',
          language: 'beatbax',
        });
      }).toThrow('Monaco initialization failed');
    });

    it('should handle localStorage unavailability gracefully', () => {
      // Mock localStorage.setItem to throw
      const originalSetItem = localStorageMock.setItem;
      localStorageMock.setItem = jest.fn(() => {
        throw new Error('QuotaExceededError');
      });

      const layout = createLayout({
        container,
        editorSize: 70,
        outputSize: 30,
        persist: true,
      });

      // Should not throw - just log warning
      expect(() => {
        layout.saveSizes();
      }).not.toThrow();

      // Verify warning was called on the logger
      const log = createLogger('ui:layout');
      expect(log.warn).toHaveBeenCalledWith(
        'Failed to save layout sizes to localStorage:',
        expect.any(Error)
      );

      // Restore
      localStorageMock.setItem = originalSetItem;
    });
  });
});
