/**
 * T050 — SC-001 feature gates for tutorial_groove (spec 112).
 *
 * WebAudio real-time vs WebAudio offline (limiter bypassed) must pass.
 * The capture command also prints PCM vs real-time; that comparison is T055
 * and does not fail this test.
 *
 * Requires Playwright Chromium (`npx playwright install chromium`).
 */
import { spawnSync } from 'child_process';
import { join } from 'path';

describe('tutorial_groove WebAudio self-check (112 T050)', () => {
  test('real-time vs offline passes SC-001', () => {
    const script = join(__dirname, '../scripts/parity/capture.mjs');
    const song = join(__dirname, '../../../songs/gameboy/tutorial_groove.bax');
    const run = spawnSync(process.execPath, [script, song], {
      cwd: join(__dirname, '..'),
      encoding: 'utf8',
      timeout: 180000,
    });
    if (run.stdout) process.stdout.write(run.stdout);
    if (run.stderr) process.stderr.write(run.stderr);
    expect(run.status).toBe(0);
  }, 180000);
});
