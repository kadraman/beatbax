import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveHostEngineVersion } from '../src/main/resolve-host-engine-version';

function writeEnginePackage(root: string, version: string): string {
  const pkgDir = path.join(root, 'node_modules', '@beatbax', 'engine');
  mkdirSync(pkgDir, { recursive: true });
  const pkgPath = path.join(pkgDir, 'package.json');
  writeFileSync(
    pkgPath,
    JSON.stringify({ name: '@beatbax/engine', version }, null, 2),
    'utf8'
  );
  return pkgPath;
}

describe('resolveHostEngineVersion', () => {
  it('reads version from node_modules without using package exports', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'bb-engine-ver-'));
    writeEnginePackage(root, '0.27.0');
    expect(resolveHostEngineVersion([root])).toBe('0.27.0');
  });

  it('walks parent roots used by electron-vite out/main layouts', () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'bb-engine-repo-'));
    writeEnginePackage(repo, '0.27.3');
    const outMain = path.join(repo, 'apps', 'desktop', 'out', 'main');
    mkdirSync(outMain, { recursive: true });
    expect(resolveHostEngineVersion([outMain])).toBe('0.27.3');
  });

  it('ignores desktop-stub packages and keeps searching', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'bb-engine-stub-'));
    writeEnginePackage(root, '0.0.0-desktop-stub');
    const workspace = path.join(root, 'packages', 'engine');
    mkdirSync(workspace, { recursive: true });
    writeFileSync(
      path.join(workspace, 'package.json'),
      JSON.stringify({ name: '@beatbax/engine', version: '0.27.0' }, null, 2),
      'utf8'
    );
    expect(resolveHostEngineVersion([root])).toBe('0.27.0');
  });

  it('throws when no host engine package.json is found', () => {
    const empty = mkdtempSync(path.join(tmpdir(), 'bb-engine-empty-'));
    expect(() => resolveHostEngineVersion([empty])).toThrow(/Could not resolve host/);
  });
});
