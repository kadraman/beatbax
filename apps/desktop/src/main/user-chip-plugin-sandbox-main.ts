/**
 * Electron main for install-time plugin shape checks.
 * Started only when the caller is not already inside Electron (Jest).
 * The plugin entry runs in a sandboxed BrowserWindow, not in this process.
 */

import { app } from 'electron';
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { handleUserChipPluginProtocols, registerUserChipPluginSchemes } from './user-chip-plugin-protocol';
import { loadPluginShapeInSandbox } from './user-chip-plugin-sandbox';
import { getValidationEngineHostSource } from './user-chip-plugin-validation-host';

const dir = process.env.BEATBAX_VALIDATE_DIR;
if (!dir) {
  process.stderr.write('BEATBAX_VALIDATE_DIR is required\n');
  process.exit(1);
}

app.setName('beatbax-plugin-sandbox-validate');
app.setPath('userData', path.join(dir, 'userData'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
if (
  process.env.BEATBAX_ELECTRON_HEADLESS === '1' ||
  (process.platform === 'linux' && !process.env.DISPLAY)
) {
  app.commandLine.appendSwitch('ozone-platform', 'headless');
}
registerUserChipPluginSchemes();

app.on('window-all-closed', () => {
  // Stay alive between validation requests.
});

app.whenReady().then(async () => {
  handleUserChipPluginProtocols(() => dir);
  // Warm the host bundle from BEATBAX_VALIDATION_ENGINE_HOST / resources before
  // accepting requests so the first BrowserWindow import does not block main.
  try {
    await getValidationEngineHostSource();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Failed to load validation engine host: ${message}\n`);
    process.exit(1);
  }
  writeFileSync(path.join(dir, 'ready'), '1');
  let busy = false;
  setInterval(() => {
    if (busy) return;
    const reqPath = path.join(dir, 'request.json');
    if (!existsSync(reqPath)) return;
    busy = true;
    void (async () => {
      let payload: { id?: string; ok: boolean; name?: string; aliases?: string[]; error?: string };
      let requestId: string | undefined;
      try {
        const raw = readFileSync(reqPath, 'utf8');
        unlinkSync(reqPath);
        const req = JSON.parse(raw) as { id?: string; packageDir: string; entryRelativePath: string };
        requestId = req.id;
        const shape = await loadPluginShapeInSandbox(req);
        payload = { ok: true, id: req.id, name: shape.name, aliases: shape.aliases };
      } catch (error) {
        payload = {
          ok: false,
          id: requestId,
          error: error instanceof Error ? error.message : String(error),
        };
        try {
          if (existsSync(reqPath)) unlinkSync(reqPath);
        } catch {
          // already removed
        }
      }
      const resTmp = path.join(dir, 'response.json.tmp');
      writeFileSync(resTmp, JSON.stringify(payload));
      renameSync(resTmp, path.join(dir, 'response.json'));
      busy = false;
    })().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      const resTmp = path.join(dir, 'response.json.tmp');
      writeFileSync(resTmp, JSON.stringify({ ok: false, error: message }));
      renameSync(resTmp, path.join(dir, 'response.json'));
      busy = false;
    });
  }, 20);
});
