/**
 * Privileged protocols for Desktop user chip plugins (spec 111).
 *
 * - beatbax-plugin: serves files under userData/chip-plugins only
 * - beatbax-host: serves bridge modules that re-export the renderer host engine
 */

import { app, protocol, net } from 'electron';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chipPluginsRoot } from './user-chip-plugin-manifest';

export const USER_CHIP_PLUGIN_SCHEME = 'beatbax-plugin';
export const USER_CHIP_HOST_SCHEME = 'beatbax-host';

const HOST_BRIDGE_MODULES: Record<string, string> = {
  root: `const ns = globalThis.__BEATBAX_ENGINE_HOST__.root;
export const BeatBaxEngine = ns.BeatBaxEngine;
export default ns.default ?? ns;
`,
  chips: `const ns = globalThis.__BEATBAX_ENGINE_HOST__.chips;
export const chipRegistry = ns.chipRegistry;
export const gameboyPlugin = ns.gameboyPlugin;
export const nesPlugin = ns.nesPlugin;
export default ns.default ?? ns;
`,
  parser: `const ns = globalThis.__BEATBAX_ENGINE_HOST__.parser;
export default ns.default ?? ns;
export const parseWithPeggy = ns.parseWithPeggy;
`,
  'util-music': `const ns = globalThis.__BEATBAX_ENGINE_HOST__['util/music'];
export default ns.default ?? ns;
`,
  audio: `const ns = globalThis.__BEATBAX_ENGINE_HOST__.audio;
export default ns.default ?? ns;
`,
  export: `const ns = globalThis.__BEATBAX_ENGINE_HOST__.export;
export default ns.default ?? ns;
`,
  instruments: `const ns = globalThis.__BEATBAX_ENGINE_HOST__.instruments;
export default ns.default ?? ns;
`,
  patterns: `const ns = globalThis.__BEATBAX_ENGINE_HOST__.patterns;
export default ns.default ?? ns;
`,
  sequences: `const ns = globalThis.__BEATBAX_ENGINE_HOST__.sequences;
export default ns.default ?? ns;
`,
  scheduler: `const ns = globalThis.__BEATBAX_ENGINE_HOST__.scheduler;
export default ns.default ?? ns;
`,
  song: `const ns = globalThis.__BEATBAX_ENGINE_HOST__.song;
export default ns.default ?? ns;
`,
};

/** Call before app.ready. */
export function registerUserChipPluginSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: USER_CHIP_PLUGIN_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
    {
      scheme: USER_CHIP_HOST_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ]);
}

function mimeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.js':
    case '.mjs':
    case '.cjs':
      return 'text/javascript';
    case '.json':
      return 'application/json';
    case '.wasm':
      return 'application/wasm';
    case '.css':
      return 'text/css';
    case '.map':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}

const ENGINE_IMPORT_REWRITE: Array<{ from: RegExp; to: string }> = [
  { from: /(['"])@beatbax\/engine\/util\/music\1/g, to: `$1${USER_CHIP_HOST_SCHEME}://util-music$1` },
  { from: /(['"])@beatbax\/engine\/chips\1/g, to: `$1${USER_CHIP_HOST_SCHEME}://chips$1` },
  { from: /(['"])@beatbax\/engine\/parser\1/g, to: `$1${USER_CHIP_HOST_SCHEME}://parser$1` },
  { from: /(['"])@beatbax\/engine\/audio\1/g, to: `$1${USER_CHIP_HOST_SCHEME}://audio$1` },
  { from: /(['"])@beatbax\/engine\/export\1/g, to: `$1${USER_CHIP_HOST_SCHEME}://export$1` },
  { from: /(['"])@beatbax\/engine\/instruments\1/g, to: `$1${USER_CHIP_HOST_SCHEME}://instruments$1` },
  { from: /(['"])@beatbax\/engine\/patterns\1/g, to: `$1${USER_CHIP_HOST_SCHEME}://patterns$1` },
  { from: /(['"])@beatbax\/engine\/sequences\1/g, to: `$1${USER_CHIP_HOST_SCHEME}://sequences$1` },
  { from: /(['"])@beatbax\/engine\/scheduler\1/g, to: `$1${USER_CHIP_HOST_SCHEME}://scheduler$1` },
  { from: /(['"])@beatbax\/engine\/song\1/g, to: `$1${USER_CHIP_HOST_SCHEME}://song$1` },
  { from: /(['"])@beatbax\/engine\1/g, to: `$1${USER_CHIP_HOST_SCHEME}://root$1` },
];

function rewriteEngineImports(source: string): string {
  let out = source;
  for (const rule of ENGINE_IMPORT_REWRITE) {
    out = out.replace(rule.from, rule.to);
  }
  return out;
}

/**
 * Resolve beatbax-plugin://<installId>/<relative...> to an absolute file under chip-plugins.
 * Rejects path traversal.
 */
export function resolvePluginProtocolPath(requestUrl: string, userDataPath: string): string {
  const url = new URL(requestUrl);
  if (url.protocol !== `${USER_CHIP_PLUGIN_SCHEME}:`) {
    throw new Error('Unexpected protocol');
  }
  // With standard: true → beatbax-plugin://installId/rel/path
  const installId = decodeURIComponent(url.hostname || '');
  if (!installId || installId.includes('..') || installId.includes('/') || installId.includes('\\')) {
    throw new Error('Invalid plugin install id in URL.');
  }
  const relative = decodeURIComponent(url.pathname.replace(/^\/+/, '')).replace(/\\/g, '/');
  if (!relative || relative.split('/').some((seg) => seg === '..' || seg === '')) {
    throw new Error('Invalid plugin path.');
  }

  const root = path.resolve(chipPluginsRoot(userDataPath));
  const installRoot = path.resolve(root, installId);
  const absolute = path.resolve(installRoot, relative);
  const rootPrefix = root.endsWith(path.sep) ? root : root + path.sep;
  const installPrefix = installRoot.endsWith(path.sep) ? installRoot : installRoot + path.sep;
  if (!absolute.startsWith(rootPrefix) || !absolute.startsWith(installPrefix)) {
    throw new Error('Path traversal is not allowed.');
  }
  return absolute;
}

export function buildUserChipPluginEntryUrl(installId: string, entryRelativePath: string): string {
  const rel = entryRelativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  return `${USER_CHIP_PLUGIN_SCHEME}://${encodeURIComponent(installId)}/${rel.split('/').map(encodeURIComponent).join('/')}`;
}

/** Call after app.ready. */
export function handleUserChipPluginProtocols(getUserDataPath: () => string = () => app.getPath('userData')): void {
  protocol.handle(USER_CHIP_HOST_SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      const key = decodeURIComponent(url.hostname || url.pathname.replace(/^\/+/, ''));
      const body = HOST_BRIDGE_MODULES[key];
      if (!body) {
        return new Response(`Unknown host bridge "${key}"`, { status: 404 });
      }
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'text/javascript; charset=utf-8',
          'Cache-Control': 'no-cache',
        },
      });
    } catch (error) {
      return new Response(error instanceof Error ? error.message : String(error), { status: 500 });
    }
  });

  protocol.handle(USER_CHIP_PLUGIN_SCHEME, async (request) => {
    try {
      const absolute = resolvePluginProtocolPath(request.url, getUserDataPath());
      if (!existsSync(absolute) || !statSync(absolute).isFile()) {
        return new Response('Not found', { status: 404 });
      }
      const mime = mimeForPath(absolute);
      if (mime === 'text/javascript') {
        const source = readFileSync(absolute, 'utf8');
        const rewritten = rewriteEngineImports(source);
        return new Response(rewritten, {
          status: 200,
          headers: {
            'Content-Type': 'text/javascript; charset=utf-8',
            'Cache-Control': 'no-cache',
          },
        });
      }
      // Non-JS: serve via file URL through net.fetch for streaming binary
      return net.fetch(pathToFileURL(absolute).href);
    } catch (error) {
      return new Response(error instanceof Error ? error.message : String(error), { status: 400 });
    }
  });
}
