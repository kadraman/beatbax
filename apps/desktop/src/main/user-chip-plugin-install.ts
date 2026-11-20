/**
 * Install / validate user chip plugins into userData (spec 111).
 */

import { existsSync, promises as fs, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import extractZip from 'extract-zip';
import { x as extractTar } from 'tar';

const ARCHIVE_MAX_BYTES = 32 * 1024 * 1024;
import {
  assertChipPluginShape,
  assertNoChipNameCollision,
  collectChipNames,
  inspectPackageForInstall,
  isAllowedUserChipPackageName,
  listPackageFilesForCopy,
  packageIdFromName,
  RESERVED_CHIP_NAMES,
} from './user-chip-plugin-validate';
import {
  chipPluginsRoot,
  otherUserChipNames,
  readManifest,
  type UserChipPluginManifestEntry,
  upsertManifestEntry,
} from './user-chip-plugin-manifest';

export interface InstallUserChipPluginResult {
  entry: UserChipPluginManifestEntry;
  replaced: boolean;
}

async function copyPackageExcludingNodeModules(sourceDir: string, destDir: string): Promise<void> {
  const files = listPackageFilesForCopy(sourceDir);
  await fs.rm(destDir, { recursive: true, force: true });
  await fs.mkdir(destDir, { recursive: true });
  for (const relative of files) {
    const from = path.join(sourceDir, relative);
    const to = path.join(destDir, relative);
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(from, to);
  }
  const nm = path.join(destDir, 'node_modules');
  if (existsSync(nm)) {
    await fs.rm(nm, { recursive: true, force: true });
  }
}

/**
 * Load the plugin entry in a sandboxed renderer (no Node, no preload).
 * Outside Electron (unit tests) this launches a dedicated Electron process whose
 * renderer is sandboxed the same way. The entry is never evaluated in this process.
 */
async function loadPluginForValidation(entryAbsolutePath: string, packageDir: string): Promise<unknown> {
  const entryRelativePath = path.relative(packageDir, entryAbsolutePath).replace(/\\/g, '/');
  const shape = process.versions.electron
    ? await loadPluginShapeInProcess(packageDir, entryRelativePath)
    : await loadPluginShapeInChild(packageDir, entryRelativePath);
  return {
    name: shape.name,
    aliases: shape.aliases,
    createChannel: () => ({}),
  };
}

async function loadPluginShapeInProcess(
  packageDir: string,
  entryRelativePath: string
): Promise<{ name: string; aliases: string[] }> {
  const { loadPluginShapeInSandbox } = await import('./user-chip-plugin-sandbox');
  return loadPluginShapeInSandbox({ packageDir, entryRelativePath });
}

async function loadPluginShapeInChild(
  packageDir: string,
  entryRelativePath: string
): Promise<{ name: string; aliases: string[] }> {
  const { loadPluginShapeInSandboxChild } = await import('./user-chip-plugin-sandbox-child');
  return loadPluginShapeInSandboxChild({ packageDir, entryRelativePath });
}

async function validateInstalledPackage(
  packageDir: string,
  hostEngineVersion: string,
  userDataPath: string,
  packageName: string
): Promise<{ chipName: string; aliases: string[]; entryRelativePath: string; version: string }> {
  const inspected = inspectPackageForInstall(packageDir, hostEngineVersion);
  const plugin = await loadPluginForValidation(inspected.entryAbsolutePath, packageDir);
  assertChipPluginShape(plugin);
  const chipNames = collectChipNames(plugin);
  const manifest = await readManifest(userDataPath);
  assertNoChipNameCollision(chipNames, {
    reservedNames: RESERVED_CHIP_NAMES,
    otherUserChipNames: otherUserChipNames(manifest, packageName),
  });
  return {
    chipName: plugin.name.trim(),
    aliases: (plugin.aliases ?? []).filter((a): a is string => typeof a === 'string' && Boolean(a.trim())),
    entryRelativePath: inspected.entryRelativePath.replace(/\\/g, '/'),
    version: inspected.version,
  };
}

export async function installUserChipPluginFromFolder(
  userDataPath: string,
  sourceDir: string,
  hostEngineVersion: string
): Promise<InstallUserChipPluginResult> {
  const inspected = inspectPackageForInstall(sourceDir, hostEngineVersion);
  const packageName = inspected.packageName;
  const installId = packageIdFromName(packageName);
  const destDir = path.join(chipPluginsRoot(userDataPath), installId);
  const manifest = await readManifest(userDataPath);
  const replaced = manifest.plugins.some((p) => p.packageName === packageName);

  const staging = await fs.mkdtemp(path.join(tmpdir(), 'beatbax-chip-install-'));
  try {
    await copyPackageExcludingNodeModules(sourceDir, staging);
    const validated = await validateInstalledPackage(
      staging,
      hostEngineVersion,
      userDataPath,
      packageName
    );
    await copyPackageExcludingNodeModules(staging, destDir);

    const entry: UserChipPluginManifestEntry = {
      packageName,
      version: validated.version,
      chipName: validated.chipName,
      aliases: validated.aliases,
      enabled: true,
      installId,
      entryRelativePath: validated.entryRelativePath,
      installedAt: new Date().toISOString(),
    };
    await upsertManifestEntry(userDataPath, entry);
    return { entry, replaced };
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}

export type UserChipPluginArchiveKind = 'zip' | 'tgz';

export function detectUserChipPluginArchiveKind(archivePath: string): UserChipPluginArchiveKind {
  const lower = archivePath.replace(/\\/g, '/').toLowerCase();
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'tgz';
  if (lower.endsWith('.zip')) return 'zip';
  throw new Error('Choose a chip plugin package archive (.zip or .tgz from npm pack).');
}

/**
 * After unpacking an archive, locate the package root (package.json).
 * Supports flat zips and npm-pack style single top-level folders (e.g. `package/`).
 */
export async function findPackageRootInExtractedArchive(extractedDir: string): Promise<string> {
  if (existsSync(path.join(extractedDir, 'package.json'))) {
    return extractedDir;
  }
  const entries = await fs.readdir(extractedDir, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'));
  const candidates: string[] = [];
  for (const dir of dirs) {
    const candidate = path.join(extractedDir, dir.name);
    if (existsSync(path.join(candidate, 'package.json'))) {
      candidates.push(candidate);
    }
  }
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) {
    throw new Error(
      'Archive does not contain a package.json. Pack the built package (for example `npm pack`), not a source checkout.'
    );
  }
  throw new Error(
    'Archive contains multiple package.json roots. Pack a single chip plugin package.'
  );
}

async function extractUserChipPluginArchive(archivePath: string, destDir: string): Promise<void> {
  const kind = detectUserChipPluginArchiveKind(archivePath);
  await fs.mkdir(destDir, { recursive: true });
  if (kind === 'tgz') {
    await extractTar({
      file: archivePath,
      cwd: destDir,
      strip: 0,
    });
    return;
  }
  await extractZip(archivePath, { dir: destDir });
}

/**
 * Install from a local `.zip` or `.tgz` / `.tar.gz` package archive (npm pack or release asset).
 */
export async function installUserChipPluginFromArchive(
  userDataPath: string,
  archivePath: string,
  hostEngineVersion: string
): Promise<InstallUserChipPluginResult> {
  if (!archivePath || typeof archivePath !== 'string') {
    throw new Error('Choose a chip plugin package archive (.zip or .tgz).');
  }
  const resolvedArchive = path.resolve(archivePath);
  if (!existsSync(resolvedArchive)) {
    throw new Error(`Archive not found: ${resolvedArchive}`);
  }
  let size = 0;
  try {
    size = statSync(resolvedArchive).size;
  } catch {
    throw new Error(`Archive not readable: ${resolvedArchive}`);
  }
  if (size > ARCHIVE_MAX_BYTES) {
    throw new Error(`Archive exceeds the ${ARCHIVE_MAX_BYTES} byte limit.`);
  }

  detectUserChipPluginArchiveKind(resolvedArchive);

  const extractDir = await fs.mkdtemp(path.join(tmpdir(), 'beatbax-chip-archive-'));
  try {
    await extractUserChipPluginArchive(resolvedArchive, extractDir);
    const packageRoot = await findPackageRootInExtractedArchive(extractDir);
    return await installUserChipPluginFromFolder(userDataPath, packageRoot, hostEngineVersion);
  } finally {
    await fs.rm(extractDir, { recursive: true, force: true });
  }
}

export { isAllowedUserChipPackageName };
