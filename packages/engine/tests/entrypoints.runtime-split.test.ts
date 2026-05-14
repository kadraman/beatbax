import { readFileSync } from 'fs';
import { resolve as resolvePath } from 'path';

const forbiddenSpecifiers = [
  'fs',
  'fs/promises',
  'http',
  'path',
  'url',
  'child_process',
  'node:fs',
  'node:fs/promises',
  'node:http',
  'node:path',
  'node:url',
  'node:child_process',
];

const EXPORT_FROM_PATTERN = /export\s+(?:\*|\{[\s\S]*?\})\s+from\s+['\"]([^'\"]+)['\"]/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasForbiddenSpecifier(source: string): boolean {
  return forbiddenSpecifiers.some((specifier) => {
    const escapedSpecifier = escapeRegExp(specifier);
    const staticImportPattern = new RegExp(`from ['\"]${escapedSpecifier}['\"]`);
    const dynamicImportPattern = new RegExp(`import\\(['\"]${escapedSpecifier}['\"]\\)`);
    return staticImportPattern.test(source) || dynamicImportPattern.test(source);
  });
}

function getForbiddenSpecifiers(source: string): string[] {
  return forbiddenSpecifiers.filter((specifier) => {
    const escapedSpecifier = escapeRegExp(specifier);
    const staticImportPattern = new RegExp(`from ['\"]${escapedSpecifier}['\"]`);
    const dynamicImportPattern = new RegExp(`import\\(['\"]${escapedSpecifier}['\"]\\)`);
    return staticImportPattern.test(source) || dynamicImportPattern.test(source);
  });
}

function resolveReExportTarget(filePath: string, specifier: string): string {
  return resolvePath(filePath, '..', specifier.replace(/\.js$/u, '.ts'));
}

function collectReExportGraph(entryFilePath: string): Set<string> {
  const visited = new Set<string>();
  const queue = [entryFilePath];

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current || visited.has(current)) continue;

    visited.add(current);
    const source = readFileSync(current, 'utf8');

    for (const match of source.matchAll(EXPORT_FROM_PATTERN)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue;

      const nextFile = resolveReExportTarget(current, specifier);
      if (!visited.has(nextFile)) queue.push(nextFile);
    }
  }

  return visited;
}

const ALLOWED_NODE_DEPENDENT_REEXPORT_FILES = new Set<string>([
  // Legacy root export surface currently includes readUGEFile via import barrel.
  resolvePath(__dirname, '../src/import/uge/uge.reader.ts'),
]);

describe('engine runtime entrypoints', () => {
  test('root entry does not import Node built-ins', () => {
    const rootEntrySource = readFileSync(resolvePath(__dirname, '../src/index.ts'), 'utf8');
    expect(hasForbiddenSpecifier(rootEntrySource)).toBe(false);
  });

  test('root re-export graph has no unexpected Node built-ins', () => {
    const rootEntryPath = resolvePath(__dirname, '../src/index.ts');
    const reExportGraph = collectReExportGraph(rootEntryPath);
    const offenders: string[] = [];

    for (const filePath of reExportGraph) {
      const source = readFileSync(filePath, 'utf8');
      const matchedSpecifiers = getForbiddenSpecifiers(source);
      if (matchedSpecifiers.length > 0 && !ALLOWED_NODE_DEPENDENT_REEXPORT_FILES.has(filePath)) {
        offenders.push(`${filePath}: ${matchedSpecifiers.join(', ')}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  test('root entry does not export node-only play helpers', () => {
    const rootEntrySource = readFileSync(resolvePath(__dirname, '../src/index.ts'), 'utf8');

    expect(rootEntrySource).not.toMatch(/\bplayFile\b/);
    expect(rootEntrySource).not.toMatch(/\bwaitForDirectory\b/);
    expect(rootEntrySource).not.toMatch(/\bwaitForViteServer\b/);
  });

  test('node entry exports play helpers', () => {
    const nodeEntrySource = readFileSync(resolvePath(__dirname, '../src/node/index.ts'), 'utf8');
    expect(nodeEntrySource).toMatch(/playFile/);
    expect(nodeEntrySource).toMatch(/waitForDirectory/);
    expect(nodeEntrySource).toMatch(/waitForViteServer/);
  });
});
