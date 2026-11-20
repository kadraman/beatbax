/** @jest-environment node */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  assertChipPluginShape,
  assertNoChipNameCollision,
  extractModuleSpecifiers,
  inspectPackageForInstall,
  isAllowedUserChipPackageName,
  listPackageFilesForCopy,
  packageIdFromName,
  satisfiesPeerRange,
  scanImportGraph,
} from '../src/main/user-chip-plugin-validate';

describe('user-chip-plugin-validate', () => {
  it('allows official and community package names', () => {
    expect(isAllowedUserChipPackageName('@beatbax/plugin-chip-blip')).toBe(true);
    expect(isAllowedUserChipPackageName('beatbax-plugin-chip-blip')).toBe(true);
    expect(isAllowedUserChipPackageName('@other/plugin-chip-blip')).toBe(false);
    expect(isAllowedUserChipPackageName('lodash')).toBe(false);
  });

  it('builds a safe install id from scoped names', () => {
    expect(packageIdFromName('@beatbax/plugin-chip-blip')).toBe('beatbax__plugin-chip-blip');
    expect(packageIdFromName('beatbax-plugin-chip-blip')).toBe('beatbax-plugin-chip-blip');
  });

  it('checks common peer ranges', () => {
    // npm caret on 0.y.z stays within the same minor: ^0.27.0 => >=0.27.0 <0.28.0
    expect(satisfiesPeerRange('0.27.0', '^0.27.0')).toBe(true);
    expect(satisfiesPeerRange('0.27.5', '^0.27.0')).toBe(true);
    expect(satisfiesPeerRange('0.28.0', '^0.27.0')).toBe(false);
    expect(satisfiesPeerRange('1.0.0', '^0.27.0')).toBe(false);
    expect(satisfiesPeerRange('0.27.1', '~0.27.0')).toBe(true);
    expect(satisfiesPeerRange('0.28.0', '~0.27.0')).toBe(false);
    expect(satisfiesPeerRange('0.27.0', '>=0.20.0')).toBe(true);
    expect(satisfiesPeerRange('0.27.0', '*')).toBe(true);
    expect(satisfiesPeerRange('1.2.3', '^1.2.0')).toBe(true);
    expect(satisfiesPeerRange('2.0.0', '^1.2.0')).toBe(false);
    // ^0.0.z is patch-exact: ^0.0.1 accepts 0.0.1 and rejects 0.0.2.
    expect(satisfiesPeerRange('0.0.1', '^0.0.1')).toBe(true);
    expect(satisfiesPeerRange('0.0.2', '^0.0.1')).toBe(false);
    expect(satisfiesPeerRange('0.0.0', '^0.0.1')).toBe(false);
  });

  it('extracts import specifiers', () => {
    const src = `
      import type { ChipPlugin } from '@beatbax/engine';
      import { chipRegistry } from '@beatbax/engine/chips';
      import { x } from './local.js';
      export { y } from '../other.js';
      const z = await import('fs');
    `;
    expect(extractModuleSpecifiers(src)).toEqual([
      '@beatbax/engine',
      '@beatbax/engine/chips',
      './local.js',
      '../other.js',
      'fs',
    ]);
  });

  it('rejects node and forbidden bare imports in the graph', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bb-chip-scan-'));
    try {
      writeFileSync(
        path.join(dir, 'index.js'),
        `import fs from 'fs';\nexport default { name: 'x', createChannel() {} };\n`,
        'utf8'
      );
      expect(() => scanImportGraph(dir, path.join(dir, 'index.js'))).toThrow(/Forbidden module specifier "fs"/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('allows relative graph and @beatbax/engine imports', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bb-chip-scan-ok-'));
    try {
      writeFileSync(path.join(dir, 'helper.js'), `export const n = 1;\n`, 'utf8');
      writeFileSync(
        path.join(dir, 'index.js'),
        `import { n } from './helper.js';\nimport { chipRegistry } from '@beatbax/engine/chips';\nexport default { name: 'blip', createChannel() {}, n };\n`,
        'utf8'
      );
      expect(() => scanImportGraph(dir, path.join(dir, 'index.js'))).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects @beatbax/engine/node', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bb-chip-scan-node-'));
    try {
      writeFileSync(
        path.join(dir, 'index.js'),
        `import x from '@beatbax/engine/node';\nexport default { name: 'x', createChannel() {} };\n`,
        'utf8'
      );
      expect(() => scanImportGraph(dir, path.join(dir, 'index.js'))).toThrow(/engine\/node/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects unsupported engine subpaths', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bb-chip-scan-sub-'));
    try {
      writeFileSync(
        path.join(dir, 'index.js'),
        `import { Player } from '@beatbax/engine/audio/playback';\nexport default { name: 'x', createChannel() {} };\n`,
        'utf8'
      );
      expect(() => scanImportGraph(dir, path.join(dir, 'index.js'))).toThrow(/Unsupported engine subpath/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('inspects a valid package folder', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bb-chip-pkg-'));
    try {
      writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({
          name: 'beatbax-plugin-chip-demo',
          version: '1.2.3',
          type: 'module',
          main: 'dist/index.js',
          peerDependencies: { '@beatbax/engine': '^0.27.0' },
        }),
        'utf8'
      );
      mkdirSync(path.join(dir, 'dist'));
      writeFileSync(
        path.join(dir, 'dist', 'index.js'),
        `export default { name: 'demo', createChannel() { return {}; } };\n`,
        'utf8'
      );
      const inspected = inspectPackageForInstall(dir, '0.27.0');
      expect(inspected.packageName).toBe('beatbax-plugin-chip-demo');
      expect(inspected.version).toBe('1.2.3');
      expect(inspected.entryRelativePath.replace(/\\/g, '/')).toBe('dist/index.js');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('lists package files without node_modules', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bb-chip-copy-'));
    try {
      writeFileSync(path.join(dir, 'package.json'), '{}', 'utf8');
      mkdirSync(path.join(dir, 'dist'));
      writeFileSync(path.join(dir, 'dist', 'index.js'), 'export default {};\n', 'utf8');
      mkdirSync(path.join(dir, 'node_modules', 'lodash'), { recursive: true });
      writeFileSync(path.join(dir, 'node_modules', 'lodash', 'index.js'), 'module.exports=1;\n', 'utf8');
      const files = listPackageFilesForCopy(dir).map((f) => f.replace(/\\/g, '/'));
      expect(files).toContain('package.json');
      expect(files).toContain('dist/index.js');
      expect(files.some((f) => f.includes('node_modules'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('validates ChipPlugin shape and collisions', () => {
    expect(() => assertChipPluginShape({ name: 'x' })).toThrow(/createChannel/);
    assertChipPluginShape({ name: 'blip', createChannel: () => ({}) });
    expect(() =>
      assertNoChipNameCollision(['gameboy'], {})
    ).toThrow(/built-in/);
    expect(() =>
      assertNoChipNameCollision(['blip'], { otherUserChipNames: ['blip'] })
    ).toThrow(/another installed/);
  });
});
