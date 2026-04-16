import { describe, it, expect, beforeAll, afterEach } from '@jest/globals';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

const TEST_OUTPUT_DIR = join(__dirname, '..', '..', '..', 'tmp');
const CLI_PATH = join(__dirname, '..', 'dist', 'cli.js');
const TEST_SONG_PATH = join(TEST_OUTPUT_DIR, 'cli_verify_mixed_errors.bax');

describe('CLI verify mixed syntax + semantic errors', () => {
  beforeAll(() => {
    if (!existsSync(TEST_OUTPUT_DIR)) {
      mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(TEST_SONG_PATH)) unlinkSync(TEST_SONG_PATH);
  });

  it('reports syntax recovery errors and semantic diagnostics together', () => {
    writeFileSync(TEST_SONG_PATH, [
      'chip ned',
      'song tgs "a,b"',
      'inst bass type=dxm dury=50 made_up=1',
      'pat melody = C5 JEFF G5',
      'seq main = melody',
      'channel 1 => inst bass seq main',
      'saq',
    ].join('\n'));

    let output = '';
    try {
      execSync(`node "${CLI_PATH}" verify "${TEST_SONG_PATH}"`, { encoding: 'utf-8', stdio: 'pipe' });
      throw new Error('Expected verify to fail');
    } catch (err: any) {
      output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    }

    expect(output).toContain("Unknown keyword 'saq'");
    expect(output).toContain("Unknown chip 'ned'");
    expect(output).toContain("Instrument 'bass': unknown type 'dxm'");
    expect(output).toContain("unknown property 'dury'");
    expect(output).toContain("unknown token 'JEFF'");
  });
});
