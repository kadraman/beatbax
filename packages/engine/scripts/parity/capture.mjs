#!/usr/bin/env node
/**
 * SC-001 capture (spec 112 T050 / T055).
 * Product gate: PCM vs Chromium OfflineAudioContext (`--offline-only --pcm-gate`).
 * Real-time WebAudio vs offline is an optional self-check that the gates are reachable;
 * note onsets can sit a fraction of a dB off offline, and under CI load (especially
 * macOS + parallel Jest) onsets can go silent while gap detection still reports 0.
 * Default Jest CI therefore uses --offline-only --pcm-gate; opt into real-time with
 * BEATBAX_PARITY_REALTIME=1 or by running this script without --offline-only.
 *
 *   node packages/engine/scripts/parity/capture.mjs [song.bax] [--offline-only] [--pcm-gate]
 *
 * --offline-only skips the real-time self-check and compares PCM to offline WebAudio.
 * --pcm-gate exits 1 when that PCM comparison fails. SC-002 uses both flags.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const engineRoot = resolve(__dirname, '../..');
const repoRoot = resolve(engineRoot, '../..');

const CHROMIUM_BINARIES = new Set([
  'chrome',
  'chrome.exe',
  'chrome-headless-shell',
  'chrome-headless-shell.exe',
  'Chromium',
  'Google Chrome for Testing',
]);

function hasChromium(root, depth = 0) {
  if (!root || depth > 5 || !existsSync(root)) return false;
  for (const name of readdirSync(root)) {
    if (CHROMIUM_BINARIES.has(name)) return true;
    const p = join(root, name);
    try {
      if (statSync(p).isDirectory() && hasChromium(p, depth + 1)) return true;
    } catch { /* ignore unreadable entries */ }
  }
  return false;
}
const configuredBrowsers = process.env.PLAYWRIGHT_BROWSERS_PATH;
if (configuredBrowsers && !hasChromium(configuredBrowsers)) {
  delete process.env.PLAYWRIGHT_BROWSERS_PATH;
}

const songArg = process.argv.slice(2).find((a) => !a.startsWith('-'));
const songPath = resolve(songArg || join(repoRoot, 'songs/gameboy/tutorial_groove.bax'));
if (!existsSync(songPath)) {
  console.error('Song not found:', songPath);
  process.exit(1);
}

const { parse } = await import('../../dist/parser/index.js');
const { resolveSong } = await import('../../dist/song/resolver.js');
const { renderSongToPCM } = await import('../../dist/audio/pcmRenderer.js');
const { compareSc001 } = await import('../../dist/audio/featureGates.js');

const src = readFileSync(songPath, 'utf8');
const ast = parse(src);
const song = resolveSong(ast, { filename: songPath });
const bpm = song.bpm ?? ast.bpm ?? 128;
let maxTicks = 0;
for (const ch of song.channels ?? []) maxTicks = Math.max(maxTicks, ch.events?.length ?? 0);
const tickSeconds = 60 / bpm / 4;
const songEndSec = maxTicks * tickSeconds;
const durationSec = songEndSec + 0.5;
const sampleRate = 44100;

function noteWindows(channelId) {
  const ch = song.channels.find((c) => c.id === channelId);
  const pitched = channelId !== 4;
  const notes = [];
  if (!ch) return notes;
  for (let i = 0; i < ch.events.length; i++) {
    const ev = ch.events[i];
    if (!ev || ev.type === 'rest' || ev.type === 'sustain') continue;
    let steps = 1;
    for (let j = i + 1; j < ch.events.length && ch.events[j].type === 'sustain'; j++) steps++;
    const effects = Array.isArray(ev.effects) ? ev.effects : [];
    const modulated = effects.some((fx) => fx && (fx.type === 'vib' || fx.type === 'arp' || fx.type === 'port'));
    notes.push({
      label: `ch${channelId} step ${i} ${ev.token || ev.instrument || ev.type}`,
      startSec: i * tickSeconds,
      endSec: (i + steps) * tickSeconds,
      modulated,
      pitched,
    });
  }
  return notes;
}

const bundle = join(engineRoot, 'dist-parity', 'parity-gates-bundle.js');
mkdirSync(dirname(bundle), { recursive: true });
await esbuild.build({
  entryPoints: [join(__dirname, 'capture-entry.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120'],
  outfile: bundle,
  logLevel: 'warning',
  external: ['node-web-audio-api', 'standardized-audio-context'],
  plugins: [{
    name: 'stub-node-builtins',
    setup(build) {
      const stub = ['fs', 'path', 'os', 'crypto', 'url', 'module', 'worker_threads'];
      build.onResolve({ filter: /.*/ }, (args) => (stub.includes(args.path) ? { path: args.path, namespace: 'node-stub' } : undefined));
      build.onLoad({ filter: /.*/, namespace: 'node-stub' }, () => ({
        contents: 'export default {}; export const existsSync = () => false; export const join = () => ""; export const dirname = () => ""; export const resolve = () => ""; export const posix = { join: () => "", dirname: () => "", resolve: () => "" }; export const readFileSync = () => "";',
        loader: 'js',
      }));
    },
  }],
});

function fromB64(s) {
  const buf = Buffer.from(s, 'base64');
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

const { chromium } = await import('@playwright/test');
const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.route('http://localhost/**', (r) => r.fulfill({
  contentType: 'text/html',
  headers: {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  },
  body: '<!DOCTYPE html><html><body></body></html>',
}));
await page.goto('http://localhost/');
const isolated = await page.evaluate(() => self.crossOriginIsolated);
if (!isolated) {
  console.error('Capture page is not cross-origin isolated, so the gap-free recorder cannot run');
  process.exit(1);
}
await page.addScriptTag({ path: bundle });

const opts = { sampleRate, durationSec };
if (process.argv.includes('--limiter-check')) {
  const sets = [
    { name: 'shipped threshold 0 knee 6 ratio 12', threshold: 0, knee: 6, ratio: 12, attack: 0.003, release: 0.1 },
  ];
  const decode = (s) => {
    const buf = Buffer.from(s, 'base64');
    return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  };
  const rms = (a, s, e) => {
    let x = 0;
    const n = Math.max(1, e - s);
    for (let i = s; i < e && i < a.length; i++) x += a[i] * a[i];
    return Math.sqrt(x / n);
  };
  for (const params of sets) {
    const raw = await page.evaluate(({ song, opts, params }) => globalThis.BeatBaxParityGates.measureLimiter(song, opts, params), { song, opts, params });
    const pre = decode(raw.pre);
    const post = decode(raw.post);
    let bestLag = 0;
    let best = -1;
    const lagMax = Math.round(0.02 * sampleRate);
    for (let lag = 0; lag <= lagMax; lag += 8) {
      let c = 0;
      const n = Math.min(pre.length, post.length) - lag;
      for (let i = 0; i < n; i += 16) c += pre[i] * post[i + lag];
      if (c > best) { best = c; bestLag = lag; }
    }
    const n = Math.min(pre.length, post.length - bestLag);
    const mix = 20 * Math.log10(rms(post, bestLag, bestLag + n) / Math.max(rms(pre, 0, n), 1e-12));
    const hop = Math.round(0.05 * sampleRate);
    let win = 0;
    for (let i = 0; i + hop <= n; i += hop) {
      const a = rms(pre, i, i + hop);
      const b = rms(post, i + bestLag, i + bestLag + hop);
      if (a < 0.01 && b < 0.01) continue;
      win = Math.max(win, Math.abs(20 * Math.log10(Math.max(b, 1e-12) / Math.max(a, 1e-12))));
    }
    console.log(`${params.name}: mix ${mix.toFixed(2)} dB, worst 50 ms ${win.toFixed(2)} dB, lag ${bestLag} samples`);
  }
  await browser.close();
  process.exit(0);
}
const offlineOnly = process.argv.includes('--offline-only');
const pcmGate = process.argv.includes('--pcm-gate');
let rt = null;
let selfRate = sampleRate;
if (!offlineOnly) {
  console.log('Warming up the audio thread…');
  await page.evaluate(({ song, opts }) => globalThis.BeatBaxParityGates.captureRealtime(song, { ...opts, durationSec: 1 }), { song, opts });
  console.log(`Capturing real-time and offline @ ${sampleRate} Hz, ${durationSec.toFixed(2)}s…`);
  for (let attempt = 1; attempt <= 3; attempt++) {
    rt = await page.evaluate(({ song, opts }) => globalThis.BeatBaxParityGates.captureRealtime(song, opts), { song, opts });
    if (rt.gaps === 0) break;
    console.warn(`Real-time capture dropped ${rt.gaps} audio blocks at frames ${rt.gapAt} (attempt ${attempt})`);
  }
} else {
  console.log(`Capturing offline @ ${sampleRate} Hz, ${durationSec.toFixed(2)}s…`);
}
if (rt && typeof rt.sampleRate === 'number' && rt.sampleRate > 0) {
  selfRate = rt.sampleRate;
  if (Math.abs(selfRate - sampleRate) > 1) {
    console.warn(`Real-time AudioContext ran at ${selfRate} Hz (requested ${sampleRate}); self-check offline will match`);
  }
}
const offSelfOpts = { sampleRate: selfRate, durationSec };
const off = await page.evaluate(
  ({ song, opts }) => globalThis.BeatBaxParityGates.captureOffline(song, opts),
  { song, opts: Math.abs(selfRate - sampleRate) > 1 ? offSelfOpts : opts },
);
// PCM compare stays on the requested rate. Recapture offline at 44100 when self-check used another rate.
let offPcm = off;
if (Math.abs(selfRate - sampleRate) > 1) {
  offPcm = await page.evaluate(({ song, opts }) => globalThis.BeatBaxParityGates.captureOffline(song, opts), { song, opts });
}
await browser.close();
if (errs.length) console.warn('page errors:', errs.slice(0, 8));
if (rt && rt.gaps > 0) {
  console.error(`Real-time capture dropped ${rt.gaps} audio blocks`);
  process.exit(1);
}

function peakOf(buf) {
  let p = 0;
  for (let i = 0; i < buf.length; i++) p = Math.max(p, Math.abs(buf[i]));
  return p;
}

/** Lag L maximizing Σ off[i]·rt[i+L]. Positive ⇒ real-time is late vs offline. */
function correlateLag(offBuf, rtBuf, maxLag, step = 8) {
  let bestLag = 0;
  let best = -Infinity;
  const n = Math.min(offBuf.length, rtBuf.length);
  for (let lag = -maxLag; lag <= maxLag; lag += step) {
    let c = 0;
    const i0 = Math.max(0, -lag);
    const i1 = Math.min(n, n - lag);
    for (let i = i0; i < i1; i += 16) c += offBuf[i] * rtBuf[i + lag];
    if (c > best) {
      best = c;
      bestLag = lag;
    }
  }
  return bestLag;
}

/** Place real-time onto the offline timeline using lag from {@link correlateLag}. */
function alignRtToOffline(rtBuf, offLen, lag) {
  const aligned = new Float32Array(offLen);
  if (lag >= 0) {
    const m = Math.min(offLen, Math.max(0, rtBuf.length - lag));
    if (m > 0) aligned.set(rtBuf.subarray(lag, lag + m));
  } else {
    const L = -lag;
    const m = Math.min(offLen - L, rtBuf.length);
    if (m > 0) aligned.set(rtBuf.subarray(0, m), L);
  }
  return aligned;
}

const labels = ['full', 'ch1', 'ch2', 'ch3', 'ch4'];
const report = {
  song: songPath,
  sampleRate,
  selfSampleRate: selfRate,
  durationSec,
  songEndSec,
  rtLagSamples: 0,
  self: {},
  pcm: {},
};
let selfPass = true;
let pcmPass = true;
let rtAligned = null;
if (rt) {
  const offFull = fromB64(off.buffers[0]);
  const rtFull = fromB64(rt.buffers[0]);
  // Hosts can still land a few milliseconds off after rate matching.
  const maxLag = Math.round(0.05 * selfRate);
  const coarse = correlateLag(offFull, rtFull, maxLag, 8);
  const refinePad = 8;
  let best = -Infinity;
  let rtLag = coarse;
  for (let lag = Math.max(-maxLag, coarse - refinePad); lag <= Math.min(maxLag, coarse + refinePad); lag++) {
    let c = 0;
    const n = Math.min(offFull.length, rtFull.length);
    const i0 = Math.max(0, -lag);
    const i1 = Math.min(n, n - lag);
    for (let i = i0; i < i1; i += 16) c += offFull[i] * rtFull[i + lag];
    if (c > best) {
      best = c;
      rtLag = lag;
    }
  }
  report.rtLagSamples = rtLag;
  rtAligned = labels.map((_, i) => alignRtToOffline(fromB64(rt.buffers[i]), fromB64(off.buffers[i]).length, rtLag));
  console.log(`Real-time/offline lag ${rtLag} samples (${((rtLag / selfRate) * 1000).toFixed(2)} ms) @ ${selfRate} Hz`);
}
for (let i = 0; i < labels.length; i++) {
  const label = labels[i];
  const offSelfBuf = fromB64(off.buffers[i]);
  const offPcmBuf = fromB64(offPcm.buffers[i]);
  const notes = label === 'full' ? [] : noteWindows(i);
  if (rt && rtAligned) {
    const rtBuf = rtAligned[i];
    console.log(`${label} peak rt ${peakOf(rtBuf).toFixed(4)} offline ${peakOf(offSelfBuf).toFixed(4)}`);
    const self = compareSc001(rtBuf, offSelfBuf, selfRate, notes, songEndSec, label === 'full');
    report.self[label] = self;
    selfPass &&= self.pass;
    console.log(`WA self ${label}: ${self.pass ? 'pass' : 'FAIL'} ${self.failures.slice(0, 6).join(' | ')}`);
  } else {
    console.log(`${label} peak offline ${peakOf(offPcmBuf).toFixed(4)}`);
  }

  const renderChannels = label === 'full' ? undefined : [i];
  const pcm = renderSongToPCM(song, { sampleRate, channels: 2, bpm, duration: durationSec, renderChannels });
  // Channel buses are mono. A stereo panner downmixes as (L+R)/2 before the tap.
  // PCM center pan is dual-mono, so the average matches the left channel there.
  const pcmMono = new Float32Array(pcm.length / 2);
  for (let s = 0; s < pcmMono.length; s++) pcmMono[s] = 0.5 * (pcm[s * 2] + (pcm[s * 2 + 1] || 0));
  const pcmReport = compareSc001(offPcmBuf, pcmMono, sampleRate, notes, songEndSec, label === 'full');
  report.pcm[label] = { pass: pcmReport.pass, failures: pcmReport.failures.slice(0, 12), mixRmsDb: pcmReport.mixRmsDb };
  pcmPass &&= pcmReport.pass;
  console.log(`PCM ${label}: ${pcmReport.pass ? 'pass' : 'not yet'} (${pcmReport.failures.length} failures, T055)`);
  if (!pcmReport.pass) {
    console.log(`  pcm: ${pcmReport.failures.slice(0, 8).join(' | ')}`);
  }
  if (rt && rtAligned && Math.abs(selfRate - sampleRate) <= 1) {
    const rtPcm = compareSc001(rtAligned[i], pcmMono, sampleRate, notes, songEndSec, label === 'full');
    if (!rtPcm.pass) {
      console.log(`  real-time differs: ${rtPcm.failures.slice(0, 4).join(' | ')}`);
    }
  }
}

const outDir = join(engineRoot, 'dist-parity');
writeFileSync(join(outDir, 'sc001-report.json'), JSON.stringify(report, null, 2));
console.log('Wrote', join(outDir, 'sc001-report.json'));
if (!selfPass) process.exit(1);
if (pcmGate && !pcmPass) process.exit(1);
