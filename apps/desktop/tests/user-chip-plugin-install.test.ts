/** @jest-environment node */

import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { c as createTar } from 'tar';
import {
  detectUserChipPluginArchiveKind,
  findPackageRootInExtractedArchive,
  installUserChipPluginFromArchive,
  installUserChipPluginFromFolder,
} from '../src/main/user-chip-plugin-install';
import { chipPluginsRoot, listManifestEntries, readManifest } from '../src/main/user-chip-plugin-manifest';
import { stopSandboxValidator } from '../src/main/user-chip-plugin-sandbox-child';

/** Minimal store-only ZIP (no compression) for unit tests. */
function writeStoreZip(zipPath: string, files: Record<string, string>): void {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8');
    const data = Buffer.from(content, 'utf8');
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(0, 14); // crc ignored for store tests with extract-zip? set 0
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);
    // CRC-32 required by many unzippers — compute simple ieee crc
    const crc = crc32(data);
    local.writeUInt32LE(crc, 14);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);

    locals.push(local, data);
    centrals.push(central);
    offset += local.length + data.length;
  }
  const centralStart = offset;
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(centrals.length, 8);
  end.writeUInt16LE(centrals.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);
  writeFileSync(zipPath, Buffer.concat([...locals, centralBuf, end]));
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeValidPluginPackage(dir: string, options?: { name?: string; chipName?: string; version?: string }): void {
  const name = options?.name ?? 'beatbax-plugin-chip-demo';
  const chipName = options?.chipName ?? 'demo';
  const version = options?.version ?? '1.0.0';
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name,
      version,
      type: 'module',
      main: 'dist/index.js',
      peerDependencies: { '@beatbax/engine': '^0.27.0' },
    }),
    'utf8'
  );
  mkdirSync(path.join(dir, 'dist'), { recursive: true });
  writeFileSync(
    path.join(dir, 'dist', 'index.js'),
    `export default { name: ${JSON.stringify(chipName)}, createChannel() { return {}; } };\n`,
    'utf8'
  );
  mkdirSync(path.join(dir, 'node_modules', 'leftpad'), { recursive: true });
  writeFileSync(path.join(dir, 'node_modules', 'leftpad', 'index.js'), 'module.exports=1;\n', 'utf8');
}

describe('user-chip-plugin-install', () => {
  jest.setTimeout(60_000);
  let userData: string;
  let source: string;

  beforeEach(() => {
    userData = mkdtempSync(path.join(tmpdir(), 'bb-chip-ud-'));
    source = mkdtempSync(path.join(tmpdir(), 'bb-chip-src-'));
  });

  afterEach(() => {
    rmSync(userData, { recursive: true, force: true });
    rmSync(source, { recursive: true, force: true });
  });

  afterAll(() => {
    stopSandboxValidator();
  });

  it('installs from folder without copying node_modules and replaces same package', async () => {
    writeValidPluginPackage(source, { version: '1.0.0' });
    const first = await installUserChipPluginFromFolder(userData, source, '0.27.0');
    expect(first.replaced).toBe(false);
    expect(first.entry.chipName).toBe('demo');

    const installDir = path.join(chipPluginsRoot(userData), first.entry.installId);
    expect(existsSync(path.join(installDir, 'dist', 'index.js'))).toBe(true);
    expect(existsSync(path.join(installDir, 'node_modules'))).toBe(false);

    writeValidPluginPackage(source, { version: '2.0.0' });
    const second = await installUserChipPluginFromFolder(userData, source, '0.27.0');
    expect(second.replaced).toBe(true);
    expect(second.entry.version).toBe('2.0.0');
    expect(await listManifestEntries(userData)).toHaveLength(1);
    expect(JSON.parse(readFileSync(path.join(installDir, 'package.json'), 'utf8')).version).toBe('2.0.0');
  });

  it('rejects invalid folders', async () => {
    writeFileSync(path.join(source, 'package.json'), JSON.stringify({ name: 'lodash', version: '1.0.0' }), 'utf8');
    await expect(installUserChipPluginFromFolder(userData, source, '0.27.0')).rejects.toThrow(/not allowed/);
    expect((await readManifest(userData)).plugins).toHaveLength(0);
  });

  it('rejects chip name collision with built-ins', async () => {
    writeValidPluginPackage(source, { chipName: 'gameboy' });
    await expect(installUserChipPluginFromFolder(userData, source, '0.27.0')).rejects.toThrow(/built-in/);
  });

  it('rejects chip name collision with another user plugin', async () => {
    writeValidPluginPackage(source, { name: 'beatbax-plugin-chip-one', chipName: 'blip' });
    await installUserChipPluginFromFolder(userData, source, '0.27.0');

    const other = mkdtempSync(path.join(tmpdir(), 'bb-chip-src2-'));
    try {
      writeValidPluginPackage(other, { name: 'beatbax-plugin-chip-two', chipName: 'blip' });
      await expect(installUserChipPluginFromFolder(userData, other, '0.27.0')).rejects.toThrow(
        /another installed/
      );
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('detects archive kinds', () => {
    expect(detectUserChipPluginArchiveKind('x.tgz')).toBe('tgz');
    expect(detectUserChipPluginArchiveKind('x.tar.gz')).toBe('tgz');
    expect(detectUserChipPluginArchiveKind('x.ZIP')).toBe('zip');
    expect(() => detectUserChipPluginArchiveKind('x.txt')).toThrow(/zip or \.tgz/);
  });

  it('finds package root under npm-pack style folder', async () => {
    const extracted = mkdtempSync(path.join(tmpdir(), 'bb-chip-ex-'));
    try {
      const nested = path.join(extracted, 'package');
      mkdirSync(nested, { recursive: true });
      writeFileSync(path.join(nested, 'package.json'), '{"name":"beatbax-plugin-chip-x"}', 'utf8');
      await expect(findPackageRootInExtractedArchive(extracted)).resolves.toBe(nested);
    } finally {
      rmSync(extracted, { recursive: true, force: true });
    }
  });

  it('installs from an npm-pack style .tgz', async () => {
    writeValidPluginPackage(source, { version: '3.1.0' });
    const packRoot = mkdtempSync(path.join(tmpdir(), 'bb-chip-pack-'));
    const packageDir = path.join(packRoot, 'package');
    mkdirSync(packageDir, { recursive: true });
    // Copy only package files (no node_modules) into package/
    writeValidPluginPackage(packageDir, { version: '3.1.0' });
    rmSync(path.join(packageDir, 'node_modules'), { recursive: true, force: true });
    const tgzPath = path.join(packRoot, 'plugin.tgz');
    await createTar(
      {
        gzip: true,
        file: tgzPath,
        cwd: packRoot,
      },
      ['package']
    );

    const result = await installUserChipPluginFromArchive(userData, tgzPath, '0.27.0');
    expect(result.entry.version).toBe('3.1.0');
    expect(result.entry.chipName).toBe('demo');
    rmSync(packRoot, { recursive: true, force: true });
  });

  it('installs from a flat .zip package', async () => {
    writeValidPluginPackage(source, { version: '4.0.0', chipName: 'zipchip', name: 'beatbax-plugin-chip-zip' });
    const zipPath = path.join(source, 'plugin.zip');
    writeStoreZip(zipPath, {
      'package.json': readFileSync(path.join(source, 'package.json'), 'utf8'),
      'dist/index.js': readFileSync(path.join(source, 'dist', 'index.js'), 'utf8'),
    });
    const result = await installUserChipPluginFromArchive(userData, zipPath, '0.27.0');
    expect(result.entry.chipName).toBe('zipchip');
    expect(result.entry.version).toBe('4.0.0');
  });

  it('validates a plugin that uses a named engine import', async () => {
    writeValidPluginPackage(source, { chipName: 'named' });
    writeFileSync(
      path.join(source, 'dist', 'index.js'),
      `import { chipRegistry } from '@beatbax/engine/chips';\nexport default { name: 'named', createChannel() { return { chipRegistry }; } };\n`,
      'utf8'
    );
    const result = await installUserChipPluginFromFolder(userData, source, '0.27.0');
    expect(result.entry.chipName).toBe('named');
  });

  it('does not give archive code Node builtins during validation', async () => {
    const sentinel = path.join(source, 'pwned.txt');
    writeValidPluginPackage(source, { chipName: 'evil' });
    writeFileSync(
      path.join(source, 'dist', 'index.js'),
      `const fs = process.getBuiltinModule('fs');\nfs.writeFileSync(${JSON.stringify(sentinel)}, 'owned');\nexport default { name: 'evil', createChannel() { return {}; } };\n`,
      'utf8'
    );
    await expect(installUserChipPluginFromFolder(userData, source, '0.27.0')).rejects.toThrow(
      /process|getBuiltinModule/
    );
    expect(existsSync(sentinel)).toBe(false);
  });
});
