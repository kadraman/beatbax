/* eslint-disable @typescript-eslint/no-require-imports */
const { notarize } = require('@electron/notarize');
const { join } = require('node:path');

/**
 * GB Studio-style notarization hook for electron-builder afterSign.
 * Skips when not on macOS or when Apple credentials are not configured (local unsigned builds).
 */
module.exports = async function notarizeHook(context) {
  if (process.platform !== 'darwin') {
    console.log('Not a Mac; skipping notarization');
    return;
  }

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_ID_PASSWORD ?? process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !teamId) {
    console.log('Missing APPLE_ID / APPLE_ID_PASSWORD / APPLE_TEAM_ID; skipping notarization');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = join(context.appOutDir, `${appName}.app`);

  console.log(`Notarizing ${appPath}...`);
  await notarize({
    appBundleId: 'com.beatbax.desktop',
    appPath,
    appleId,
    appleIdPassword,
    teamId,
  });
  console.log('Notarization completed');
};
