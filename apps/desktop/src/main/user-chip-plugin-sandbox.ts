/**
 * Execute a user chip plugin entry inside a sandboxed renderer (spec 111).
 * Node integration is off and there is no preload. The main process only reads
 * the resulting name / aliases.
 */

import { randomBytes } from 'node:crypto';
import { BrowserWindow } from 'electron';
import {
  USER_CHIP_HOST_SCHEME,
  buildUserChipPluginEntryUrl,
  setUserChipPluginValidationRoot,
} from './user-chip-plugin-protocol';
import { SANDBOX_VALIDATE_HOST } from './user-chip-plugin-engine-api';

export interface PluginShape {
  name: string;
  aliases: string[];
}

interface SandboxValidateResult {
  ok: boolean;
  name?: string | null;
  aliases?: string[];
  hasCreateChannel?: boolean;
  isObject?: boolean;
  error?: string;
}

export async function loadPluginShapeInSandbox(options: {
  packageDir: string;
  entryRelativePath: string;
}): Promise<PluginShape> {
  const token = randomBytes(16).toString('hex');
  setUserChipPluginValidationRoot(token, options.packageDir);
  const entryUrl = buildUserChipPluginEntryUrl(token, options.entryRelativePath);
  const pageUrl = `${USER_CHIP_HOST_SCHEME}://${SANDBOX_VALIDATE_HOST}/?entry=${encodeURIComponent(entryUrl)}`;
  const logs: string[] = [];

  const win = new BrowserWindow({
    show: false,
    skipTaskbar: true,
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      webSecurity: true,
      backgroundThrottling: false,
    },
  });

  try {
    win.webContents.setBackgroundThrottling(false);
    win.webContents.on('console-message', (_event, _level, message) => {
      logs.push(message);
    });
    win.webContents.on('did-fail-load', (_event, code, description, url) => {
      logs.push(`did-fail-load ${code} ${description} ${url}`);
    });

    await win.loadURL(pageUrl);
    const deadline = Date.now() + 20_000;
    let result: SandboxValidateResult | null = null;
    while (Date.now() < deadline) {
      result = (await win.webContents.executeJavaScript(
        'globalThis.__BEATBAX_PLUGIN_VALIDATE_RESULT__ ?? null'
      )) as SandboxValidateResult | null;
      if (result) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    if (!result) {
      const detail = logs.length ? ` Console: ${logs.slice(-8).join(' | ')}` : '';
      throw new Error(`Plugin validation timed out in the sandboxed renderer.${detail}`);
    }
    if (!result.ok) {
      throw new Error(result.error || 'Plugin validation failed.');
    }
    if (!result.isObject) {
      throw new Error('Plugin default export must be a ChipPlugin object.');
    }
    if (typeof result.name !== 'string' || !result.name.trim()) {
      throw new Error('ChipPlugin must have a non-empty string name.');
    }
    if (!result.hasCreateChannel) {
      throw new Error('ChipPlugin must have a createChannel function.');
    }
    const aliases = Array.isArray(result.aliases)
      ? result.aliases.filter((alias): alias is string => typeof alias === 'string' && Boolean(alias.trim()))
      : [];
    return { name: result.name, aliases };
  } finally {
    setUserChipPluginValidationRoot(token, null);
    if (!win.isDestroyed()) win.destroy();
  }
}
