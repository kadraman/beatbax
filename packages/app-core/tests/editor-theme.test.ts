/**
 * Theme chrome: color-scheme tracks the active theme, and Monaco is created
 * on that theme then re-applied so a remount cannot leave the previous mode.
 */

import * as monaco from 'monaco-editor';
import { createEditor, currentBeatBaxEditorTheme } from '../src/editor/monaco-setup';
import { activeTheme } from '../src/stores/theme.store';

function stubEditor() {
  return {
    getValue: jest.fn(() => ''),
    setValue: jest.fn(),
    onDidChangeModelContent: jest.fn(),
    getModel: jest.fn(() => null),
    layout: jest.fn(),
    getSupportedActions: jest.fn(() => []),
    dispose: jest.fn(),
  };
}

describe('editor theme chrome', () => {
  const original = activeTheme.get();

  beforeEach(() => {
    global.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
    (monaco.editor.create as jest.Mock).mockReset();
    (monaco.editor.setTheme as jest.Mock).mockReset();
    (monaco.editor.create as jest.Mock).mockReturnValue(stubEditor());
  });

  afterEach(() => {
    activeTheme.set(original);
  });

  it('sets document color-scheme with the active theme', () => {
    activeTheme.set('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');

    activeTheme.set('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('creates Monaco on the active theme and re-applies it', () => {
    activeTheme.set('light');
    const container = document.createElement('div');

    createEditor({ container, value: 'chip gameboy' });

    expect(currentBeatBaxEditorTheme()).toBe('beatbax-light');
    expect(monaco.editor.create).toHaveBeenCalledWith(
      container,
      expect.objectContaining({ theme: 'beatbax-light' }),
    );
    expect(monaco.editor.setTheme).toHaveBeenCalledWith('beatbax-light');
  });

  it('follows a theme change on the next editor create', () => {
    activeTheme.set('dark');
    const container = document.createElement('div');

    createEditor({ container, value: '' });

    expect(monaco.editor.setTheme).toHaveBeenLastCalledWith('beatbax-dark');
  });
});
