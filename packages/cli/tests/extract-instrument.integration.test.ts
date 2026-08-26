/**
 * Integration tests for `beatbax extract instrument`.
 */

import { describe, it, expect, beforeAll, afterEach } from '@jest/globals';
import { execSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { parse } from '@beatbax/engine/parser';
import { resolveImportsSync } from '@beatbax/engine/song';
import { collectDisallowedInsFileNodes } from '../../engine/src/song/ins-file';
import { buildUgeFixture } from '../../engine/tests/helpers/ugeFixtureWriter';

const TEST_OUTPUT_DIR = join(__dirname, '..', '..', '..', 'tmp', 'extract-instrument');
const CLI_PATH = join(__dirname, '..', 'dist', 'cli.js');

beforeAll(() => {
  mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
});

function writeFixture(path: string, opts?: Omit<Parameters<typeof buildUgeFixture>[0], 'version'>): void {
  writeFileSync(path, buildUgeFixture({ version: 6, ...opts }));
}

function run(args: string[]) {
  return spawnSync('node', [CLI_PATH, ...args], { encoding: 'utf-8' });
}

describe('CLI extract instrument', () => {
  const fixture = join(TEST_OUTPUT_DIR, 'fixture.uge');
  const outIns = join(TEST_OUTPUT_DIR, 'out.ins');
  const demoBax = join(TEST_OUTPUT_DIR, 'out-demo.bax');
  const dumpedBin = join(TEST_OUTPUT_DIR, 'song.bin');
  const dirA = join(TEST_OUTPUT_DIR, 'lib', 'one.uge');
  const dirB = join(TEST_OUTPUT_DIR, 'lib', 'two.uge');
  const mergeIns = join(TEST_OUTPUT_DIR, 'merged.ins');
  const corrupt = join(TEST_OUTPUT_DIR, 'corrupt.uge');

  afterEach(() => {
    for (const p of [fixture, outIns, demoBax, dumpedBin, dirA, dirB, mergeIns, corrupt]) {
      if (existsSync(p)) unlinkSync(p);
    }
    const libDir = join(TEST_OUTPUT_DIR, 'lib');
    if (existsSync(libDir)) rmSync(libDir, { recursive: true, force: true });
  });

  it('writes a valid .ins kit next to a positional output', () => {
    writeFixture(fixture);
    const output = execSync(
      `node "${CLI_PATH}" extract instrument "${fixture}" "${outIns}"`,
      { encoding: 'utf-8' },
    );
    expect(existsSync(outIns)).toBe(true);
    expect(output).toContain('[OK]');
    const kitAst = parse(readFileSync(outIns, 'utf8'));
    expect(collectDisallowedInsFileNodes(kitAst)).toEqual([]);
    expect(kitAst.insts?.Lead).toBeTruthy();
  });

  it('writes a valid .ins kit with --out', () => {
    writeFixture(fixture);
    const result = run(['extract', 'instrument', fixture, '--out', outIns]);
    expect(result.status).toBe(0);
    expect(existsSync(outIns)).toBe(true);
  });

  it('--demo resolves import local: kit and tours every inst name', () => {
    writeFixture(fixture);
    const result = run(['extract', 'instrument', fixture, '--out', outIns, '--demo', demoBax]);
    expect(result.status).toBe(0);
    const kit = readFileSync(outIns, 'utf8');
    const demo = readFileSync(demoBax, 'utf8');
    expect(demo).toContain('import "local:out.ins"');
    const demoAst = parse(demo);
    const resolved = resolveImportsSync(demoAst, { baseFilePath: demoBax });
    const names = Object.keys(parse(kit).insts || {});
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(resolved.insts?.[name]).toBeTruthy();
      expect(demo).toContain(`:inst(${name})`);
    }
  });

  it('merges a directory and renames clashes to Lead_2', () => {
    mkdirSync(join(TEST_OUTPUT_DIR, 'lib'), { recursive: true });
    writeFixture(dirA, { duty: [{ type: 0, name: 'Lead' }] });
    writeFixture(dirB, { duty: [{ type: 0, name: 'Lead' }] });
    const result = run(['extract', 'instrument', join(TEST_OUTPUT_DIR, 'lib'), '--out', mergeIns]);
    expect(result.status).toBe(0);
    const kit = readFileSync(mergeIns, 'utf8');
    expect(kit).toContain('inst Lead ');
    expect(kit).toContain('inst Lead_2 ');
    expect(result.stdout).toContain('Lead_2');
  });

  it('--stdout prints the kit and does not write --out', () => {
    writeFixture(fixture);
    const result = run(['extract', 'instrument', fixture, '--out', outIns, '--stdout']);
    expect(result.status).toBe(0);
    expect(existsSync(outIns)).toBe(false);
    expect(result.stdout).toContain('inst Lead');
    expect(result.stdout).not.toContain('[OK] Wrote');
  });

  it('rejects --demo with --summary (no kit is written)', () => {
    writeFixture(fixture);
    const result = run(['extract', 'instrument', fixture, '--out', outIns, '--summary', '--demo', demoBax]);
    expect(result.status).toBe(1);
    expect(`${result.stderr}${result.stdout}`).toMatch(/--demo requires writing a kit/);
    expect(existsSync(outIns)).toBe(false);
    expect(existsSync(demoBax)).toBe(false);
  });

  it('rejects --demo with --stdout (no kit file is written)', () => {
    writeFixture(fixture);
    const result = run(['extract', 'instrument', fixture, '--out', outIns, '--stdout', '--demo', demoBax]);
    expect(result.status).toBe(1);
    expect(`${result.stderr}${result.stdout}`).toMatch(/--demo requires writing a kit/);
    expect(existsSync(demoBax)).toBe(false);
  });

  it('rejects a non-.uge name without --from', () => {
    writeFixture(fixture);
    writeFileSync(dumpedBin, readFileSync(fixture));
    const result = run(['extract', 'instrument', dumpedBin, '--out', outIns]);
    expect(result.status).toBe(1);
    expect(`${result.stderr}${result.stdout}`).toMatch(/--from uge/);
    expect(existsSync(outIns)).toBe(false);
  });

  it('--from uge extracts a payload that is not named .uge', () => {
    writeFixture(fixture);
    writeFileSync(dumpedBin, readFileSync(fixture));
    const result = run(['extract', 'instrument', dumpedBin, '--from', 'uge', '--out', outIns]);
    expect(result.status).toBe(0);
    expect(existsSync(outIns)).toBe(true);
  });

  it('missing input exits 1', () => {
    const result = run(['extract', 'instrument', join(TEST_OUTPUT_DIR, 'no-such.uge')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('File not found');
  });

  it('corrupt .uge exits 2', () => {
    writeFileSync(corrupt, Buffer.from('not a uge file'));
    const result = run(['extract', 'instrument', corrupt, '--out', outIns]);
    expect(result.status).toBe(2);
  });

  it('--type noise omits pulse and wave sections', () => {
    writeFixture(fixture);
    const result = run(['extract', 'instrument', fixture, '--out', outIns, '--type', 'noise']);
    expect(result.status).toBe(0);
    const kit = readFileSync(outIns, 'utf8');
    expect(kit).toContain('type=noise');
    expect(kit).not.toContain('type=pulse');
    expect(kit).not.toContain('# Pulse');
  });

  it('several files without --out is a usage error', () => {
    writeFixture(fixture);
    const extra = join(TEST_OUTPUT_DIR, 'extra.uge');
    writeFixture(extra);
    const result = run(['extract', 'instrument', fixture, extra]);
    unlinkSync(extra);
    expect(result.status).toBe(1);
    expect(`${result.stderr}${result.stdout}`).toMatch(/require --out/);
  });
});
