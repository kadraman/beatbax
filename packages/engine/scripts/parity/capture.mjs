#!/usr/bin/env node
/**
 * SC-001 capture (spec 112 T050).
 * WebAudio real-time vs WebAudio offline, limiter bypassed, must pass the feature gates.
 * PCM vs offline WebAudio is the T055 report. Real-time is the self-check
 * reference only: its note onsets can sit a fraction of a dB off the offline render.
 *
 *   node packages/engine/scripts/parity/capture.mjs [song.bax]
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const engineRoot = resolve(__dirname, '../..');
const repoRoot = resolve(engineRoot, '../..');

function hasChromium(root, depth = 0) {
  if (!root || depth > 5 || !existsSync(root)) return false;
  for (const name of readdirSync(root)) {
    if (name === 'chrome.exe' || name === 'chrome-headless-shell.exe') return true;
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
console.log('Warming up the audio thread…');
await page.evaluate(({ song, opts }) => globalThis.BeatBaxParityGates.captureRealtime(song, { ...opts, durationSec: 1 }), { song, opts });
console.log(`Capturing real-time and offline @ ${sampleRate} Hz, ${durationSec.toFixed(2)}s…`);
let rt = null;
for (let attempt = 1; attempt <= 3; attempt++) {
  rt = await page.evaluate(({ song, opts }) => globalThis.BeatBaxParityGates.captureRealtime(song, opts), { song, opts });
  if (rt.gaps === 0) break;
  console.warn(`Real-time capture dropped ${rt.gaps} audio blocks at frames ${rt.gapAt} (attempt ${attempt})`);
}
const off = await page.evaluate(({ song, opts }) => globalThis.BeatBaxParityGates.captureOffline(song, opts), { song, opts });
await browser.close();
if (errs.length) console.warn('page errors:', errs.slice(0, 8));
if (rt.gaps > 0) {
  console.error(`Real-time capture dropped ${rt.gaps} audio blocks`);
  process.exit(1);
}

function peakOf(buf) {
  let p = 0;
  for (let i = 0; i < buf.length; i++) p = Math.max(p, Math.abs(buf[i]));
  return p;
}

const labels = ['full', 'ch1', 'ch2', 'ch3', 'ch4'];
const report = { song: songPath, sampleRate, durationSec, songEndSec, self: {}, pcm: {} };
let selfPass = true;
for (let i = 0; i < labels.length; i++) {
  const label = labels[i];
  const rtBuf = fromB64(rt.buffers[i]);
  const offBuf = fromB64(off.buffers[i]);
  console.log(`${label} peak rt ${peakOf(rtBuf).toFixed(4)} offline ${peakOf(offBuf).toFixed(4)}`);
  const notes = label === 'full' ? [] : noteWindows(i);
  const self = compareSc001(rtBuf, offBuf, sampleRate, notes, songEndSec, label === 'full');
  report.self[label] = self;
  selfPass &&= self.pass;
  console.log(`WA self ${label}: ${self.pass ? 'pass' : 'FAIL'} ${self.failures.slice(0, 6).join(' | ')}`);

  const renderChannels = label === 'full' ? undefined : [i];
  const pcm = renderSongToPCM(song, { sampleRate, channels: 2, bpm, duration: durationSec, renderChannels });
  const pcmMono = new Float32Array(pcm.length / 2);
  for (let s = 0; s < pcmMono.length; s++) pcmMono[s] = pcm[s * 2];
  const pcmReport = compareSc001(offBuf, pcmMono, sampleRate, notes, songEndSec, label === 'full');
  const rtPcm = compareSc001(rtBuf, pcmMono, sampleRate, notes, songEndSec, label === 'full');
  report.pcm[label] = { pass: pcmReport.pass, failures: pcmReport.failures.slice(0, 12), mixRmsDb: pcmReport.mixRmsDb };
  console.log(`PCM ${label}: ${pcmReport.pass ? 'pass' : 'not yet'} (${pcmReport.failures.length} failures, T055)`);
  if (!rtPcm.pass) {
    console.log(`  real-time differs: ${rtPcm.failures.slice(0, 4).join(' | ')}`);
  }
}

const outDir = join(engineRoot, 'dist-parity');
writeFileSync(join(outDir, 'sc001-report.json'), JSON.stringify(report, null, 2));
console.log('Wrote', join(outDir, 'sc001-report.json'));
if (!selfPass) process.exit(1);
