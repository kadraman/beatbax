/// <reference path="./test-types.d.ts" />

import { registerDesktopShortcuts } from '../src/renderer/src/lib/register-shortcuts';
import { KeyboardShortcuts, shortcutId } from '../src/renderer/src/utils/keyboard-shortcuts';
import { SHORTCUT_CATALOG } from '@beatbax/app-core/shortcuts';
import { resolveProfileBinding } from '@beatbax/app-core/shortcuts';

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

  it('falls back to physical key code when modifier layouts change event.key', () => {
    const shortcuts = new KeyboardShortcuts();
    const action = jest.fn();

    shortcuts.register({
      key: 'i',
      altKey: true,
      shiftKey: true,
      description: 'Toggle AI Copilot',
      allowInInput: true,
      action,
    });
    shortcuts.mount(window);

    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Í',
      code: 'KeyI',
      altKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }));

    expect(action).toHaveBeenCalledTimes(1);
    shortcuts.dispose();
  });

  it('allows alt shortcuts when layouts report an extra ctrl modifier', () => {
    const shortcuts = new KeyboardShortcuts();
    const action = jest.fn();

    shortcuts.register({
      key: 'i',
      altKey: true,
      shiftKey: true,
      description: 'Toggle AI Copilot',
      allowInInput: true,
      action,
    });
    shortcuts.mount(window);

    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'I',
      code: 'KeyI',
      ctrlKey: true,
      altKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }));

    expect(action).toHaveBeenCalledTimes(1);
    shortcuts.dispose();
  });

  it('defines desktop catalog bindings for shortcuts listed in Help', () => {
    const ids = SHORTCUT_CATALOG
      .filter((entry) => entry.profiles.includes('desktop-full'))
      .flatMap((entry) => {
        const binding = resolveProfileBinding(entry.binding, 'desktop-full');
        const keys = [shortcutId({
          key: binding.key,
          ctrlKey: binding.ctrl,
          altKey: binding.alt,
          shiftKey: binding.shift,
        })];
        if (entry.alternateBinding) {
          const alt = resolveProfileBinding(entry.alternateBinding, 'desktop-full');
          keys.push(shortcutId({
            key: alt.key,
            ctrlKey: alt.ctrl,
            altKey: alt.alt,
            shiftKey: alt.shift,
          }));
        }
        return keys;
      });

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
      'ctrl+shift+b',
      'ctrl+shift+r',
      'ctrl+shift+g',
    ]));
  });

  it('registers desktop catalog shortcuts with handlers', () => {
    const shortcuts = new KeyboardShortcuts();
    const openShortcuts = jest.fn();
    const verifySyntax = jest.fn();
    const emit = jest.fn();

    registerDesktopShortcuts({
      ks: shortcuts,
      eventBus: { emit } as any,
      getEditor: () => null,
      transportBar: {
        playButton: { click: jest.fn() },
        stopButton: { click: jest.fn() },
        applyButton: { click: jest.fn() },
        isVisible: () => true,
      } as any,
      toolbar: { isVisible: () => true } as any,
      bottomTabs: { show: jest.fn() } as any,
      rightTabs: { show: jest.fn(), tabOpen: { ai: false }, activeTab: 'channels' } as any,
      settingsModal: { open: jest.fn() } as any,
      shortcutsModal: { open: openShortcuts } as any,
      onVerify: verifySyntax,
      onNew: jest.fn(),
      onOpen: jest.fn(),
      onSave: jest.fn(),
      themeManager: { toggle: jest.fn() } as any,
      channelMixer: null,
      copilot: null,
    });

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
      'ctrl+shift+b',
      'ctrl+shift+r',
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

    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'B',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }));
    expect(emit).toHaveBeenCalledWith('panel:toggled', { panel: 'toolbar', visible: false });
    shortcuts.dispose();
  });
});
