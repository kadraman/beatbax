import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..', '..');

test('desktop shell renders editor chrome', async () => {
  test.setTimeout(60_000);
  const electronApp = await electron.launch({
    args: [appRoot],
    cwd: appRoot,
  });

  const page = await electronApp.firstWindow();
  await expect(page.locator('.status-document-name')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open', exact: true })).toBeVisible();
  await expect.poll(() => page.locator('.bb-toolbar svg').count()).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.locator('#tb-status')).toContainText(/Verifying|Verified/);
  await expect(page.locator('#output-pane').getByText('Verification passed')).toBeVisible({ timeout: 15_000 });

  await electronApp.close();
});
