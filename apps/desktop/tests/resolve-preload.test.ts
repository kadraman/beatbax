/** @jest-environment node */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolvePreloadPath } from '../src/main/resolve-preload';

describe('resolvePreloadPath', () => {
  it('prefers index.mjs when present', () => {
    const root = mkdtempSync(join(tmpdir(), 'beatbax-out-'));
    const mainDir = join(root, 'main');
    const preloadDir = join(root, 'preload');
    mkdirSync(mainDir, { recursive: true });
    mkdirSync(preloadDir);
    writeFileSync(join(preloadDir, 'index.mjs'), 'export {}');
    writeFileSync(join(preloadDir, 'index.js'), 'module.exports = {}');
    expect(resolvePreloadPath(mainDir)).toBe(join(preloadDir, 'index.mjs'));
  });

  it('falls back to index.js when mjs is absent', () => {
    const root = mkdtempSync(join(tmpdir(), 'beatbax-out-'));
    const mainDir = join(root, 'main');
    const preloadDir = join(root, 'preload');
    mkdirSync(mainDir, { recursive: true });
    mkdirSync(preloadDir);
    writeFileSync(join(preloadDir, 'index.js'), 'module.exports = {}');
    expect(resolvePreloadPath(mainDir)).toBe(join(preloadDir, 'index.js'));
  });
});
