#!/usr/bin/env npx tsx
/**
 * One-shot extraction: hUGETracker .uge instruments → gameboy.ins + demo song.
 *
 * Usage (repo root):
 *   npx tsx scripts/extract-gb-uge-instruments.ts
 */

import { readdirSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readUGEFile } from '../packages/engine/src/import/uge/uge.reader.js';
import { extractUgeInstrumentLibrary } from '../packages/engine/src/import/uge/ugeInstrumentsToBax.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const ugeDir = join(root, 'songs', 'instruments', 'gameboy', 'uge');
const outDir = join(root, 'songs', 'instruments', 'gameboy');
const kitPath = join(outDir, 'gameboy.ins');
const demoPath = join(outDir, 'gameboy-instruments-demo.bax');
const staleKit = join(outDir, 'instruments.bax');

function main(): void {
  if (!existsSync(ugeDir)) {
    console.error(`UGE folder not found: ${ugeDir}`);
    process.exit(1);
  }

  const files = readdirSync(ugeDir)
    .filter((f) => f.toLowerCase().endsWith('.uge'))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    console.error(`No .uge files in ${ugeDir}`);
    process.exit(1);
  }

  const parsed: { label: string; song: ReturnType<typeof readUGEFile> }[] = [];
  const failed: { file: string; error: string }[] = [];

  for (const file of files) {
    const full = join(ugeDir, file);
    try {
      parsed.push({ label: file, song: readUGEFile(full) });
    } catch (err) {
      failed.push({ file, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const { result, kit, demo } = extractUgeInstrumentLibrary(parsed);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(kitPath, kit, 'utf8');
  writeFileSync(demoPath, demo, 'utf8');
  if (existsSync(staleKit)) unlinkSync(staleKit);

  console.log(`Parsed ${parsed.length}/${files.length} UGE files`);
  if (failed.length) {
    console.log('Failed:');
    for (const f of failed) console.log(`  ${f.file}: ${f.error}`);
  }
  console.log(`Pulse: ${result.pulse.length}`);
  console.log(`Wave:  ${result.wave.length}`);
  console.log(`Noise: ${result.noise.length}`);
  console.log(`Renames: ${result.renames.length}`);
  for (const r of result.renames.slice(0, 20)) {
    console.log(`  ${JSON.stringify(r.from)} → ${r.to} (${r.source})`);
  }
  if (result.renames.length > 20) console.log(`  … ${result.renames.length - 20} more`);
  console.log(`Wrote ${kitPath}`);
  console.log(`Wrote ${demoPath}`);

  if (failed.length) process.exit(1);
}

main();
