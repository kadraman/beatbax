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
import {
  ENGINE_BRIDGE_MODULES,
  SANDBOX_VALIDATE_HOST,
  buildSandboxValidationHtml,
  buildSandboxValidationScript,
  hostBridgeSources,
} from './user-chip-plugin-engine-api';

export const USER_CHIP_PLUGIN_SCHEME = 'beatbax-plugin';
export const USER_CHIP_HOST_SCHEME = 'beatbax-host';

/** Cross-origin module scripts fail without this header, even when the scheme is corsEnabled. */
export const USER_CHIP_MODULE_RESPONSE_HEADERS = {
  'Content-Type': 'text/javascript; charset=utf-8',
  'Cache-Control': 'no-cache',
  'Access-Control-Allow-Origin': '*',
} as const;

const HOST_BRIDGE_MODULES: Record<string, string> = hostBridgeSources();

/** Install-time shape checks serve a not-yet-installed package under a one-shot id. */
const validationRoots = new Map<string, string>();

export function setUserChipPluginValidationRoot(installId: string, packageDir: string | null): void {
  if (!installId || installId.includes('..') || installId.includes('/') || installId.includes('\\')) {
    throw new Error('Invalid validation install id.');
  }
  if (packageDir) validationRoots.set(installId, path.resolve(packageDir));
  else validationRoots.delete(installId);
}

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Longer specifiers first so `@beatbax/engine/chips` is not rewritten as the root specifier. */
const ENGINE_IMPORT_REWRITE: Array<{ from: RegExp; to: string }> = [...ENGINE_BRIDGE_MODULES]
  .sort((a, b) => b.specifier.length - a.specifier.length)
  .map((mod) => ({
    from: new RegExp(`(['"])${escapeRegExp(mod.specifier)}\\1`, 'g'),
    to: `$1${USER_CHIP_HOST_SCHEME}://${mod.hostKey}$1`,
  }));

export function rewriteEngineImports(source: string): string {
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

  const validationRoot = validationRoots.get(installId);
  if (validationRoot) {
    const absolute = path.resolve(validationRoot, relative);
    const prefix = validationRoot.endsWith(path.sep) ? validationRoot : validationRoot + path.sep;
    if (absolute !== validationRoot && !absolute.startsWith(prefix)) {
      throw new Error('Path traversal is not allowed.');
    }
    return absolute;
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
      if (key === SANDBOX_VALIDATE_HOST) {
        const entry = url.searchParams.get('entry') ?? '';
        const pathname = url.pathname.replace(/\/+$/, '');
        if (pathname === '/run.js') {
          return new Response(buildSandboxValidationScript(), {
            status: 200,
            headers: USER_CHIP_MODULE_RESPONSE_HEADERS,
          });
        }
        try {
          return new Response(buildSandboxValidationHtml(entry, USER_CHIP_PLUGIN_SCHEME), {
            status: 200,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-cache',
              'Access-Control-Allow-Origin': '*',
            },
          });
        } catch (error) {
          return new Response(error instanceof Error ? error.message : String(error), {
            status: 400,
            headers: { 'Access-Control-Allow-Origin': '*' },
          });
        }
      }
      const body = HOST_BRIDGE_MODULES[key];
      if (!body) {
        return new Response(`Unknown host bridge "${key}"`, {
          status: 404,
          headers: { 'Access-Control-Allow-Origin': '*' },
        });
      }
      return new Response(body, {
        status: 200,
        headers: USER_CHIP_MODULE_RESPONSE_HEADERS,
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
          headers: USER_CHIP_MODULE_RESPONSE_HEADERS,
        });
      }
      // Non-JS: serve via file URL through net.fetch for streaming binary
      return net.fetch(pathToFileURL(absolute).href);
    } catch (error) {
      return new Response(error instanceof Error ? error.message : String(error), { status: 400 });
    }
  });
}
