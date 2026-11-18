/** @jest-environment node */

import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  chipPluginsRoot,
  emptyManifest,
  listManifestEntries,
  readManifest,
  removeManifestEntry,
  setManifestEntryEnabled,
  upsertManifestEntry,
  type UserChipPluginManifestEntry,
} from '../src/main/user-chip-plugin-manifest';

function sampleEntry(overrides: Partial<UserChipPluginManifestEntry> = {}): UserChipPluginManifestEntry {
  return {
    packageName: 'beatbax-plugin-chip-demo',
    version: '1.0.0',
    chipName: 'demo',
    aliases: [],
    enabled: true,
    installId: 'beatbax-plugin-chip-demo',
    entryRelativePath: 'dist/index.js',
    installedAt: '2026-11-17T00:00:00.000Z',
    ...overrides,
  };
}

describe('user-chip-plugin-manifest', () => {
  let userData: string;

  beforeEach(() => {
    userData = mkdtempSync(path.join(tmpdir(), 'bb-chip-manifest-'));
  });

  afterEach(() => {
    rmSync(userData, { recursive: true, force: true });
  });

  it('starts empty and upserts / replaces by package name', async () => {
    expect(await readManifest(userData)).toEqual(emptyManifest());
    await upsertManifestEntry(userData, sampleEntry());
    await upsertManifestEntry(
      userData,
      sampleEntry({ version: '2.0.0', chipName: 'demo' })
    );
    const listed = await listManifestEntries(userData);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.version).toBe('2.0.0');
  });

  it('set-enabled updates the flag', async () => {
    await upsertManifestEntry(userData, sampleEntry({ enabled: true }));
    const updated = await setManifestEntryEnabled(userData, 'beatbax-plugin-chip-demo', false);
    expect(updated.enabled).toBe(false);
    expect((await listManifestEntries(userData))[0]?.enabled).toBe(false);
  });

  it('remove deletes manifest entry and install directory', async () => {
    const entry = sampleEntry();
    await upsertManifestEntry(userData, entry);
    const installDir = path.join(chipPluginsRoot(userData), entry.installId);
    mkdirSync(installDir, { recursive: true });
    writeFileSync(path.join(installDir, 'package.json'), '{}', 'utf8');
    expect(existsSync(installDir)).toBe(true);

    await removeManifestEntry(userData, entry.packageName);
    expect(await listManifestEntries(userData)).toEqual([]);
    expect(existsSync(installDir)).toBe(false);
  });
});
