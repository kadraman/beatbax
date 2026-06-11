import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..', '..');
const sampleSongPath = path.resolve(appRoot, '..', '..', 'songs', 'sample.bax');

async function launchDesktopApp(extraArgs: string[] = []) {
  const consoleErrors: string[] = [];
  const electronApp = await electron.launch({
    args: [appRoot, ...extraArgs],
    cwd: appRoot,
  });

  const page = await electronApp.firstWindow();
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  await expect(page.locator('.status-document-name')).toBeVisible({ timeout: 15_000 });
  return { electronApp, page, consoleErrors };
}

function filterBenignConsoleErrors(lines: string[]): string[] {
  return lines.filter((line) =>
    !line.includes('Autofill')
    && !line.includes('DevTools')
    && !line.includes('ERR_FILE_NOT_FOUND'),
  );
}

test('loads a .bax file passed on startup', async () => {
  test.setTimeout(60_000);
  const sampleContent = readFileSync(sampleSongPath, 'utf8');
  const { electronApp, page } = await launchDesktopApp([sampleSongPath]);

  await expect(page.locator('.status-document-name')).toHaveText('sample.bax', { timeout: 15_000 });
  await expect(page.locator('.monaco-editor')).toContainText('chip gameboy', { timeout: 15_000 });
  await expect(page.locator('.monaco-editor')).toContainText('Sample Song', { timeout: 15_000 });

  await electronApp.close();
  expect(sampleContent.length).toBeGreaterThan(0);
});

test('exports JSON without runtime errors', async () => {
  test.setTimeout(60_000);
  const { electronApp, page, consoleErrors } = await launchDesktopApp();

  await page.locator('[data-format="json"]').click();
  await page.locator('.output-tab[data-tab="output"], button:has-text("Output")').first().click();

  await expect(page.getByText(/Exported .*\.json/i).first()).toBeVisible({ timeout: 20_000 });

  expect(filterBenignConsoleErrors(consoleErrors)).toEqual([]);

  await electronApp.close();
});

test('plays the starter song without console errors', async () => {
  test.setTimeout(60_000);
  const { electronApp, page, consoleErrors } = await launchDesktopApp();

  await page.getByRole('button', { name: /Play current song/i }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /Stop playback/i }).click();

  expect(filterBenignConsoleErrors(consoleErrors)).toEqual([]);

  await electronApp.close();
});

test('transport loop and live controls are wired', async () => {
  test.setTimeout(60_000);
  const { electronApp, page } = await launchDesktopApp();

  const loopButton = page.getByRole('button', { name: /Toggle loop playback/i });
  const liveButton = page.getByRole('button', { name: /Toggle live-play mode/i });
  const rewindButton = page.getByRole('button', { name: /Rewind to start/i });

  await expect(loopButton).toBeVisible();
  await expect(liveButton).toBeVisible();
  await expect(rewindButton).toBeVisible();

  const loopTitleBefore = await loopButton.getAttribute('title');
  await loopButton.click();
  await expect(loopButton).not.toHaveAttribute('title', loopTitleBefore ?? '');

  const liveTitleBefore = await liveButton.getAttribute('title');
  await liveButton.click();
  await expect(liveButton).not.toHaveAttribute('title', liveTitleBefore ?? '');

  await electronApp.close();
});

test('saves edits back to an opened .bax file', async () => {
  test.setTimeout(60_000);
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'beatbax-e2e-save-'));
  const songPath = path.join(tempDir, 'save-test.bax');
  const original = readFileSync(sampleSongPath, 'utf8');
  writeFileSync(songPath, original, 'utf8');

  const { electronApp, page } = await launchDesktopApp([songPath]);
  await expect(page.locator('.status-document-name')).toHaveText('save-test.bax', { timeout: 15_000 });

  const marker = `// save-marker-${Date.now()}`;
  await page.locator('.monaco-editor').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(marker);

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+S' : 'Control+S');
  await page.waitForTimeout(1500);

  expect(readFileSync(songPath, 'utf8')).toContain(marker);

  await electronApp.close();
  rmSync(tempDir, { recursive: true, force: true });
});
