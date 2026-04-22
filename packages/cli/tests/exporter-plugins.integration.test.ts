import { describe, it, expect, beforeAll, afterEach } from '@jest/globals';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { basename, join } from 'path';

const TEST_OUTPUT_DIR = join(__dirname, '..', '..', '..', 'tmp');
const CLI_PATH = join(__dirname, '..', 'dist', 'cli.js');
const TEST_NES_BAX_PATH = join(TEST_OUTPUT_DIR, 'cli_nes_export_test.bax');
const TEST_FTXT_PATH = join(TEST_OUTPUT_DIR, 'cli_nes_export_test.txt');
const FAMITRACKER_SAMPLE_DIR = join(
  __dirname,
  '..',
  '..',
  '..',
  'songs',
  'features',
  'nes',
);
const FAMITRACKER_SAMPLE_BAX_PATHS = [
  join(FAMITRACKER_SAMPLE_DIR, 'nes_macro_vol_env_loop.bax'),
  join(FAMITRACKER_SAMPLE_DIR, 'nes_macro_pitch_env.bax'),
  join(FAMITRACKER_SAMPLE_DIR, 'nes_macro_arp_triangle.bax'),
  join(FAMITRACKER_SAMPLE_DIR, 'nes_macro_duty_env.bax'),
  join(FAMITRACKER_SAMPLE_DIR, 'nes_macro_noise_vol_env_oneshot.bax'),
];

beforeAll(() => {
  if (!existsSync(TEST_OUTPUT_DIR)) {
    mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  }
});

afterEach(() => {
  if (existsSync(TEST_NES_BAX_PATH)) unlinkSync(TEST_NES_BAX_PATH);
  if (existsSync(TEST_FTXT_PATH)) unlinkSync(TEST_FTXT_PATH);
});

describe('CLI exporter plugins', () => {
  it('list-exporters exposes built-in formats', () => {
    const output = execSync(`node "${CLI_PATH}" list-exporters --json`, { encoding: 'utf-8' });
    const parsed = JSON.parse(output) as Array<{ id: string }>;
    const ids = parsed.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['json', 'midi', 'uge', 'wav']));
  });

  it('rejects removed famitracker binary exporter format', () => {
    const source = `chip nes
bpm 120
inst lead type=pulse1 duty=50 env=12,down
pat a = C4 . E4 .
seq s = a
channel 1 => inst lead seq s
play
`;
    writeFileSync(TEST_NES_BAX_PATH, source, 'utf8');

    expect(() =>
      execSync(
        `node "${CLI_PATH}" export famitracker "${TEST_NES_BAX_PATH}"`,
        { encoding: 'utf-8' },
      ),
    ).toThrow(/Unknown export format 'famitracker'/i);
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
    expect(body).toContain('FamiTracker text export');
  });

  it('exports famitracker-text for dedicated macro verification sample songs', () => {
    const existingFixtures = FAMITRACKER_SAMPLE_BAX_PATHS.filter((p) => existsSync(p));
    expect(existingFixtures.length).toBeGreaterThan(0);
    for (const baxPath of existingFixtures) {
      const outPath = join(
        TEST_OUTPUT_DIR,
        `${basename(baxPath, '.bax')}.txt`,
      );
      try {
        const output = execSync(
          `node "${CLI_PATH}" export famitracker-text "${baxPath}" "${outPath}"`,
          { encoding: 'utf-8' },
        );
        expect(output).toContain('[OK] Exported FAMITRACKER-TEXT file');
        expect(existsSync(outPath)).toBe(true);
        const body = readFileSync(outPath, 'utf8');
        expect(body).toContain('FamiTracker text export');
      } finally {
        if (existsSync(outPath)) unlinkSync(outPath);
      }
    }
  });
});
