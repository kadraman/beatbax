import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..', '..');

test('desktop shell renders editor chrome', async () => {
  const electronApp = await electron.launch({
    args: [appRoot],
    cwd: appRoot,
  });

  const page = await electronApp.firstWindow();
  await expect(page.locator('.status-document-name')).toBeVisible();
  await expect(page.getByRole('button', { name: /Open/i })).toBeVisible();

  await electronApp.close();
});
