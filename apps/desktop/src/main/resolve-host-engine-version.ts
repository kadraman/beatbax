import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

type EnginePackageJson = {
  name?: string;
  version?: string;
};

/**
 * Resolve the host `@beatbax/engine` version from on-disk package.json files.
 *
 * Do not use `require.resolve('@beatbax/engine/package.json')`: engine's
 * `exports["./*"]` maps that to `dist/package.json.js` and fails.
 */
export function resolveHostEngineVersion(searchRoots: readonly string[]): string {
  const relativePaths: string[] = [];
  // Cover electron-vite layouts such as apps/desktop/out/main (4 levels under repo root).
  for (let up = 0; up <= 5; up += 1) {
    const prefix = Array.from({ length: up }, () => '..');
    relativePaths.push(path.join(...prefix, 'node_modules', '@beatbax', 'engine', 'package.json'));
    relativePaths.push(path.join(...prefix, 'packages', 'engine', 'package.json'));
  }

  const seen = new Set<string>();
  for (const root of searchRoots) {
    if (!root || typeof root !== 'string') continue;
    for (const relative of relativePaths) {
      const candidate = path.resolve(root, relative);
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      const version = readEngineVersion(candidate);
      if (version) return version;
    }
  }

  throw new Error(
    'Could not resolve host @beatbax/engine version for plugin peer checks. Reinstall Desktop dependencies or report this as a bug.'
  );
}

function readEngineVersion(packageJsonPath: string): string | null {
  try {
    if (!existsSync(packageJsonPath)) return null;
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as EnginePackageJson;
    if (pkg.name !== '@beatbax/engine') return null;
    if (typeof pkg.version !== 'string' || !pkg.version.trim()) return null;
    // Ignore install-time stubs written into user plugin staging dirs.
    if (pkg.version.includes('desktop-stub')) return null;
    return pkg.version.trim();
  } catch {
    return null;
  }
}
