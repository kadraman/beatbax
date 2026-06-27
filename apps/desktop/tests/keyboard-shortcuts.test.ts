/// <reference path="./test-types.d.ts" />

import {
  DESKTOP_SHORTCUT_DESCRIPTORS,
  registerDesktopShortcutDescriptors,
  type DesktopShortcutHandlers,
} from '../src/renderer/src/lib/desktop-shortcut-descriptors';
import { KeyboardShortcuts, shortcutId } from '../src/renderer/src/utils/keyboard-shortcuts';

describe('desktop keyboard shortcuts', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('handles allow-in-input shortcuts before an editor can stop propagation', () => {
    const shortcuts = new KeyboardShortcuts();
    const action = jest.fn();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    input.addEventListener('keydown', (event) => event.stopPropagation());

    shortcuts.register({
      key: 'k',
      altKey: true,
      shiftKey: true,
      description: 'Show Keyboard Shortcuts',
      allowInInput: true,
      action,
    });
    shortcuts.mount(window);

    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'K',
      altKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }));

    expect(action).toHaveBeenCalledTimes(1);
    shortcuts.dispose();
  });

  it('does not run non-input shortcuts from editable surfaces', () => {
    const shortcuts = new KeyboardShortcuts();
    const action = jest.fn();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    shortcuts.register({
      key: 'F5',
      description: 'Play / re-play',
      action,
    });
    shortcuts.mount(window);

    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'F5',
      bubbles: true,
      cancelable: true,
    }));

    expect(action).not.toHaveBeenCalled();
    shortcuts.dispose();
  });

  it('defines descriptors for the shortcuts listed in the desktop Help panel', () => {
    const ids = new Set(DESKTOP_SHORTCUT_DESCRIPTORS.map((descriptor) => shortcutId(descriptor)));

    expect(Array.from(ids)).toEqual(expect.arrayContaining([
      'f5',
      'f8',
      'ctrl+enter',
      'ctrl+s',
      'ctrl+o',
      'alt+shift+k',
      'shift+f1',
      'alt+v',
      'ctrl+shift+p',
    ]));
  });

  it('registers the shortcuts listed in the desktop Help panel with handlers', () => {
    const shortcuts = new KeyboardShortcuts();
    const openShortcuts = jest.fn();
    const verifySyntax = jest.fn();
    const handlers: DesktopShortcutHandlers = {
      'transport.play': jest.fn(),
      'transport.stop': jest.fn(),
      'transport.apply': jest.fn(),
      'file.save': jest.fn(),
      'file.open': jest.fn(),
      'help.showShortcuts': openShortcuts,
      'help.showHelp': jest.fn(),
      'tools.verifySyntax': verifySyntax,
      'tools.openCommandPalette': jest.fn(),
    };

    registerDesktopShortcutDescriptors(shortcuts, handlers);

    const ids = shortcuts.list().map((descriptor) => shortcutId(descriptor));
    expect(ids).toEqual(expect.arrayContaining([
      'f5',
      'f8',
      'ctrl+enter',
      'ctrl+s',
      'ctrl+o',
      'alt+shift+k',
      'shift+f1',
      'alt+v',
      'ctrl+shift+p',
    ]));

    shortcuts.mount(window);
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'K',
      altKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }));

    expect(openShortcuts).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'V',
      altKey: true,
      bubbles: true,
      cancelable: true,
    }));

    expect(verifySyntax).toHaveBeenCalledTimes(1);
    shortcuts.dispose();
  });
});
