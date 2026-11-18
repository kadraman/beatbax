/** @jest-environment node */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildUserChipPluginEntryUrl,
  resolvePluginProtocolPath,
  rewriteEngineImports,
  setUserChipPluginValidationRoot,
  USER_CHIP_MODULE_RESPONSE_HEADERS,
  USER_CHIP_PLUGIN_SCHEME,
} from '../src/main/user-chip-plugin-protocol';
import { hostBridgeSources } from '../src/main/user-chip-plugin-engine-api';
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

  it('serves a validation package root and rewrites engine imports to named host bridges', () => {
    const staging = mkdtempSync(path.join(tmpdir(), 'bb-chip-stage-'));
    try {
      setUserChipPluginValidationRoot('abc123', staging);
      const absolute = resolvePluginProtocolPath(
        `${USER_CHIP_PLUGIN_SCHEME}://abc123/dist/index.js`,
        userData
      );
      expect(absolute).toBe(path.join(staging, 'dist', 'index.js'));
      const bridges = hostBridgeSources();
      expect(bridges.chips).toContain('export const chipRegistry');
      expect(bridges.audio).toContain('export const Player');
      expect(bridges.export).toContain('__BEATBAX_ENGINE_HOST__["export"]');
      expect(bridges['util-music']).toContain('export const noteToMidi');
      expect(rewriteEngineImports(`import { chipRegistry } from '@beatbax/engine/chips';`)).toBe(
        `import { chipRegistry } from 'beatbax-host://chips';`
      );
      expect(USER_CHIP_MODULE_RESPONSE_HEADERS['Access-Control-Allow-Origin']).toBe('*');
    } finally {
      setUserChipPluginValidationRoot('abc123', null);
      rmSync(staging, { recursive: true, force: true });
    }
  });
});
