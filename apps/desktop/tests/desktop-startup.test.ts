/** @jest-environment jsdom */

import { readStartupMenuAction, shouldRestorePersistedSession } from '../src/renderer/src/lib/desktop-startup';

describe('desktop startup menu action', () => {
  const originalLocation = window.location;

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('reads a startup menu action from the URL', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('http://localhost:5173/?desktopAction=file%3Anew'),
    });

    expect(readStartupMenuAction()).toBe('file:new');
    expect(shouldRestorePersistedSession(readStartupMenuAction())).toBe(false);
  });

  it('ignores unknown startup actions', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('http://localhost:5173/?desktopAction=not-a-real-action'),
    });

    expect(readStartupMenuAction()).toBeNull();
    expect(shouldRestorePersistedSession(null)).toBe(true);
  });
});
