/**
 * Integration tests for `beatbax convert wav2dmc`.
 */

import { describe, it, expect, beforeAll, afterEach } from '@jest/globals';
import { execSync, spawnSync } from 'child_process';
import { readFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { writeWAV } from '@beatbax/engine/export';

const TEST_OUTPUT_DIR = join(__dirname, '..', '..', '..', 'tmp', 'wav2dmc');
const CLI_PATH = join(__dirname, '..', 'dist', 'cli.js');

beforeAll(() => {
  if (!existsSync(TEST_OUTPUT_DIR)) {
    mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  }
});

function makeTestWav(path: string): void {
  const sampleRate = 44100;
  const len = Math.floor(sampleRate * 0.05);
  const samples = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    samples[i] = Math.sin((i / len) * Math.PI * 8) * 0.7;
  }
  const buf = writeWAV(samples, { sampleRate, bitDepth: 16, channels: 1 });
  const { writeFileSync } = require('fs') as typeof import('fs');
  writeFileSync(path, buf);
}

function makeTailedTestWav(path: string): void {
  const sampleRate = 44100;
  const len = Math.floor(sampleRate * 0.25);
  const hitLen = Math.floor(sampleRate * 0.04);
  const samples = new Float32Array(len);
  for (let i = 0; i < hitLen; i++) {
    samples[i] = Math.sin((i / hitLen) * Math.PI * 8) * 0.7;
  }
  const buf = writeWAV(samples, { sampleRate, bitDepth: 16, channels: 1 });
  const { writeFileSync } = require('fs') as typeof import('fs');
  writeFileSync(path, buf);
}

describe('CLI convert wav2dmc', () => {
  const wavPath = join(TEST_OUTPUT_DIR, 'test_input.wav');
  const dmcPath = join(TEST_OUTPUT_DIR, 'test_input.dmc');
  const dmcPathAlt = join(TEST_OUTPUT_DIR, 'test_input_alt.dmc');
  const dmcPathWithSpace = join(TEST_OUTPUT_DIR, 'space dir', 'test input spaced.dmc');

  afterEach(() => {
    for (const p of [wavPath, dmcPath, dmcPathAlt, dmcPathWithSpace]) {
      if (existsSync(p)) unlinkSync(p);
    }
  });

  it('converts WAV to .dmc', () => {
    makeTestWav(wavPath);
    const output = execSync(
      `node "${CLI_PATH}" convert wav2dmc "${wavPath}" -o "${dmcPath}"`,
      { encoding: 'utf-8' }
    );
    expect(existsSync(dmcPath)).toBe(true);
    expect(output).toContain('[OK]');
    const bytes = readFileSync(dmcPath);
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes.length).toBeLessThanOrEqual(4096);
  });

  it('--emit-inst includes dmc_rate and dmc_loop=false', () => {
    makeTestWav(wavPath);
    const output = execSync(
      `node "${CLI_PATH}" convert wav2dmc "${wavPath}" -o "${dmcPath}" --dmc-rate 7 --emit-inst`,
      { encoding: 'utf-8' }
    );
    expect(output).toContain('dmc_rate=7');
    expect(output).toContain('dmc_loop=false');
    expect(output).toContain('type=dmc');
  });

  it('--emit-inst percent-encodes spaces in local sample refs', () => {
    makeTestWav(wavPath);
    const output = execSync(
      `node "${CLI_PATH}" convert wav2dmc "${wavPath}" -o "${dmcPathWithSpace}" --emit-inst`,
      { encoding: 'utf-8' }
    );
    expect(output).toContain('dmc_sample="local:');
    expect(output).toContain('%20');
    expect(output).not.toContain('dmc_sample="local:tmp/wav2dmc/space dir/test input spaced.dmc"');
    expect(output).toContain('[OK]');
    expect(existsSync(dmcPathWithSpace)).toBe(true);
  });

  it('-q alias for --rate sets dmc_rate', () => {
    makeTestWav(wavPath);
    const output = execSync(
      `node "${CLI_PATH}" convert wav2dmc "${wavPath}" -o "${dmcPath}" -q 7 --emit-inst`,
      { encoding: 'utf-8' }
    );
    expect(output).toContain('dmc_rate=7');
    expect(output).toContain('type=dmc');
  });

  it('rejects non-integer --dmc-rate values', () => {
    makeTestWav(wavPath);
    const result = spawnSync(
      'node',
      [CLI_PATH, 'convert', 'wav2dmc', wavPath, '-o', dmcPath, '--dmc-rate', 'abc'],
      { encoding: 'utf-8' }
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("invalid --dmc-rate value 'abc'");
  });

  it('rejects out-of-range --dmc-rate values', () => {
    makeTestWav(wavPath);
    const result = spawnSync(
      'node',
      [CLI_PATH, 'convert', 'wav2dmc', wavPath, '-o', dmcPath, '--dmc-rate', '99'],
      { encoding: 'utf-8' }
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("invalid --dmc-rate value '99'");
  });

  it('--dmc-loop --emit-inst prints dmc_loop=true', () => {
    makeTestWav(wavPath);
    const output = execSync(
      `node "${CLI_PATH}" convert wav2dmc "${wavPath}" -o "${dmcPath}" --dmc-loop --emit-inst`,
      { encoding: 'utf-8' }
    );
    expect(output).toContain('dmc_loop=true');
  });

  it('--play completes without error', () => {
    makeTestWav(wavPath);
    execSync(
      `node "${CLI_PATH}" convert wav2dmc "${wavPath}" -o "${dmcPath}" --play`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
    expect(existsSync(dmcPath)).toBe(true);
  });

  it('--ntsc is accepted explicitly', () => {
    makeTestWav(wavPath);
    const output = execSync(
      `node "${CLI_PATH}" convert wav2dmc "${wavPath}" -o "${dmcPath}" --ntsc`,
      { encoding: 'utf-8' }
    );
    expect(output).toContain('NTSC');
    expect(existsSync(dmcPath)).toBe(true);
  });

  it('rejects conflicting --ntsc and --pal options', () => {
    makeTestWav(wavPath);
    const result = spawnSync(
      'node',
      [CLI_PATH, 'convert', 'wav2dmc', wavPath, '-o', dmcPath, '--ntsc', '--pal'],
      { encoding: 'utf-8' }
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('choose only one DMC clock region');
  });

  it('trims quiet tails by default and allows disabling it', () => {
    makeTailedTestWav(wavPath);
    execSync(
      `node "${CLI_PATH}" convert wav2dmc "${wavPath}" -o "${dmcPath}"`,
      { encoding: 'utf-8' }
    );
    execSync(
      `node "${CLI_PATH}" convert wav2dmc "${wavPath}" -o "${dmcPathAlt}" --no-trim-silence`,
      { encoding: 'utf-8' }
    );
    expect(readFileSync(dmcPath).length).toBeLessThan(readFileSync(dmcPathAlt).length);
  });

  it('--max-duration-ms caps encoded output length', () => {
    makeTailedTestWav(wavPath);
    execSync(
      `node "${CLI_PATH}" convert wav2dmc "${wavPath}" -o "${dmcPath}" --no-trim-silence`,
      { encoding: 'utf-8' }
    );
    execSync(
      `node "${CLI_PATH}" convert wav2dmc "${wavPath}" -o "${dmcPathAlt}" --no-trim-silence --max-duration-ms 40`,
      { encoding: 'utf-8' }
    );
    expect(readFileSync(dmcPathAlt).length).toBeLessThan(readFileSync(dmcPath).length);
  });

  it('does not expose removed low-value options in help', () => {
    const output = execSync(
      `node "${CLI_PATH}" convert wav2dmc --help`,
      { encoding: 'utf-8' }
    );
    expect(output).not.toContain('NES length-register');
    expect(output).not.toContain('--keep-direction');
    expect(output).not.toContain('--preview-wav');
    expect(output).toContain('--trim-silence');
    expect(output).toContain('--max-duration-ms');
  });
});
