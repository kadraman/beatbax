/**
 * Pure validators for Desktop user chip plugins (spec 111).
 * No Electron dependency — safe for Jest unit tests.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { isSupportedEngineSpecifier, supportedEngineSpecifierList } from './user-chip-plugin-engine-api';

export const USER_CHIP_PACKAGE_NAME_RE =
  /^(?:@beatbax\/plugin-chip-[a-z0-9-]+|beatbax-plugin-chip-[a-z0-9-]+)$/;

/** Built-in + pre-bundled optional chip ids / aliases that user plugins must not collide with. */
export const RESERVED_CHIP_NAMES = new Set([
  'gameboy',
  'gb',
  'dmg',
  'nes',
  'famicom',
  'sms',
  'gg',
  'spectrum-128',
  'cpc',
]);

const FORBIDDEN_BARE_IMPORTS = new Set([
  'fs',
  'path',
  'os',
  'crypto',
  'child_process',
  'worker_threads',
  'http',
  'https',
  'net',
  'tls',
  'url',
  'util',
  'stream',
  'buffer',
  'events',
  'module',
  'assert',
  'process',
  'v8',
  'vm',
  'zlib',
  'readline',
  'dns',
  'dgram',
  'cluster',
  'perf_hooks',
  'inspector',
  'async_hooks',
  'timers',
  'tty',
  'constants',
  'querystring',
  'string_decoder',
  'punycode',
  'electron',
]);

export interface PackageJsonLike {
  name?: unknown;
  version?: unknown;
  main?: unknown;
  exports?: unknown;
  peerDependencies?: Record<string, string> | unknown;
  type?: unknown;
}

export interface ResolvedPackageEntry {
  packageName: string;
  version: string;
  entryRelativePath: string;
  entryAbsolutePath: string;
  peerEngineRange: string | null;
}

export function isAllowedUserChipPackageName(name: string): boolean {
  return USER_CHIP_PACKAGE_NAME_RE.test(name);
}

export function packageIdFromName(packageName: string): string {
  // Safe directory id: strip scope @ and replace / with __
  return packageName.replace(/^@/, '').replace(/\//g, '__');
}

/** Parse a simple semver string into [major, minor, patch]. */
export function parseSemver(version: string): [number, number, number] | null {
  const cleaned = String(version)
    .trim()
    .replace(/^v/i, '')
    .split('-')[0]
    .split('+')[0];
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(cleaned);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function cmpSemver(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

/**
 * Minimal peer-range check for common npm ranges: `*`, exact, `^`, `~`, `>=`, `>`.
 * Compound ranges with `||` are accepted if any clause matches.
 */
export function satisfiesPeerRange(version: string, range: string): boolean {
  const ver = parseSemver(version);
  if (!ver) return false;
  const trimmed = String(range || '').trim();
  if (!trimmed || trimmed === '*' || trimmed === 'x' || trimmed === 'X') return true;

  const clauses = trimmed.split('||').map((c) => c.trim()).filter(Boolean);
  return clauses.some((clause) => satisfiesSingleRange(ver, clause));
}

function satisfiesSingleRange(ver: [number, number, number], clause: string): boolean {
  const c = clause.trim();
  if (!c || c === '*' || c === 'x') return true;

  if (c.startsWith('^')) {
    const base = parseSemver(c.slice(1));
    if (!base) return false;
    if (cmpSemver(ver, base) < 0) return false;
    // npm caret: ^0.0.z is the exact patch; ^0.y.z stays in 0.y.*; ^x.y.z stays in x.*
    if (base[0] === 0 && base[1] === 0) {
      // ^0.0.z accepts only that patch (^0.0.1 allows 0.0.1 and rejects 0.0.2).
      return ver[0] === 0 && ver[1] === 0 && ver[2] === base[2];
    }
    if (base[0] === 0) {
      return ver[0] === 0 && ver[1] === base[1];
    }
    return ver[0] === base[0];
  }

  if (c.startsWith('~')) {
    const base = parseSemver(c.slice(1));
    if (!base) return false;
    return ver[0] === base[0] && ver[1] === base[1] && cmpSemver(ver, base) >= 0;
  }

  if (c.startsWith('>=')) {
    const base = parseSemver(c.slice(2).trim());
    if (!base) return false;
    return cmpSemver(ver, base) >= 0;
  }

  if (c.startsWith('>')) {
    const base = parseSemver(c.slice(1).trim());
    if (!base) return false;
    return cmpSemver(ver, base) > 0;
  }

  if (c.startsWith('<=')) {
    const base = parseSemver(c.slice(2).trim());
    if (!base) return false;
    return cmpSemver(ver, base) <= 0;
  }

  if (c.startsWith('<')) {
    const base = parseSemver(c.slice(1).trim());
    if (!base) return false;
    return cmpSemver(ver, base) < 0;
  }

  if (c.startsWith('=')) {
    const base = parseSemver(c.slice(1).trim());
    if (!base) return false;
    return cmpSemver(ver, base) === 0;
  }

  const exact = parseSemver(c);
  if (!exact) return false;
  return cmpSemver(ver, exact) === 0;
}

export function assertEnginePeerCompatible(
  hostEngineVersion: string,
  peerRange: string | null | undefined
): void {
  if (!peerRange || !String(peerRange).trim()) {
    throw new Error(
      'package.json must declare peerDependencies["@beatbax/engine"] so Desktop can verify compatibility.'
    );
  }
  if (!satisfiesPeerRange(hostEngineVersion, peerRange)) {
    throw new Error(
      `Plugin peerDependencies["@beatbax/engine"] "${peerRange}" does not accept host engine ${hostEngineVersion}.`
    );
  }
}

export function resolvePackageEntry(
  packageDir: string,
  pkg: PackageJsonLike
): { relativePath: string; absolutePath: string } {
  let relative: string | null = null;

  const exportsField = pkg.exports;
  if (exportsField && typeof exportsField === 'object' && !Array.isArray(exportsField)) {
    const dot = (exportsField as Record<string, unknown>)['.'];
    if (typeof dot === 'string') {
      relative = dot;
    } else if (dot && typeof dot === 'object' && !Array.isArray(dot)) {
      const importPath = (dot as Record<string, unknown>).import;
      if (typeof importPath === 'string') relative = importPath;
      else if (
        importPath &&
        typeof importPath === 'object' &&
        !Array.isArray(importPath) &&
        typeof (importPath as Record<string, unknown>).default === 'string'
      ) {
        relative = (importPath as Record<string, unknown>).default as string;
      }
    }
  }

  if (!relative && typeof pkg.main === 'string' && pkg.main.trim()) {
    relative = pkg.main.trim();
  }

  if (!relative) {
    throw new Error('package.json must declare exports["."].import or main pointing at a built ESM entry.');
  }

  const normalized = relative.replace(/\\/g, '/').replace(/^\.\//, '');
  if (normalized.includes('..') || path.isAbsolute(normalized)) {
    throw new Error(`Invalid package entry path: ${relative}`);
  }

  const absolutePath = path.resolve(packageDir, normalized);
  if (!absolutePath.startsWith(path.resolve(packageDir) + path.sep) && absolutePath !== path.resolve(packageDir)) {
    throw new Error(`Package entry escapes package directory: ${relative}`);
  }
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new Error(
      `Package entry "${relative}" was not found. Build the plugin (npm run build) before installing.`
    );
  }

  return { relativePath: normalized, absolutePath };
}

export function readPackageJson(packageDir: string): PackageJsonLike {
  const pkgPath = path.join(packageDir, 'package.json');
  if (!existsSync(pkgPath)) {
    throw new Error('Selected folder must contain a package.json.');
  }
  let raw: string;
  try {
    raw = readFileSync(pkgPath, 'utf8');
  } catch {
    throw new Error('Could not read package.json.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('package.json is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('package.json must be an object.');
  }
  return parsed as PackageJsonLike;
}

export function inspectPackageForInstall(
  packageDir: string,
  hostEngineVersion: string
): ResolvedPackageEntry {
  const pkg = readPackageJson(packageDir);
  if (typeof pkg.name !== 'string' || !pkg.name.trim()) {
    throw new Error('package.json must include a string "name".');
  }
  const packageName = pkg.name.trim();
  if (!isAllowedUserChipPackageName(packageName)) {
    throw new Error(
      `Package name "${packageName}" is not allowed. Use @beatbax/plugin-chip-* or beatbax-plugin-chip-*.`
    );
  }
  if (typeof pkg.version !== 'string' || !pkg.version.trim()) {
    throw new Error('package.json must include a string "version".');
  }
  const version = pkg.version.trim();

  const peerDeps =
    pkg.peerDependencies && typeof pkg.peerDependencies === 'object' && !Array.isArray(pkg.peerDependencies)
      ? (pkg.peerDependencies as Record<string, string>)
      : {};
  const peerEngineRange = typeof peerDeps['@beatbax/engine'] === 'string' ? peerDeps['@beatbax/engine'] : null;
  assertEnginePeerCompatible(hostEngineVersion, peerEngineRange);

  const entry = resolvePackageEntry(packageDir, pkg);
  scanImportGraph(packageDir, entry.absolutePath);

  return {
    packageName,
    version,
    entryRelativePath: entry.relativePath,
    entryAbsolutePath: entry.absolutePath,
    peerEngineRange,
  };
}

const IMPORT_RE =
  /(?:^|[^\w.$])(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;

export function extractModuleSpecifiers(source: string): string[] {
  const found: string[] = [];
  IMPORT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMPORT_RE.exec(source)) !== null) {
    const spec = match[1] ?? match[2];
    if (spec) found.push(spec);
  }
  return found;
}

function isRelativeSpecifier(spec: string): boolean {
  return spec.startsWith('./') || spec.startsWith('../');
}

function isEngineSpecifier(spec: string): boolean {
  return spec === '@beatbax/engine' || spec.startsWith('@beatbax/engine/');
}

function assertSupportedEngineSpecifier(spec: string, fileLabel: string): void {
  if (spec === '@beatbax/engine/node' || spec.startsWith('@beatbax/engine/node/')) {
    throw new Error(
      'Forbidden module specifier ' +
        JSON.stringify(spec) +
        ' in ' +
        fileLabel +
        '. Desktop plugins may only use relative imports and @beatbax/engine (not @beatbax/engine/node).'
    );
  }
  if (!isSupportedEngineSpecifier(spec)) {
    throw new Error(
      'Unsupported engine subpath ' +
        JSON.stringify(spec) +
        ' in ' +
        fileLabel +
        '. Desktop plugins may import only: ' +
        supportedEngineSpecifierList() +
        '.'
    );
  }
}

function isForbiddenBareSpecifier(spec: string): boolean {
  if (spec.startsWith('node:')) return true;
  if (isEngineSpecifier(spec)) return false;
  if (isRelativeSpecifier(spec)) return false;
  if (spec.startsWith('@beatbax/')) return true;
  const bareRoot = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
  return FORBIDDEN_BARE_IMPORTS.has(bareRoot) || !spec.startsWith('@beatbax/engine');
}

/**
 * Walk the ESM relative import graph from entry and reject Node / forbidden bare imports.
 */
export function scanImportGraph(packageDir: string, entryAbsolutePath: string): void {
  const root = path.resolve(packageDir);
  const queue = [entryAbsolutePath];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const current = queue.pop()!;
    const resolvedCurrent = path.resolve(current);
    if (seen.has(resolvedCurrent)) continue;
    seen.add(resolvedCurrent);

    if (!resolvedCurrent.startsWith(root + path.sep) && resolvedCurrent !== root) {
      throw new Error(`Import graph escapes package directory at ${resolvedCurrent}`);
    }
    if (!existsSync(resolvedCurrent) || !statSync(resolvedCurrent).isFile()) {
      throw new Error(`Missing module in import graph: ${resolvedCurrent}`);
    }

    const source = readFileSync(resolvedCurrent, 'utf8');
    for (const spec of extractModuleSpecifiers(source)) {
      if (isRelativeSpecifier(spec)) {
        const target = resolveRelativeModule(path.dirname(resolvedCurrent), spec);
        if (target) queue.push(target);
        continue;
      }
      if (isEngineSpecifier(spec)) {
        assertSupportedEngineSpecifier(spec, path.relative(root, resolvedCurrent));
        continue;
      }
      if (spec.startsWith('node:') || isForbiddenBareSpecifier(spec)) {
        // Avoid embedding `import "..."` — electron-vite ESMStaticImportRe false-positives on that.
        throw new Error(
          'Forbidden module specifier ' +
            JSON.stringify(spec) +
            ' in ' +
            path.relative(root, resolvedCurrent) +
            '. Desktop plugins may only use relative imports and @beatbax/engine (not @beatbax/engine/node).'
        );
      }
      throw new Error(
        'Unsupported bare module specifier ' +
          JSON.stringify(spec) +
          ' in ' +
          path.relative(root, resolvedCurrent) +
          '. Only relative paths and @beatbax/engine subpaths are allowed.'
      );
    }
  }
}

function resolveRelativeModule(fromDir: string, spec: string): string | null {
  const raw = path.resolve(fromDir, spec);
  const candidates = [
    raw,
    `${raw}.js`,
    `${raw}.mjs`,
    `${raw}.cjs`,
    path.join(raw, 'index.js'),
    path.join(raw, 'index.mjs'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  // TypeScript sources are not expected in a built package; missing relative is an error at scan time.
  // Do not embed `import "..."` in this message — electron-vite's ESM shim plugin
  // (ESMStaticImportRe) treats that as a real static import and injects CJS shims mid-string.
  throw new Error(
    'Cannot resolve relative module specifier ' + JSON.stringify(spec) + ' (base: ' + fromDir + ')'
  );
}

export function assertChipPluginShape(plugin: unknown): asserts plugin is {
  name: string;
  createChannel: (...args: unknown[]) => unknown;
  aliases?: string[];
} {
  if (!plugin || typeof plugin !== 'object') {
    throw new Error('Plugin default export must be a ChipPlugin object.');
  }
  const record = plugin as Record<string, unknown>;
  if (typeof record.name !== 'string' || !record.name.trim()) {
    throw new Error('ChipPlugin must have a non-empty string name.');
  }
  if (typeof record.createChannel !== 'function') {
    throw new Error('ChipPlugin must have a createChannel function.');
  }
}

export function collectChipNames(plugin: { name: string; aliases?: string[] }): string[] {
  const names = [plugin.name.trim().toLowerCase()];
  for (const alias of plugin.aliases ?? []) {
    if (typeof alias === 'string' && alias.trim()) {
      names.push(alias.trim().toLowerCase());
    }
  }
  return [...new Set(names)];
}

export function assertNoChipNameCollision(
  chipNames: string[],
  options: {
    reservedNames?: Set<string>;
    otherUserChipNames?: Iterable<string>;
  } = {}
): void {
  const reserved = options.reservedNames ?? RESERVED_CHIP_NAMES;
  const others = new Set(
    [...(options.otherUserChipNames ?? [])].map((n) => n.trim().toLowerCase()).filter(Boolean)
  );

  for (const name of chipNames) {
    const lower = name.toLowerCase();
    if (reserved.has(lower)) {
      throw new Error(`Chip name "${name}" collides with a built-in or pre-bundled chip.`);
    }
    if (others.has(lower)) {
      throw new Error(`Chip name "${name}" collides with another installed user chip plugin.`);
    }
  }
}

/** List files under a directory for copy (excludes node_modules). */
export function listPackageFilesForCopy(packageDir: string): string[] {
  const root = path.resolve(packageDir);
  const files: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        files.push(path.relative(root, full));
      }
    }
  }

  walk(root);
  return files;
}
