import { expect, _electron as electron } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const appRoot = path.resolve(__dirname, '..', '..');
export const sampleSongPath = path.resolve(appRoot, '..', '..', 'songs', 'sample.bax');

/**
 * Launch Desktop with an isolated userData dir so e2e does not read/write the
 * developer's real BeatBax settings (e.g. remote host allowlist).
 */
export async function launchDesktopApp(
  extraArgs: string[] = [],
  extraEnv: Record<string, string> = {},
) {
  const consoleErrors: string[] = [];
  const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'beatbax-e2e-userdata-'));
  const electronApp = await electron.launch({
    args: [
      `--user-data-dir=${userDataDir}`,
      appRoot,
      ...extraArgs,
    ],
    cwd: appRoot,
    env: {
      ...process.env,
      BEATBAX_E2E_AI_KEY_STORE: 'memory',
      ...extraEnv,
    },
  });

  const page = await electronApp.firstWindow();
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  await expect(page.locator('.status-document-name')).toBeVisible({ timeout: 15_000 });

  // Fresh userData triggers the first-run New Song Wizard; dismiss so tests can click the UI.
  const wizard = page.getByRole('dialog', { name: 'New Song Wizard' });
  const wizardShown = await wizard
    .waitFor({ state: 'visible', timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  if (wizardShown) {
    await page.getByRole('button', { name: /^Cancel$/i }).click();
    await expect(wizard).toBeHidden({ timeout: 5_000 });
  }

  const closeApp = electronApp.close.bind(electronApp);
  electronApp.close = (async () => {
    try {
      await closeApp();
    } finally {
      rmSync(userDataDir, { recursive: true, force: true });
    }
  }) as typeof electronApp.close;

  return { electronApp, page, consoleErrors };
}
