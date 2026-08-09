/** @jest-environment node */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { version as cliVersion } from '../src/version';

describe('cli version', () => {
  it('stays in sync with packages/cli/package.json', () => {
    const pkgVersion = (
      JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')) as { version: string }
    ).version;
    expect(cliVersion).toBe(pkgVersion);
  });
});
