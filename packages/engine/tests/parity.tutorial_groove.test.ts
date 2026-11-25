/**
 * Spec 112 SC-001 for tutorial_groove.
 *
 * Product gate (CI): Chromium OfflineAudioContext vs PCM (`--offline-only --pcm-gate`).
 * That is the distribution path (CLI play / WAV) and is deterministic.
 *
 * Real-time WebAudio vs offline is only a local self-check that the gates are
 * reachable (spec SC-001). It is load-sensitive on shared CI runners (especially
 * macOS under parallel Jest): note onsets go silent (-240 dB) while gaps===0,
 * so it must not be the default CI assertion. Opt in with BEATBAX_PARITY_REALTIME=1.
 *
 * Requires Playwright Chromium (`npx playwright install chromium`).
 */
import { spawnSync } from 'child_process';
import { join } from 'path';

const script = join(__dirname, '../scripts/parity/capture.mjs');
const song = join(__dirname, '../../../songs/gameboy/tutorial_groove.bax');
const engineRoot = join(__dirname, '..');

function runCapture(extraArgs: string[]) {
  const run = spawnSync(process.execPath, [script, song, ...extraArgs], {
    cwd: engineRoot,
    encoding: 'utf8',
    timeout: 180000,
  });
  if (run.stdout) process.stdout.write(run.stdout);
  if (run.stderr) process.stderr.write(run.stderr);
  return run;
}

describe('tutorial_groove SC-001 (112)', () => {
  test('offline WebAudio vs PCM passes SC-001', () => {
    const run = runCapture(['--offline-only', '--pcm-gate']);
    expect(run.status).toBe(0);
  }, 180000);

  const runRealtime = process.env.BEATBAX_PARITY_REALTIME === '1';
  (runRealtime ? test : test.skip)(
    'real-time vs offline self-check passes SC-001 (opt-in)',
    () => {
      const run = runCapture([]);
      expect(run.status).toBe(0);
    },
    180000,
  );
});
