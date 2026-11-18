/** @jest-environment node */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildUserChipPluginEntryUrl,
  resolvePluginProtocolPath,
  USER_CHIP_PLUGIN_SCHEME,
} from '../src/main/user-chip-plugin-protocol';
import { chipPluginsRoot } from '../src/main/user-chip-plugin-manifest';

describe('user-chip-plugin-protocol', () => {
  let userData: string;

  beforeEach(() => {
    userData = mkdtempSync(path.join(tmpdir(), 'bb-chip-proto-'));
    const installDir = path.join(chipPluginsRoot(userData), 'beatbax-plugin-chip-demo');
    mkdirSync(path.join(installDir, 'dist'), { recursive: true });
    writeFileSync(path.join(installDir, 'dist', 'index.js'), 'export default {};\n', 'utf8');
  });

  afterEach(() => {
    rmSync(userData, { recursive: true, force: true });
  });

  it('builds entry URLs', () => {
    expect(buildUserChipPluginEntryUrl('beatbax-plugin-chip-demo', 'dist/index.js')).toBe(
      `${USER_CHIP_PLUGIN_SCHEME}://beatbax-plugin-chip-demo/dist/index.js`
    );
  });

  it('resolves safe paths under chip-plugins', () => {
    const absolute = resolvePluginProtocolPath(
      `${USER_CHIP_PLUGIN_SCHEME}://beatbax-plugin-chip-demo/dist/index.js`,
      userData
    );
    expect(absolute.replace(/\\/g, '/')).toContain('/chip-plugins/beatbax-plugin-chip-demo/dist/index.js');
  });

  it('rejects invalid install ids (URL host)', () => {
    expect(() =>
      resolvePluginProtocolPath(`${USER_CHIP_PLUGIN_SCHEME}://../dist/index.js`, userData)
    ).toThrow(/Invalid plugin install id/);
  });

  it('keeps URL-normalized relative paths inside the install directory', () => {
    // WHATWG URL collapses ".." before our handler runs; result must still stay under installId.
    const absolute = resolvePluginProtocolPath(
      `${USER_CHIP_PLUGIN_SCHEME}://beatbax-plugin-chip-demo/foo/../dist/index.js`,
      userData
    );
    expect(absolute.replace(/\\/g, '/')).toMatch(
      /\/chip-plugins\/beatbax-plugin-chip-demo\/dist\/index\.js$/
    );
  });
});
