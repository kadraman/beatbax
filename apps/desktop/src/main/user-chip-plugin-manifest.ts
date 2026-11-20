/**
 * Manifest + on-disk storage for Desktop user chip plugins (spec 111).
 */

import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { packageIdFromName } from './user-chip-plugin-validate';

export const CHIP_PLUGINS_DIR_NAME = 'chip-plugins';
export const CHIP_PLUGINS_MANIFEST_NAME = 'chip-plugins-manifest.json';

export interface UserChipPluginManifestEntry {
  packageName: string;
  version: string;
  chipName: string;
  aliases: string[];
  enabled: boolean;
  /** Directory name under chip-plugins/ (safe id). */
  installId: string;
  /** Entry path relative to the install directory (POSIX-ish). */
  entryRelativePath: string;
  installedAt: string;
}

export interface UserChipPluginManifest {
  version: 1;
  plugins: UserChipPluginManifestEntry[];
}

export function chipPluginsRoot(userDataPath: string): string {
  return path.join(userDataPath, CHIP_PLUGINS_DIR_NAME);
}

export function chipPluginsManifestPath(userDataPath: string): string {
  return path.join(userDataPath, CHIP_PLUGINS_MANIFEST_NAME);
}

export function emptyManifest(): UserChipPluginManifest {
  return { version: 1, plugins: [] };
}

export async function readManifest(userDataPath: string): Promise<UserChipPluginManifest> {
  const manifestPath = chipPluginsManifestPath(userDataPath);
  if (!existsSync(manifestPath)) return emptyManifest();
  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as UserChipPluginManifest;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.plugins)) {
      return emptyManifest();
    }
    return {
      version: 1,
      plugins: parsed.plugins.filter(
        (entry) =>
          entry &&
          typeof entry.packageName === 'string' &&
          typeof entry.installId === 'string' &&
          typeof entry.entryRelativePath === 'string' &&
          typeof entry.chipName === 'string'
      ),
    };
  } catch {
    return emptyManifest();
  }
}

export async function writeManifest(
  userDataPath: string,
  manifest: UserChipPluginManifest
): Promise<void> {
  const manifestPath = chipPluginsManifestPath(userDataPath);
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  const normalized: UserChipPluginManifest = {
    version: 1,
    plugins: [...manifest.plugins].sort((a, b) => a.packageName.localeCompare(b.packageName)),
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
}

export async function listManifestEntries(
  userDataPath: string
): Promise<UserChipPluginManifestEntry[]> {
  return (await readManifest(userDataPath)).plugins;
}

export async function upsertManifestEntry(
  userDataPath: string,
  entry: UserChipPluginManifestEntry
): Promise<UserChipPluginManifest> {
  const manifest = await readManifest(userDataPath);
  const next = manifest.plugins.filter((p) => p.packageName !== entry.packageName);
  next.push(entry);
  const updated = { version: 1 as const, plugins: next };
  await writeManifest(userDataPath, updated);
  return updated;
}

export async function setManifestEntryEnabled(
  userDataPath: string,
  packageName: string,
  enabled: boolean
): Promise<UserChipPluginManifestEntry> {
  const manifest = await readManifest(userDataPath);
  const entry = manifest.plugins.find((p) => p.packageName === packageName);
  if (!entry) {
    throw new Error(`User chip plugin "${packageName}" is not installed.`);
  }
  entry.enabled = enabled;
  await writeManifest(userDataPath, manifest);
  return entry;
}

export async function removeManifestEntry(
  userDataPath: string,
  packageName: string
): Promise<{ entry: UserChipPluginManifestEntry; deletedDir: string }> {
  const manifest = await readManifest(userDataPath);
  const entry = manifest.plugins.find((p) => p.packageName === packageName);
  if (!entry) {
    throw new Error(`User chip plugin "${packageName}" is not installed.`);
  }
  const next = manifest.plugins.filter((p) => p.packageName !== packageName);
  await writeManifest(userDataPath, { version: 1, plugins: next });

  const installDir = path.join(chipPluginsRoot(userDataPath), entry.installId);
  if (existsSync(installDir)) {
    await fs.rm(installDir, { recursive: true, force: true });
  }
  return { entry, deletedDir: installDir };
}

export function installDirForPackage(userDataPath: string, packageName: string): string {
  return path.join(chipPluginsRoot(userDataPath), packageIdFromName(packageName));
}

export function otherUserChipNames(
  manifest: UserChipPluginManifest,
  exceptPackageName?: string
): string[] {
  const names: string[] = [];
  for (const entry of manifest.plugins) {
    if (exceptPackageName && entry.packageName === exceptPackageName) continue;
    names.push(entry.chipName);
    for (const alias of entry.aliases ?? []) names.push(alias);
  }
  return names;
}
