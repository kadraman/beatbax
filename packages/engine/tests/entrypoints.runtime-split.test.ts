import { readFileSync } from 'fs';
import { resolve as resolvePath } from 'path';
import { playFile, waitForDirectory, waitForViteServer } from '../src/node/index';

describe('engine runtime entrypoints', () => {
  test('root entry does not import Node built-ins', () => {
    const rootEntrySource = readFileSync(resolvePath(__dirname, '../src/index.ts'), 'utf8');
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

    for (const specifier of forbiddenSpecifiers) {
      const staticImportPattern = new RegExp(`from ['"]${specifier}['"]`);
      const dynamicImportPattern = new RegExp(`import\\(['"]${specifier}['"]\\)`);
      expect(rootEntrySource).not.toMatch(staticImportPattern);
      expect(rootEntrySource).not.toMatch(dynamicImportPattern);
    }
  });

  test('node entry exports play helpers', () => {
    expect(typeof playFile).toBe('function');
    expect(typeof waitForDirectory).toBe('function');
    expect(typeof waitForViteServer).toBe('function');
  });
});
