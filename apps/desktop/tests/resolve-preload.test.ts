/** @jest-environment node */

import { join } from 'node:path';
import { resolvePreloadPath } from '../src/main/resolve-preload';

describe('resolvePreloadPath', () => {
  it('resolves the sandbox-compatible CJS preload bundle', () => {
    const mainDir = join('/tmp', 'out', 'main');
    expect(resolvePreloadPath(mainDir)).toBe(join('/tmp', 'out', 'preload', 'index.js'));
  });
});
