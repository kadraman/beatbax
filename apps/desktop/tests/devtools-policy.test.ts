/** @jest-environment node */

import { EventEmitter } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync, promises as fsPromises, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { BrowserWindow } from 'electron';
import {
  createDevToolsPolicy,
  decideShortcut,
  readDevToolsSetting,
  resolveDevToolsState,
  writeDevToolsSetting,
} from '../src/main/devtools-policy';

type KeyInput = Parameters<typeof decideShortcut>[0];

function key(code: string, modifiers: Partial<KeyInput> = {}): KeyInput {
  return { type: 'keyDown', code, control: false, meta: false, alt: false, shift: false, ...modifiers };
}

class FakeWebContents extends EventEmitter {
  opened = false;
  isDevToolsOpened = jest.fn(() => this.opened);
  closeDevTools = jest.fn(() => { this.opened = false; });
  toggleDevTools = jest.fn(() => { this.opened = !this.opened; });
}

class FakeWindow extends EventEmitter {
  webContents = new FakeWebContents();
  isDestroyed = (): boolean => false;
}

function fakeWindow(): FakeWindow & BrowserWindow {
  return new FakeWindow() as unknown as FakeWindow & BrowserWindow;
}

function pressKey(window: FakeWindow, input: KeyInput): { prevented: boolean } {
  const event = { prevented: false, preventDefault() { this.prevented = true; } };
  window.webContents.emit('before-input-event', event, input);
  return event;
}

describe('devtools settings file', () => {
  let dir: string;
  let settingsPath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'beatbax-devtools-'));
    settingsPath = path.join(dir, 'desktop-diagnostics.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips the saved value', async () => {
    await writeDevToolsSetting(settingsPath, true);
    expect(JSON.parse(readFileSync(settingsPath, 'utf8'))).toEqual({ version: 1, devToolsEnabled: true });
    expect(await readDevToolsSetting(settingsPath)).toBe(true);
    await writeDevToolsSetting(settingsPath, false);
    expect(await readDevToolsSetting(settingsPath)).toBe(false);
  });

  it('treats missing, corrupt, and wrong-version files as off', async () => {
    expect(await readDevToolsSetting(settingsPath)).toBe(false);
    writeFileSync(settingsPath, '{not json');
    expect(await readDevToolsSetting(settingsPath)).toBe(false);
    writeFileSync(settingsPath, JSON.stringify({ version: 2, devToolsEnabled: true }));
    expect(await readDevToolsSetting(settingsPath)).toBe(false);
    writeFileSync(settingsPath, JSON.stringify({ version: 1, devToolsEnabled: 'yes' }));
    expect(await readDevToolsSetting(settingsPath)).toBe(false);
  });
});

describe('resolveDevToolsState', () => {
  it('applies precedence development > launch flag > setting > off', () => {
    expect(resolveDevToolsState({ development: true, launchFlag: true, saved: true }))
      .toEqual({ allowed: true, source: 'development', saved: true });
    expect(resolveDevToolsState({ development: false, launchFlag: true, saved: false }))
      .toEqual({ allowed: true, source: 'launch-flag', saved: false });
    expect(resolveDevToolsState({ development: false, launchFlag: false, saved: true }))
      .toEqual({ allowed: true, source: 'setting', saved: true });
    expect(resolveDevToolsState({ development: false, launchFlag: false, saved: false }))
      .toEqual({ allowed: false, source: 'off', saved: false });
  });
});

describe('decideShortcut', () => {
  const packaged = (platform: NodeJS.Platform, allowed: boolean): Parameters<typeof decideShortcut>[1] =>
    ({ platform, allowed, development: false });

  it.each([
    ['win32', key('KeyI', { control: true, shift: true })],
    ['linux', key('KeyI', { control: true, shift: true })],
    ['darwin', key('KeyI', { meta: true, alt: true })],
  ] as const)('toggles on %s with its platform shortcut only when allowed', (platform, input) => {
    expect(decideShortcut(input, packaged(platform, true))).toBe('toggle-devtools');
    expect(decideShortcut(input, packaged(platform, false))).toBe('block');
  });

  it('blocks the other platform devtools combo in packaged builds', () => {
    expect(decideShortcut(key('KeyI', { meta: true, alt: true }), packaged('win32', true))).toBe('block');
    expect(decideShortcut(key('KeyI', { control: true, shift: true }), packaged('darwin', true))).toBe('block');
  });

  it('keeps blocking reload and zoom keys in packaged builds', () => {
    expect(decideShortcut(key('KeyR', { control: true }), packaged('win32', true))).toBe('block');
    expect(decideShortcut(key('KeyR', { meta: true }), packaged('darwin', false))).toBe('block');
    expect(decideShortcut(key('Minus', { control: true }), packaged('linux', false))).toBe('block');
    expect(decideShortcut(key('Equal', { control: true, shift: true }), packaged('linux', false))).toBe('block');
    expect(decideShortcut(key('Equal', { control: true }), packaged('linux', false))).toBe('pass');
  });

  it('passes ordinary keys and key-up events', () => {
    expect(decideShortcut(key('KeyI'), packaged('win32', false))).toBe('pass');
    expect(decideShortcut(key('KeyS', { control: true }), packaged('win32', false))).toBe('pass');
    expect(decideShortcut({ ...key('KeyI', { control: true, shift: true }), type: 'keyUp' }, packaged('win32', false)))
      .toBe('pass');
  });

  it('only handles the devtools shortcut in development builds', () => {
    const development = { platform: 'linux' as const, allowed: true, development: true };
    expect(decideShortcut(key('KeyI', { control: true, shift: true }), development)).toBe('toggle-devtools');
    expect(decideShortcut(key('KeyR', { control: true }), development)).toBe('pass');
    expect(decideShortcut(key('Minus', { control: true }), development)).toBe('pass');
  });
});

describe('createDevToolsPolicy', () => {
  let dir: string;
  let settingsPath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'beatbax-devtools-'));
    settingsPath = path.join(dir, 'desktop-diagnostics.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const packagedPolicy = (
    overrides: Partial<Parameters<typeof createDevToolsPolicy>[0]> = {},
  ): ReturnType<typeof createDevToolsPolicy> => createDevToolsPolicy({
    settingsPath,
    development: false,
    launchFlag: false,
    platform: 'win32',
    ...overrides,
  });

  it('is off by default in packaged builds and ignores toggle requests', async () => {
    const policy = packagedPolicy();
    expect(await policy.load()).toEqual({ allowed: false, source: 'off', saved: false });
    const window = fakeWindow();
    policy.toggle(window);
    expect(window.webContents.toggleDevTools).not.toHaveBeenCalled();
  });

  it('loads a saved setting', async () => {
    await writeDevToolsSetting(settingsPath, true);
    const policy = packagedPolicy();
    expect((await policy.load()).source).toBe('setting');
    expect(policy.isAllowed()).toBe(true);
  });

  it('allows the session with the launch flag without changing the saved setting', async () => {
    const policy = packagedPolicy({ launchFlag: true });
    expect(await policy.load()).toEqual({ allowed: true, source: 'launch-flag', saved: false });
    expect(await readDevToolsSetting(settingsPath)).toBe(false);
  });

  it('persists changes, broadcasts state, and closes open devtools when turned off', async () => {
    const onChange = jest.fn();
    const policy = packagedPolicy({ onChange });
    await policy.load();
    const window = fakeWindow();
    policy.attachToWindow(window);

    expect(await policy.setEnabled(true)).toEqual({ allowed: true, source: 'setting', saved: true });
    expect(await readDevToolsSetting(settingsPath)).toBe(true);
    policy.toggle(window);
    expect(window.webContents.opened).toBe(true);

    await policy.setEnabled(false);
    expect(window.webContents.closeDevTools).toHaveBeenCalled();
    expect(window.webContents.opened).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith({ allowed: false, source: 'off', saved: false });
  });

  it('serializes overlapping updates so writes and broadcasts finish in call order', async () => {
    const realWriteFile = fsPromises.writeFile.bind(fsPromises);
    let active = 0;
    let maxActive = 0;
    let calls = 0;
    const writeSpy = jest.spyOn(fsPromises, 'writeFile').mockImplementation(async (...args) => {
      const delay = calls++ === 0 ? 30 : 0;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, delay));
      await realWriteFile(...(args as Parameters<typeof realWriteFile>));
      active -= 1;
    });
    try {
      const onChange = jest.fn();
      const policy = packagedPolicy({ onChange });
      await policy.load();

      const results = await Promise.all([policy.setEnabled(true), policy.setEnabled(false)]);

      expect(maxActive).toBe(1);
      expect(results.map((state) => state.saved)).toEqual([true, false]);
      expect(onChange.mock.calls.map(([state]) => state.saved)).toEqual([true, false]);
      expect(policy.getState().saved).toBe(false);
      expect(await readDevToolsSetting(settingsPath)).toBe(false);
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('keeps processing updates after a failed write', async () => {
    const writeSpy = jest.spyOn(fsPromises, 'writeFile').mockRejectedValueOnce(new Error('disk full'));
    try {
      const onChange = jest.fn();
      const policy = packagedPolicy({ onChange });
      await policy.load();

      const failed = policy.setEnabled(true);
      const next = policy.setEnabled(true);
      await expect(failed).rejects.toThrow('disk full');
      await expect(next).resolves.toEqual({ allowed: true, source: 'setting', saved: true });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(await readDevToolsSetting(settingsPath)).toBe(true);
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('does not let a pending load overwrite a later update', async () => {
    const policy = packagedPolicy();
    const loading = policy.load();
    await policy.setEnabled(true);
    await loading;
    expect(policy.getState().saved).toBe(true);
  });

  it('rejects non-boolean values', async () => {
    const policy = packagedPolicy();
    await expect(policy.setEnabled('true' as unknown as boolean)).rejects.toThrow('true or false');
  });

  it('closes devtools opened by any other path while disallowed', async () => {
    const policy = packagedPolicy();
    await policy.load();
    const window = fakeWindow();
    policy.attachToWindow(window);
    window.webContents.opened = true;
    window.webContents.emit('devtools-opened');
    expect(window.webContents.closeDevTools).toHaveBeenCalled();
  });

  it('handles the shortcut through before-input-event', async () => {
    const policy = packagedPolicy();
    await policy.load();
    const window = fakeWindow();
    policy.attachToWindow(window);
    const shortcut = key('KeyI', { control: true, shift: true });

    expect(pressKey(window, shortcut).prevented).toBe(true);
    expect(window.webContents.toggleDevTools).not.toHaveBeenCalled();

    await policy.setEnabled(true);
    expect(pressKey(window, shortcut).prevented).toBe(true);
    expect(window.webContents.toggleDevTools).toHaveBeenCalledTimes(1);

    expect(pressKey(window, key('KeyA')).prevented).toBe(false);
  });
});
