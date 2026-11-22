#!/usr/bin/env node
/**
 * Capture Chromium OfflineAudioContext reference stems for parity (spec 112).
 *
 * Usage:
 *   node packages/engine/scripts/capture-webaudio-ref.mjs [song.bax] [--out dir] [--compare]
 *
 * Writes WAV stems under --out (default: packages/engine/tests/fixtures/parity/<stem>/)
 * and prints lag-aware correlation vs PCM when --compare is set.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join, basename, resolve } from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const engineRoot = resolve(__dirname, '..');
const repoRoot = resolve(engineRoot, '../..');

function parseArgs(argv) {
  const out = { song: null, outDir: null, compare: false, sampleRate: 44100, duration: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--compare') out.compare = true;
    else if (a === '--out') out.outDir = argv[++i];
    else if (a === '--sample-rate') out.sampleRate = parseInt(argv[++i], 10);
    else if (a === '--duration') out.duration = parseFloat(argv[++i]);
    else if (!a.startsWith('-') && !out.song) out.song = a;
  }
  return out;
}

let _buildWAV = null;
async function buildWav(interleaved, sampleRate) {
  if (!_buildWAV) {
    const mod = await import('../dist/export/wavWriter.js');
    _buildWAV = mod.buildWAV;
  }
  return Buffer.from(_buildWAV(interleaved, { sampleRate, bitDepth: 16, channels: 2 }));
}

function songDurationSec(song, bpm, override) {
  if (typeof override === 'number' && Number.isFinite(override)) return override;
  let maxTicks = 0;
  for (const ch of song.channels ?? []) {
    if (ch.events?.length > maxTicks) maxTicks = ch.events.length;
  }
  const tickSeconds = (60 / (bpm || 128)) / 4;
  return Math.ceil(maxTicks * tickSeconds) + 1;
}

async function bundleCaptureEntry() {
  const entry = join(__dirname, 'webaudio-ref-entry.ts');
  const outfile = join(engineRoot, 'dist-parity', 'webaudio-ref-bundle.js');
  mkdirSync(dirname(outfile), { recursive: true });
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome120'],
    outfile,
    sourcemap: false,
    logLevel: 'warning',
    // Node-only optional backends — browser uses native OfflineAudioContext.
    external: ['node-web-audio-api', 'standardized-audio-context'],
    plugins: [
      {
        name: 'stub-node-builtins',
        setup(build) {
          const stub = ['fs', 'path', 'os', 'crypto', 'url', 'module', 'worker_threads'];
          build.onResolve({ filter: /.*/ }, (args) => {
            if (stub.includes(args.path)) {
              return { path: args.path, namespace: 'node-stub' };
            }
          });
          build.onLoad({ filter: /.*/, namespace: 'node-stub' }, () => ({
            contents: 'export default {}; export const join = () => ""; export const dirname = () => ""; export const resolve = () => ""; export const readFileSync = () => "";',
            loader: 'js',
          }));
        },
      },
    ],
  });
  return outfile;
}

async function captureInChromium(bundlePath, playable, opts) {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') pageErrors.push(msg.text());
    });
    // about:blank denies localStorage (Player reads debug flags). Use a fake origin.
    await page.route('http://parity.test/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!DOCTYPE html><html><body></body></html>',
      }),
    );
    await page.goto('http://parity.test/');
    await page.addScriptTag({ path: bundlePath });
    const samples = await page.evaluate(async ({ playable, opts }) => {
      const api = globalThis.BeatBaxParity;
      if (!api?.renderOfflineWebAudioInBrowser) {
        throw new Error('BeatBaxParity bundle did not load');
      }
      const f32 = await api.renderOfflineWebAudioInBrowser(playable, opts);
      return Array.from(f32);
    }, { playable, opts });
    if (pageErrors.length) {
      console.warn('Chromium page errors:', pageErrors.slice(0, 5));
    }
    return new Float32Array(samples);
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const songPath = resolve(
    args.song || join(repoRoot, 'songs/gameboy/tutorial_groove.bax'),
  );
  if (!existsSync(songPath)) {
    console.error('Song not found:', songPath);
    process.exit(1);
  }

  // Ensure engine dist exists for PCM compare / WAV write
  const { parse } = await import('../dist/parser/index.js');
  const { resolveSong } = await import('../dist/song/resolver.js');
  const { renderSongToPCM } = await import('../dist/audio/pcmRenderer.js');
  const { compareParity } = await import('../dist/audio/parityCompare.js');
  const { peakLimitForPlayback, PLAYBACK_PEAK_CEILING } = await import(
    '../dist/audio/playbackLimiter.js'
  );

  const src = readFileSync(songPath, 'utf8');
  const ast = parse(src);
  const song = resolveSong(ast, { filename: songPath });
  const bpm = song.bpm ?? ast.bpm ?? 128;
  const sampleRate = args.sampleRate;
  const durationSec = songDurationSec(song, bpm, args.duration);

  const stem = basename(songPath).replace(/\.bax$/i, '');
  const outDir = resolve(
    args.outDir || join(engineRoot, 'tests/fixtures/parity', stem),
  );
  mkdirSync(outDir, { recursive: true });

  console.log(`Bundling Chromium Offline capture entry…`);
  const bundlePath = await bundleCaptureEntry();
  console.log(`Capturing WebAudio refs @ ${sampleRate} Hz, ${durationSec.toFixed(2)}s…`);

  const channels = [null, 1, 2, 3, 4];
  const report = [];

  for (const ch of channels) {
    const label = ch == null ? 'full' : `ch${ch}`;
    const renderChannels = ch == null ? undefined : [ch];
    const t0 = Date.now();
    const wa = await captureInChromium(bundlePath, song, {
      sampleRate,
      durationSec,
      renderChannels,
    });
    peakLimitForPlayback(wa, PLAYBACK_PEAK_CEILING);
    const waPath = join(outDir, `${stem}-webaudio-${label}.wav`);
    writeFileSync(waPath, await buildWav(wa, sampleRate));

    const pcm = renderSongToPCM(song, {
      sampleRate,
      channels: 2,
      bpm,
      duration: durationSec,
      renderChannels,
    });
    peakLimitForPlayback(pcm, PLAYBACK_PEAK_CEILING);
    const pcmPath = join(outDir, `${stem}-pcm-${label}.wav`);
    writeFileSync(pcmPath, await buildWav(pcm, sampleRate));

    const stats = compareParity(wa, pcm, { sampleRate, maxLagMs: 50, preprocess: true });
    report.push({ label, ...stats, ms: Date.now() - t0 });
    console.log(
      `${label}: winCorr=${stats.windowedCorrelation.toFixed(4)} bestCorr=${stats.bestCorrelation.toFixed(4)} ` +
      `lag=${stats.bestLagSamples} rmsWA=${stats.rmsA.toFixed(4)} rmsPCM=${stats.rmsB.toFixed(4)} (${Date.now() - t0}ms)`,
    );
  }

  const reportPath = join(outDir, 'compare-report.json');
  writeFileSync(reportPath, JSON.stringify({ song: songPath, sampleRate, durationSec, report }, null, 2));
  console.log(`Wrote ${outDir}`);
  console.log(`Report: ${reportPath}`);

  if (args.compare) {
    const ranked = [...report].sort((a, b) => a.windowedCorrelation - b.windowedCorrelation);
    console.log('\nRanked worst→best windowed correlation:');
    for (const r of ranked) {
      console.log(`  ${r.label}: win=${r.windowedCorrelation.toFixed(4)} full=${r.bestCorrelation.toFixed(4)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
