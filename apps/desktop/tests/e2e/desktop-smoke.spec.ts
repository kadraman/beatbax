import { test, expect } from '@playwright/test';
import { launchDesktopApp } from './launch-desktop';

test('desktop shell renders editor chrome', async () => {
  test.setTimeout(60_000);
  const { electronApp, page } = await launchDesktopApp();

  await expect(page.locator('.status-document-name')).toBeVisible();
  await expect(page.locator('#tb-open')).toBeVisible();
  await expect.poll(() => page.locator('.bb-toolbar svg').count()).toBeGreaterThan(0);

  await page.locator('#tb-verify').click();
  await expect(page.locator('#tb-status')).toContainText(/Verifying|Verified/);
  await expect(page.locator('#output-pane').getByText('Verification passed')).toBeVisible({ timeout: 15_000 });

  await electronApp.close();
});
