/**
 * Tests for KeyboardShortcuts utility
 */

import { KeyboardShortcuts, shortcutId } from '../src/utils/keyboard-shortcuts';

// ─── helpers ─────────────────────────────────────────────────────────────────

function keydown(
  key: string,
  mods: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; metaKey?: boolean } = {},
  target?: EventTarget
): KeyboardEvent {
  const e = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ctrlKey: mods.ctrlKey,
    shiftKey: mods.shiftKey,
    altKey: mods.altKey,
    metaKey: mods.metaKey,
  });
  (target ?? window).dispatchEvent(e);
  return e;
}

// ─── shortcutId ──────────────────────────────────────────────────────────────

describe('shortcutId', () => {
  it('produces a stable id for a plain key', () => {
    expect(shortcutId({ key: 'p' })).toBe('p');
  });

  it('lowercases the key', () => {
    expect(shortcutId({ key: 'S', ctrlKey: true })).toBe('ctrl+s');
  });

  it('encodes modifier order as ctrl+alt+shift+key', () => {
    expect(shortcutId({ key: 'z', ctrlKey: true, shiftKey: true, altKey: true })).toBe('ctrl+alt+shift+z');
  });

  it('maps space to "space"', () => {
    expect(shortcutId({ key: ' ' })).toBe('space');
  });
});

// ─── register / unregister ───────────────────────────────────────────────────

describe('KeyboardShortcuts — register / unregister', () => {
  let ks: KeyboardShortcuts;

  beforeEach(() => { ks = new KeyboardShortcuts(); ks.mount(); });
  afterEach(() => { ks.dispose(); });

  it('fires the registered action on matching keydown', () => {
    const action = jest.fn();
    ks.register({ key: 'p', ctrlKey: true, description: 'Play', action });
    keydown('p', { ctrlKey: true });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('does not fire for a different key', () => {
    const action = jest.fn();
    ks.register({ key: 'p', ctrlKey: true, description: 'Play', action });
    keydown('q', { ctrlKey: true });
    expect(action).not.toHaveBeenCalled();
  });

  it('does not fire when modifier does not match', () => {
    const action = jest.fn();
    ks.register({ key: 's', ctrlKey: true, description: 'Save', action });
    keydown('s'); // no Ctrl
    expect(action).not.toHaveBeenCalled();
  });

  it('prevents default when shortcut matches', () => {
    const action = jest.fn();
    ks.register({ key: 's', ctrlKey: true, description: 'Save', action });
    const e = keydown('s', { ctrlKey: true });
    expect(e.defaultPrevented).toBe(true);
  });

  it('unregister stops the action from firing', () => {
    const action = jest.fn();
    ks.register({ key: 'r', ctrlKey: true, description: 'Run', action });
    ks.unregister({ key: 'r', ctrlKey: true });
    keydown('r', { ctrlKey: true });
    expect(action).not.toHaveBeenCalled();
  });

  it('re-registers (overwrites) an existing shortcut', () => {
    const old = jest.fn();
    const fresh = jest.fn();
    ks.register({ key: 'k', description: 'Old', action: old });
    ks.register({ key: 'k', description: 'New', action: fresh });
    keydown('k');
    expect(old).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it('list() returns all registered shortcuts', () => {
    ks.register({ key: 'a', description: 'A', action: jest.fn() });
    ks.register({ key: 'b', description: 'B', action: jest.fn() });
    expect(ks.list().map(s => s.description)).toEqual(expect.arrayContaining(['A', 'B']));
  });

  it('clear() removes all shortcuts', () => {
    const action = jest.fn();
    ks.register({ key: 'x', description: 'X', action });
    ks.clear();
    keydown('x');
    expect(action).not.toHaveBeenCalled();
    expect(ks.list()).toHaveLength(0);
  });
});

// ─── input suppression ───────────────────────────────────────────────────────

describe('KeyboardShortcuts — input suppression', () => {
  let ks: KeyboardShortcuts;

  beforeEach(() => { ks = new KeyboardShortcuts(); ks.mount(); });
  afterEach(() => { ks.dispose(); });

  it('does not fire when focus is inside an <input> by default', () => {
    const action = jest.fn();
    ks.register({ key: 's', ctrlKey: true, description: 'Save', action });

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    // Dispatch directly on the focused input so target is set correctly
    const e = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });
    Object.defineProperty(e, 'target', { value: input, configurable: true });
    window.dispatchEvent(e);

    document.body.removeChild(input);
    expect(action).not.toHaveBeenCalled();
  });

  it('fires inside an <input> when allowInInput is true', () => {
    const action = jest.fn();
    ks.register({ key: 'Enter', description: 'Submit', action, allowInInput: true });

    const input = document.createElement('input');
    document.body.appendChild(input);

    const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(e, 'target', { value: input, configurable: true });
    window.dispatchEvent(e);

    document.body.removeChild(input);
    expect(action).toHaveBeenCalledTimes(1);
  });
});

// ─── metaKey (macOS Cmd) treated as ctrlKey ──────────────────────────────────

describe('KeyboardShortcuts — metaKey as Ctrl', () => {
  let ks: KeyboardShortcuts;

  beforeEach(() => { ks = new KeyboardShortcuts(); ks.mount(); });
  afterEach(() => { ks.dispose(); });

  it('fires a ctrlKey shortcut when metaKey is pressed', () => {
    const action = jest.fn();
    ks.register({ key: 's', ctrlKey: true, description: 'Save', action });
    keydown('s', { metaKey: true });
    expect(action).toHaveBeenCalledTimes(1);
  });
});

// ─── dispose ─────────────────────────────────────────────────────────────────

describe('KeyboardShortcuts — dispose', () => {
  it('stops firing after dispose()', () => {
    const ks = new KeyboardShortcuts();
    const action = jest.fn();
    ks.register({ key: 'p', description: 'Play', action });
    ks.mount();
    ks.dispose();
    keydown('p');
    expect(action).not.toHaveBeenCalled();
  });

  it('dispose() is idempotent', () => {
    const ks = new KeyboardShortcuts();
    ks.mount();
    expect(() => { ks.dispose(); ks.dispose(); }).not.toThrow();
  });
});
