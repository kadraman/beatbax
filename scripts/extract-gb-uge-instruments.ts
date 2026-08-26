#!/usr/bin/env npx tsx
/**
 * Thin wrapper: extract the in-repo Game Boy kit via the CLI.
 *
 * Usage (repo root):
 *   npx tsx scripts/extract-gb-uge-instruments.ts
 *
 * Equivalent:
 *   npx beatbax extract instrument songs/instruments/gameboy/uge \
 *     --out songs/instruments/gameboy/gameboy.ins \
 *     --demo songs/instruments/gameboy/gameboy-instruments-demo.bax
 */

import { spawnSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const cli = join(root, 'packages', 'cli', 'dist', 'cli.js');
const ugeDir = join(root, 'songs', 'instruments', 'gameboy', 'uge');
const kitPath = join(root, 'songs', 'instruments', 'gameboy', 'gameboy.ins');
const demoPath = join(root, 'songs', 'instruments', 'gameboy', 'gameboy-instruments-demo.bax');
const staleKit = join(root, 'songs', 'instruments', 'gameboy', 'instruments.bax');

if (!existsSync(cli)) {
  console.error(`CLI not built: ${cli}`);
  console.error('Run: npm run build -w @beatbax/cli');
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [cli, 'extract', 'instrument', ugeDir, '--out', kitPath, '--demo', demoPath],
  { cwd: root, stdio: 'inherit' },
);

if (existsSync(staleKit)) unlinkSync(staleKit);
process.exit(result.status ?? 1);
