#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const packagesRoot = path.join(repoRoot, 'packages');

const IGNORED_DIRS = new Set(['node_modules', 'dist', 'build', '.git']);

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function walkDirectories(rootDir, onDirectory) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  onDirectory(rootDir);

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    walkDirectories(path.join(rootDir, entry.name), onDirectory);
  }
}

function syncVersionFile(packageDir) {
  const packageJsonPath = path.join(packageDir, 'package.json');
  const versionTsPath = path.join(packageDir, 'src', 'version.ts');

  if (!fs.existsSync(packageJsonPath) || !fs.existsSync(versionTsPath)) {
    return null;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  if (typeof packageJson.version !== 'string' || packageJson.version.length === 0) {
    throw new Error(`Missing or invalid version in ${packageJsonPath}`);
  }

  const relativePackageJsonPath = toPosixPath(path.relative(repoRoot, packageJsonPath));
  const nextContent = [
    `/** Auto-kept in sync with ${relativePackageJsonPath}. */`,
    `export const version = '${packageJson.version}';`,
    ''
  ].join('\n');

  const currentContent = fs.readFileSync(versionTsPath, 'utf8');

  if (currentContent === nextContent) {
    return null;
  }

  fs.writeFileSync(versionTsPath, nextContent, 'utf8');
  return toPosixPath(path.relative(repoRoot, versionTsPath));
}

function main() {
  if (!fs.existsSync(packagesRoot)) {
    console.log('No packages directory found, nothing to sync.');
    return;
  }

  const updatedFiles = [];

  walkDirectories(packagesRoot, (dirPath) => {
    const updatedPath = syncVersionFile(dirPath);
    if (updatedPath) {
      updatedFiles.push(updatedPath);
    }
  });

  if (updatedFiles.length === 0) {
    console.log('version.ts files already in sync.');
    return;
  }

  console.log('Synced version.ts files:');
  for (const file of updatedFiles) {
    console.log(`- ${file}`);
  }
}

main();
