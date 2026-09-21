import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';

const REPO = join(__dirname, '../../..');
const CLI = join(REPO, 'packages/cli/dist/cli.js');
const FIXTURE = join(REPO, 'packages/engine/tests/fixtures/midi/f04-gm-drums.mid');

function run(...args: string[]) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    cwd: REPO,
  });
}

describe('CLI import midi', () => {
  test('import midi writes .bax', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-midi-'));
    const out = join(dir, 'out.bax');
    const res = run('import', 'midi', FIXTURE, out, '--chip', 'gameboy');
    expect(res.status).toBe(0);
    expect(existsSync(out)).toBe(true);
    expect(readFileSync(out, 'utf8')).toContain('chip gameboy');
  });

  test('convert midi2bax alias works', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-midi-'));
    const out = join(dir, 'out.bax');
    const res = run('convert', 'midi2bax', FIXTURE, out, '--chip', 'gameboy');
    expect(res.status).toBe(0);
    expect(existsSync(out)).toBe(true);
  });

  test('dry-run does not write', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-midi-'));
    const out = join(dir, 'out.bax');
    const res = run('import', 'midi', FIXTURE, out, '--chip', 'gameboy', '--dry-run');
    expect(res.status).toBe(0);
    expect(existsSync(out)).toBe(false);
    expect(res.stdout + res.stderr).toMatch(/Dry run/i);
  });

  test('requires --chip', () => {
    const res = run('import', 'midi', FIXTURE, '/tmp/x.bax');
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/--chip/);
  });
});
