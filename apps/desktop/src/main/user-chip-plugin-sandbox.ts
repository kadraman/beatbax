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

const DEFAULT_VALIDATION_TIMEOUT_MS = 20_000;

function resolveValidationTimeoutMs(explicit?: number): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  const fromEnv = Number(process.env.BEATBAX_PLUGIN_VALIDATE_TIMEOUT_MS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return DEFAULT_VALIDATION_TIMEOUT_MS;
}

export async function loadPluginShapeInSandbox(options: {
  packageDir: string;
  entryRelativePath: string;
  /** Override the main-process validation watchdog (ms). */
  timeoutMs?: number;
}): Promise<PluginShape> {
  const token = randomBytes(16).toString('hex');
  setUserChipPluginValidationRoot(token, options.packageDir);
  const entryUrl = buildUserChipPluginEntryUrl(token, options.entryRelativePath);
  const pageUrl = `${USER_CHIP_HOST_SCHEME}://${SANDBOX_VALIDATE_HOST}/?entry=${encodeURIComponent(entryUrl)}`;
  const logs: string[] = [];
  const timeoutMs = resolveValidationTimeoutMs(options.timeoutMs);
  let watchdog: ReturnType<typeof setTimeout> | undefined;

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

    const detailSuffix = () => (logs.length ? ` Console: ${logs.slice(-8).join(' | ')}` : '');
    const timeoutPromise = new Promise<never>((_, reject) => {
      watchdog = setTimeout(() => {
        reject(new Error(`Plugin validation timed out in the sandboxed renderer.${detailSuffix()}`));
      }, timeoutMs);
    });

    const validatePromise = (async (): Promise<SandboxValidateResult> => {
      await win.loadURL(pageUrl);
      const deadline = Date.now() + timeoutMs;
      let result: SandboxValidateResult | null = null;
      while (Date.now() < deadline) {
        if (win.isDestroyed()) {
          throw new Error(`Plugin validation window was destroyed.${detailSuffix()}`);
        }
        result = (await win.webContents.executeJavaScript(
          'globalThis.__BEATBAX_PLUGIN_VALIDATE_RESULT__ ?? null'
        )) as SandboxValidateResult | null;
        if (result) return result;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(`Plugin validation timed out in the sandboxed renderer.${detailSuffix()}`);
    })();
    // If the watchdog wins, destroy() may reject a hung executeJavaScript — ignore it.
    void validatePromise.catch(() => undefined);

    const result = await Promise.race([validatePromise, timeoutPromise]);
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
    if (watchdog) clearTimeout(watchdog);
    setUserChipPluginValidationRoot(token, null);
    if (!win.isDestroyed()) win.destroy();
  }
}
