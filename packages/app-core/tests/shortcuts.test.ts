import {
  bindingMatchesEvent,
  electronAcceleratorForCommand,
  formatCommandShortcut,
  formatShortcut,
  getShortcutBinding,
  shortcutId,
  toElectronAccelerator,
} from '../src/shortcuts';

describe('shortcuts format', () => {
  it('shows Cmd on macOS and Ctrl elsewhere', () => {
    const binding = { key: 's', ctrl: true };
    expect(formatShortcut(binding, 'darwin')).toBe('Cmd+S');
    expect(formatShortcut(binding, 'win32')).toBe('Ctrl+S');
    expect(formatShortcut(binding, 'linux')).toBe('Ctrl+S');
  });

  it('builds Electron accelerators with CmdOrCtrl', () => {
    expect(toElectronAccelerator({ key: 'p', ctrl: true, shift: true })).toBe('CmdOrCtrl+Shift+P');
    expect(toElectronAccelerator({ key: 'p', alt: true, shift: true })).toBe('Alt+Shift+P');
  });

  it('formats profile-specific toolbar shortcuts', () => {
    expect(formatCommandShortcut('view.toggleToolbar', 'web-lite', 'win32')).toBe('Alt+Shift+B');
    expect(formatCommandShortcut('view.toggleToolbar', 'desktop-full', 'win32')).toBe('Ctrl+Shift+B');
    expect(formatCommandShortcut('view.toggleToolbar', 'desktop-full', 'darwin')).toBe('Cmd+Shift+B');
  });

  it('builds desktop electron accelerators from the catalog', () => {
    expect(electronAcceleratorForCommand('view.toggleTransportBar', 'desktop-full')).toBe('CmdOrCtrl+Shift+R');
    expect(electronAcceleratorForCommand('view.togglePatternGrid', 'desktop-full')).toBe('CmdOrCtrl+Shift+G');
  });
});

describe('shortcuts match', () => {
  it('treats metaKey as ctrl for matching', () => {
    const binding = { key: 's', ctrl: true };
    const event = {
      key: 's',
      code: 'KeyS',
      ctrlKey: false,
      metaKey: true,
      shiftKey: false,
      altKey: false,
    } as KeyboardEvent;
    expect(bindingMatchesEvent(binding, event)).toBe(true);
    expect(shortcutId(binding)).toBe('ctrl+s');
  });

  it('allows alt shortcuts when layouts report an extra ctrl modifier', () => {
    const binding = { key: 'i', alt: true, shift: true };
    const event = {
      key: 'i',
      code: 'KeyI',
      ctrlKey: true,
      metaKey: false,
      shiftKey: true,
      altKey: true,
    } as KeyboardEvent;
    expect(bindingMatchesEvent(binding, event)).toBe(true);
  });

  it('resolves profile-specific bindings', () => {
    expect(getShortcutBinding('tools.openCommandPalette', 'web-lite')).toEqual({
      key: 'p',
      ctrl: true,
      alt: true,
    });
    expect(getShortcutBinding('tools.openCommandPalette', 'desktop-full')).toEqual({
      key: 'p',
      ctrl: true,
      shift: true,
    });
  });
});
