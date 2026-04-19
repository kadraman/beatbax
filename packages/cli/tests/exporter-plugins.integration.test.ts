import { describe, it, expect, beforeAll, afterEach } from '@jest/globals';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

const TEST_OUTPUT_DIR = join(__dirname, '..', '..', '..', 'tmp');
const CLI_PATH = join(__dirname, '..', 'dist', 'cli.js');
const TEST_NES_BAX_PATH = join(TEST_OUTPUT_DIR, 'cli_nes_export_test.bax');
const TEST_FTM_PATH = join(TEST_OUTPUT_DIR, 'cli_nes_export_test.ftm');
const TEST_FTXT_PATH = join(TEST_OUTPUT_DIR, 'cli_nes_export_test.txt');

beforeAll(() => {
  if (!existsSync(TEST_OUTPUT_DIR)) {
    mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  }
});

afterEach(() => {
  if (existsSync(TEST_NES_BAX_PATH)) unlinkSync(TEST_NES_BAX_PATH);
  if (existsSync(TEST_FTM_PATH)) unlinkSync(TEST_FTM_PATH);
  if (existsSync(TEST_FTXT_PATH)) unlinkSync(TEST_FTXT_PATH);
});

describe('CLI exporter plugins', () => {
  it('list-exporters exposes built-in formats', () => {
    const output = execSync(`node "${CLI_PATH}" list-exporters --json`, { encoding: 'utf-8' });
    const parsed = JSON.parse(output) as Array<{ id: string }>;
    const ids = parsed.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['json', 'midi', 'uge', 'wav']));
  });

  it('exports NES songs with the famitracker placeholder plugin', () => {
    const source = `chip nes
bpm 120
inst lead type=pulse1 duty=50 env=12,down
pat a = C4 . E4 .
seq s = a
channel 1 => inst lead seq s
play
`;
    writeFileSync(TEST_NES_BAX_PATH, source, 'utf8');

    const output = execSync(
      `node "${CLI_PATH}" export famitracker "${TEST_NES_BAX_PATH}" "${TEST_FTM_PATH}"`,
      { encoding: 'utf-8' },
    );

    expect(output).toContain('[OK] Exported FAMITRACKER file');
    expect(existsSync(TEST_FTM_PATH)).toBe(true);
    const body = readFileSync(TEST_FTM_PATH, 'utf8');
    expect(body).toContain('FamiTracker placeholder export');
    expect(body).toContain('chip=nes');
  });

  it('exports NES songs with the famitracker text placeholder plugin', () => {
    const source = `chip nes
bpm 120
inst lead type=pulse1 duty=50 env=12,down
pat a = C4 . E4 .
seq s = a
channel 1 => inst lead seq s
play
`;
    writeFileSync(TEST_NES_BAX_PATH, source, 'utf8');

    const output = execSync(
      `node "${CLI_PATH}" export famitracker-text "${TEST_NES_BAX_PATH}" "${TEST_FTXT_PATH}"`,
      { encoding: 'utf-8' },
    );

    expect(output).toContain('[OK] Exported FAMITRACKER-TEXT file');
    expect(existsSync(TEST_FTXT_PATH)).toBe(true);
    const body = readFileSync(TEST_FTXT_PATH, 'utf8');
    expect(body).toContain('mode=text-export');
    expect(body).toContain('chip=nes');
  });
});
