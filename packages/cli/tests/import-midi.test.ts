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

  test('rejects fractional --section-bars', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-midi-'));
    const out = join(dir, 'out.bax');
    const res = run('import', 'midi', FIXTURE, out, '--chip', 'gameboy', '--section-bars', '1.5');
    expect(res.status).not.toBe(0);
    expect(res.stderr + res.stdout).toMatch(/section-bars/);
    expect(existsSync(out)).toBe(false);
  });
});

describe('CLI import midi: feature 089', () => {
  const F14 = join(REPO, 'packages/engine/tests/fixtures/midi/f14-dup-unmapped.mid');
  const F10 = join(REPO, 'packages/engine/tests/fixtures/midi/f10-lanes.mid');

  test('--inspect prints a track report without --chip and writes nothing', () => {
    const res = run('import', 'midi', F14, '--inspect');
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/^MIDI inspect: /m);
    expect(res.stdout).toMatch(/PPQ 480/);
    expect(res.stdout).toMatch(/^Track\s+Ch\s+Program/m);
    expect(res.stdout).toMatch(/duplicate of T0/);
  });

  test('--inspect warns about and ignores --chip, --config and the output path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-midi-'));
    const out = join(dir, 'out.bax');
    const res = run('import', 'midi', F14, out, '--inspect', '--chip', 'gameboy', '--config', 'missing.json');
    expect(res.status).toBe(0);
    expect(res.stderr).toMatch(/--inspect ignores --chip, --config, output path/);
    expect(existsSync(out)).toBe(false);
  });

  test('--inspect output is deterministic', () => {
    expect(run('import', 'midi', F14, '--inspect').stdout).toBe(run('import', 'midi', F14, '--inspect').stdout);
  });

  test('--inspect --json prints the structured report', () => {
    const res = run('import', 'midi', F14, '--inspect', '--json');
    expect(res.status).toBe(0);
    const report = JSON.parse(res.stdout);
    expect(report.ppq).toBe(480);
    expect(Array.isArray(report.tracks)).toBe(true);
    expect(report.tracks.find((t: { id: string }) => t.id === 'T1').duplicateOf).toBe('T0');
  });

  test('--json without --inspect is an error', () => {
    const res = run('import', 'midi', F14, '--chip', 'gameboy', '--dry-run', '--json');
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/--json requires --inspect/);
  });

  test('--annotate adds the arrangement notes block', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-midi-'));
    const out = join(dir, 'out.bax');
    const res = run('import', 'midi', F10, out, '--chip', 'gameboy', '--config', F10.replace(/\.mid$/, '.import.json'), '--annotate');
    expect(res.status).toBe(0);
    const src = readFileSync(out, 'utf8');
    expect(src).toMatch(/^# >>> arrangement notes$/m);
    expect(src).toMatch(/^# <<< arrangement notes$/m);
    expect(src).toMatch(/^# Timing: /m);
  });

  test('a config using the 089 fields round-trips through the CLI', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-midi-'));
    const cfg = join(dir, 'arrange.json');
    const out = join(dir, 'out.bax');
    writeFileSync(
      cfg,
      JSON.stringify({
        packing: 'lanes',
        unmappedTracks: 'drop',
        tempo: 'longest',
        startBar: 1,
        nudge: 0,
        annotate: true,
        trackMappings: [
          { midiTrack: 1, target: 'pulse1', instrument: 'synth', fromBar: 1, toBar: 2, mono: 'highest' },
          { midiTrack: 0, target: 'pulse1', instrument: 'vocal', fromBar: 3 },
          { midiTrack: 3, target: 'wave', instrument: 'bass', fold: [36, 60] },
        ],
      }),
    );
    const res = run('import', 'midi', F10, out, '--chip', 'gameboy', '--config', cfg);
    expect(res.status).toBe(0);
    const src = readFileSync(out, 'utf8');
    expect(src).toMatch(/^# >>> arrangement notes$/m);
    expect(src).toMatch(/inst synth/);
    expect(src).toMatch(/inst vocal/);
  });

  test('invalid 089 config fields fail with a clear error', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bb-midi-'));
    const cfg = join(dir, 'bad.json');
    writeFileSync(cfg, JSON.stringify({ trackMappings: [{ midiTrack: 0, target: 'pulse1', fromBar: 4, toBar: 2 }] }));
    const res = run('import', 'midi', F10, '--chip', 'gameboy', '--config', cfg, '--dry-run');
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/fromBar/);
  });
});
