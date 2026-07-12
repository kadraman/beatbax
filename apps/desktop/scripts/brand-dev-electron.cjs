#!/usr/bin/env node
// Optional macOS dev branding: patch Electron.app Info.plist and dock icon only.
// Does NOT rename the bundle or change node_modules/electron/path.txt — those
// changes broke electron-vite launch. Run manually via `npm run brand-dev-electron`
// if you want plist/icon branding; dev does not depend on it.

const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync, unlinkSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

if (process.platform !== 'darwin') {
  process.exit(0);
}

const DESIRED_NAME = 'BeatBax';
const STOCK_PATH_TXT = 'Electron.app/Contents/MacOS/Electron';

const requireFromDesktop = createRequire(resolve(__dirname, '../package.json'));
const electronPackageDir = resolve(requireFromDesktop.resolve('electron/package.json'), '..');
const distDir = resolve(electronPackageDir, 'dist');
const pathTxtFile = resolve(electronPackageDir, 'path.txt');
const electronAppPath = resolve(distDir, 'Electron.app');
const plistPath = resolve(electronAppPath, 'Contents/Info.plist');
const bundleIconPath = resolve(electronAppPath, 'Contents/Resources/electron.icns');
const beatbaxIconPath = resolve(__dirname, '../build/icon.icns');

function plistGet(key) {
  try {
    return execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plistPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function plistSet(key, value) {
  try {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plistPath]);
  } catch {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Add :${key} string ${value}`, plistPath]);
  }
}

function breakHardlinkAndWrite(targetPath, data) {
  if (existsSync(targetPath)) {
    readFileSync(targetPath);
    unlinkSync(targetPath);
  }
  writeFileSync(targetPath, data);
}

// Always restore path.txt to the stock Electron.app entry (no trailing newline).
if (existsSync(pathTxtFile)) {
  const current = readFileSync(pathTxtFile, 'utf8');
  if (current !== STOCK_PATH_TXT) {
    breakHardlinkAndWrite(pathTxtFile, STOCK_PATH_TXT);
    console.log(`[brand-dev-electron] restored ${pathTxtFile} → ${STOCK_PATH_TXT}`);
  }
}

if (!existsSync(plistPath)) {
  console.warn(`[brand-dev-electron] skipped: ${electronAppPath} not found`);
  process.exit(0);
}

const plistAlreadyBranded =
  plistGet('CFBundleName') === DESIRED_NAME && plistGet('CFBundleDisplayName') === DESIRED_NAME;

let iconAlreadyBranded = false;
if (existsSync(beatbaxIconPath) && existsSync(bundleIconPath)) {
  const current = readFileSync(bundleIconPath);
  const desired = readFileSync(beatbaxIconPath);
  iconAlreadyBranded = current.length === desired.length && current.equals(desired);
}

if (!plistAlreadyBranded) {
  const original = readFileSync(plistPath);
  breakHardlinkAndWrite(plistPath, original);
  plistSet('CFBundleName', DESIRED_NAME);
  plistSet('CFBundleDisplayName', DESIRED_NAME);
  console.log(`[brand-dev-electron] ${plistPath} → CFBundleName="${DESIRED_NAME}"`);
}

if (!iconAlreadyBranded && existsSync(beatbaxIconPath)) {
  breakHardlinkAndWrite(bundleIconPath, readFileSync(beatbaxIconPath));
  console.log(`[brand-dev-electron] ${bundleIconPath} → BeatBax icon`);
}
