import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';

const appRoot = path.resolve(__dirname, '..', '..');

test('desktop shell renders editor chrome', async () => {
  const electronApp = await electron.launch({
    args: [appRoot],
    cwd: appRoot,
  });

  const page = await electronApp.firstWindow();
  await expect(page.getByText('BeatBax Desktop')).toBeVisible();
  await expect(page.getByText('Desktop roadmap')).toBeVisible();

  await electronApp.close();
});
