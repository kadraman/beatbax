/**
 * Legacy: synthesize placeholder NES DMC kit WAVs + .dmc files.
 *
 * Prefer CC0 sources via:
 *   node scripts/convert-cc0-nes-dmc-kit.mjs
 *   node scripts/patch-dmc-samples.mjs
 *
 * Usage: node scripts/generate-nes-dmc-kit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { encodeDMCFromPCM } from '../packages/engine/dist/chips/nes/dmcEncode.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WAV_DIR = path.join(ROOT, 'samples', 'wav', 'nes_kit');
const DMC_DIR = path.join(ROOT, 'samples', 'dmc');
const SR = 44100;

/** Deterministic xorshift32 so NOTICE checksums stay stable across regenerations. */
let rngState = 0xbea7ba09 >>> 0;
function rand() {
  rngState ^= rngState << 13;
  rngState >>>= 0;
  rngState ^= rngState >>> 17;
  rngState ^= rngState << 5;
  rngState >>>= 0;
  return (rngState >>> 0) / 0x100000000;
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function writeWav16Mono(filePath, samples, sampleRate = SR) {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = clamp(Math.round(samples[i] * 32767), -32768, 32767);
    buf.writeInt16LE(s, 44 + i * 2);
  }
  fs.writeFileSync(filePath, buf);
}

function onePoleLp(src, cutoffHz, sampleRate) {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / sampleRate;
  const alpha = dt / (rc + dt);
  const out = new Float32Array(src.length);
  let y = src[0] ?? 0;
  for (let i = 0; i < src.length; i++) {
    y = y + alpha * (src[i] - y);
    out[i] = y;
  }
  return out;
}

function onePoleHp(src, cutoffHz, sampleRate) {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / sampleRate;
  const alpha = rc / (rc + dt);
  const out = new Float32Array(src.length);
  let prevX = src[0] ?? 0;
  let prevY = 0;
  for (let i = 0; i < src.length; i++) {
    const x = src[i];
    const y = alpha * (prevY + x - prevX);
    out[i] = y;
    prevX = x;
    prevY = y;
  }
  return out;
}

function mulGain(src, g) {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = src[i] * g;
  return out;
}

function fadeOut(src, ms, sampleRate = SR) {
  const n = Math.min(src.length, Math.floor((ms / 1000) * sampleRate));
  if (n <= 0) return src;
  const out = src.slice();
  const start = out.length - n;
  for (let i = 0; i < n; i++) {
    out[start + i] *= 1 - i / n;
  }
  return out;
}

function softClip(src, drive = 1.2) {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const x = src[i] * drive;
    out[i] = Math.tanh(x);
  }
  return out;
}

/** Pitch-dropped sine kick with click transient. */
function synthKick({ durationMs, startHz, endHz, click = 0.35, body = 0.7 }) {
  const n = Math.floor((durationMs / 1000) * SR);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.exp(-t * (3.2 + 8 / (durationMs / 100)));
    const clickEnv = Math.exp(-t * 180) * click;
    const frac = i / Math.max(1, n - 1);
    const hz = startHz * Math.pow(endHz / startHz, frac);
    phase += (2 * Math.PI * hz) / SR;
    const bodyWave = Math.sin(phase) * body * env;
    const noiseClick = (rand() * 2 - 1) * clickEnv * 0.4;
    out[i] = bodyWave + noiseClick + Math.sin(phase * 2) * env * 0.08;
  }
  return fadeOut(onePoleLp(softClip(out, 1.1), 4500, SR), 6);
}

function synthSnare({ durationMs, toneHz, noiseAmt = 0.75, toneAmt = 0.45 }) {
  const n = Math.floor((durationMs / 1000) * SR);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const toneEnv = Math.exp(-t * 28);
    const noiseEnv = Math.exp(-t * (12 + 40 / (durationMs / 100)));
    phase += (2 * Math.PI * toneHz) / SR;
    const tone = Math.sin(phase) * toneAmt * toneEnv;
    const noise = (rand() * 2 - 1) * noiseAmt * noiseEnv;
    out[i] = tone + noise;
  }
  return fadeOut(onePoleHp(onePoleLp(out, 7000, SR), 180, SR), 8);
}

function synthHat({ durationMs, bright = true }) {
  const n = Math.floor((durationMs / 1000) * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.exp(-t * (bright ? 55 : 18));
    out[i] = (rand() * 2 - 1) * env;
  }
  const cut = bright ? 9000 : 6000;
  return fadeOut(onePoleHp(onePoleLp(out, cut, SR), bright ? 2500 : 1200, SR), 4);
}

function synthCrash(durationMs = 420) {
  const n = Math.floor((durationMs / 1000) * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 6.5);
    out[i] = (rand() * 2 - 1) * env;
  }
  return fadeOut(onePoleHp(onePoleLp(out, 8500, SR), 1800, SR), 20);
}

function synthRim(durationMs = 55) {
  const n = Math.floor((durationMs / 1000) * SR);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 90);
    phase += (2 * Math.PI * 980) / SR;
    out[i] = Math.sin(phase) * env * 0.55 + (rand() * 2 - 1) * env * 0.35;
  }
  return fadeOut(onePoleHp(out, 400, SR), 3);
}

function synthShaker(durationMs = 90) {
  const n = Math.floor((durationMs / 1000) * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const grain = Math.sin(t * 140) * 0.5 + 0.5;
    const env = Math.exp(-t * 22) * grain;
    out[i] = (rand() * 2 - 1) * env;
  }
  return fadeOut(onePoleHp(onePoleLp(out, 7500, SR), 2200, SR), 5);
}

function synthCowbell(durationMs = 160) {
  const n = Math.floor((durationMs / 1000) * SR);
  const out = new Float32Array(n);
  let p1 = 0;
  let p2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 16);
    p1 += (2 * Math.PI * 560) / SR;
    p2 += (2 * Math.PI * 845) / SR;
    out[i] = (Math.sin(p1) + Math.sin(p2) * 0.7) * 0.45 * env;
  }
  return fadeOut(onePoleLp(out, 5000, SR), 8);
}

function synthBassSawC2(durationMs = 220) {
  // C2 ≈ 65.41 Hz
  const hz = 65.41;
  const n = Math.floor((durationMs / 1000) * SR);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 9) * (1 - Math.exp(-t * 220));
    phase += hz / SR;
    if (phase >= 1) phase -= 1;
    // Band-limited-ish saw: fundamental + a few harmonics
    let s = 0;
    for (let h = 1; h <= 8; h++) {
      s += Math.sin(2 * Math.PI * phase * h) / h;
    }
    out[i] = s * 0.35 * env;
  }
  return fadeOut(onePoleLp(out, 1800, SR), 10);
}

function synthOrchHit(durationMs = 700) {
  const n = Math.floor((durationMs / 1000) * SR);
  const out = new Float32Array(n);
  const freqs = [130.81, 164.81, 196.0, 261.63, 329.63]; // C3 E3 G3 C4 E4
  const phases = freqs.map(() => 0);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.exp(-t * 4.2) * (1 - Math.exp(-t * 90));
    let s = 0;
    for (let k = 0; k < freqs.length; k++) {
      phases[k] += (2 * Math.PI * freqs[k]) / SR;
      s += Math.sin(phases[k]) / (k + 1);
    }
    const brass = Math.tanh(s * 1.4);
    out[i] = brass * 0.55 * env + (rand() * 2 - 1) * Math.exp(-t * 40) * 0.08;
  }
  return fadeOut(onePoleLp(out, 4500, SR), 25);
}

/**
 * Formant-ish vowel burst for short syllables (yeah / go).
 * Not speech recognition quality — DPCM-friendly vowel blob with attack.
 */
function synthSyllable({ durationMs, f1, f2, f0 = 140, open = 0.7 }) {
  const n = Math.floor((durationMs / 1000) * SR);
  const out = new Float32Array(n);
  let p0 = 0;
  let p1 = 0;
  let p2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const attack = 1 - Math.exp(-t * 80);
    const body = Math.exp(-t * (3.5 / open));
    const env = attack * body;
    p0 += (2 * Math.PI * f0) / SR;
    p1 += (2 * Math.PI * f1) / SR;
    p2 += (2 * Math.PI * f2) / SR;
    const glottal = Math.sin(p0) * 0.5 + Math.sin(p0 * 2) * 0.2;
    const form = Math.sin(p1) * 0.55 + Math.sin(p2) * 0.35;
    out[i] = (glottal * 0.4 + form) * env * 0.55;
  }
  return fadeOut(onePoleLp(onePoleHp(out, 120, SR), 3200, SR), 12);
}

/** Time-compress PCM by factor (>1 = shorter / higher). */
function resampleSpeed(src, factor) {
  const outLen = Math.max(1, Math.floor(src.length / factor));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcPos = i * factor;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(src.length - 1, i0 + 1);
    const frac = srcPos - i0;
    out[i] = src[i0] * (1 - frac) + src[i1] * frac;
  }
  return out;
}

/**
 * Build a short "ready" phrase as three vowel blobs, then speed up by rate15/rate12.
 */
function synthVoiceReady() {
  const rate15 = 33143.94;
  const rate12 = 16884.65;
  const factor = rate15 / rate12; // ~1.963
  const parts = [
    synthSyllable({ durationMs: 280, f1: 600, f2: 1200, f0: 130, open: 0.85 }), // "reh"
    mulGain(new Float32Array(Math.floor(0.05 * SR)), 0),
    synthSyllable({ durationMs: 320, f1: 450, f2: 900, f0: 120, open: 0.95 }), // "eh"
    mulGain(new Float32Array(Math.floor(0.04 * SR)), 0),
    synthSyllable({ durationMs: 360, f1: 400, f2: 800, f0: 110, open: 1.0 }), // "dee"
  ];
  let total = 0;
  for (const p of parts) total += p.length;
  const joined = new Float32Array(total);
  let o = 0;
  for (const p of parts) {
    joined.set(p, o);
    o += p.length;
  }
  return fadeOut(resampleSpeed(joined, factor), 15);
}

const KIT = [
  { name: 'kick_punch', pcm: () => synthKick({ durationMs: 100, startHz: 160, endHz: 48, click: 0.4, body: 0.75 }), maxMs: 120, gain: 0.55 },
  { name: 'kick_body', pcm: () => synthKick({ durationMs: 210, startHz: 140, endHz: 40, click: 0.28, body: 0.8 }), maxMs: 230, gain: 0.5 },
  { name: 'snare_tight', pcm: () => synthSnare({ durationMs: 140, toneHz: 210, noiseAmt: 0.7, toneAmt: 0.4 }), maxMs: 160, gain: 0.5 },
  { name: 'snare_fat', pcm: () => synthSnare({ durationMs: 190, toneHz: 175, noiseAmt: 0.8, toneAmt: 0.5 }), maxMs: 210, gain: 0.48 },
  { name: 'hat_closed', pcm: () => synthHat({ durationMs: 55, bright: true }), maxMs: 70, gain: 0.45 },
  { name: 'hat_open', pcm: () => synthHat({ durationMs: 220, bright: false }), maxMs: 240, gain: 0.42 },
  { name: 'crash', pcm: () => synthCrash(400), maxMs: 420, gain: 0.4 },
  { name: 'rim', pcm: () => synthRim(55), maxMs: 70, gain: 0.5 },
  { name: 'shaker', pcm: () => synthShaker(90), maxMs: 100, gain: 0.45 },
  { name: 'cowbell', pcm: () => synthCowbell(150), maxMs: 170, gain: 0.48 },
  { name: 'bass_saw_c2', pcm: () => synthBassSawC2(220), maxMs: 240, gain: 0.55 },
  { name: 'orch_hit', pcm: () => synthOrchHit(650), maxMs: 700, gain: 0.45 },
  { name: 'voice_yeah', pcm: () => synthSyllable({ durationMs: 180, f1: 700, f2: 1400, f0: 150, open: 0.8 }), maxMs: 200, gain: 0.5 },
  { name: 'voice_go', pcm: () => synthSyllable({ durationMs: 160, f1: 500, f2: 900, f0: 125, open: 0.7 }), maxMs: 180, gain: 0.5 },
  { name: 'voice_ready', pcm: () => synthVoiceReady(), maxMs: 980, gain: 0.48 },
];

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function chunkBase64(b64, width = 72) {
  const lines = [];
  for (let i = 0; i < b64.length; i += width) lines.push(b64.slice(i, i + width));
  return lines;
}

fs.mkdirSync(WAV_DIR, { recursive: true });
fs.mkdirSync(DMC_DIR, { recursive: true });

const noticeRows = [];
const embed = [];

for (const item of KIT) {
  const pcm = item.pcm();
  const wavPath = path.join(WAV_DIR, `${item.name}.wav`);
  writeWav16Mono(wavPath, pcm);
  const encoded = encodeDMCFromPCM(pcm, SR, {
    rateIndex: 15,
    gain: item.gain,
    trimSilence: true,
    trimSilenceDb: -45,
    tailMs: 8,
    fadeOutMs: 4,
    maxDurationMs: item.maxMs,
    maxBytes: 4096,
    trim: true,
  });
  const dmcPath = path.join(DMC_DIR, `${item.name}.dmc`);
  fs.writeFileSync(dmcPath, Buffer.from(encoded.bytes));
  const b64 = Buffer.from(encoded.bytes).toString('base64');
  const hash = sha256(Buffer.from(encoded.bytes));
  noticeRows.push({
    name: item.name,
    bytes: encoded.byteLength,
    ms: Math.round(encoded.durationSec * 1000),
    hash,
  });
  const constName = item.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_') + '_SAMPLE';
  embed.push({ name: item.name, constName, b64, bytes: encoded.byteLength, ms: Math.round(encoded.durationSec * 1000) });
  console.log(
    `${item.name.padEnd(14)} ${String(encoded.byteLength).padStart(5)} bytes  ${encoded.durationSec.toFixed(3)}s @ rate 15`
  );
}

const notice = [
  '# BeatBax NES DMC sample provenance',
  '',
  'All files listed below under "Feature 109 kit" are **original synthesis** by the',
  'BeatBax Team (script: `scripts/generate-nes-dmc-kit.mjs`). They are not derived',
  'from commercial drum ROM dumps, NES game rips, or third-party soundfonts.',
  'License: MIT (same as the BeatBax repository) for these generated assets.',
  '',
  'Encoded with `encodeDMCFromPCM` at NTSC dmc_rate=15 unless a song plays them',
  'slower (see `voice_ready`: encode @15, designed playback rate 12).',
  '',
  '## Feature 109 kit',
  '',
  '| Name | Bytes | ~ms @15 | SHA-256 |',
  '|------|------:|--------:|---------|',
  ...noticeRows.map((r) => `| ${r.name} | ${r.bytes} | ${r.ms} | ${r.hash} |`),
  '',
  '## Pre-existing classic samples',
  '',
  'Files such as `kick.dmc`, `snare.dmc`, `clap.dmc`, `bongo.dmc`, `*_tom.dmc`,',
  '`muted_bongo.dmc` were already present in the tree and remain the classic',
  '`@nes/kick` / `@nes/snare` / latin kit. Do not confuse with unbundled',
  '`kick_909.dmc` / `snare_909.dmc` / `low_kick.dmc` / `open_hihat.dmc`, which are',
  '**not** registered in `BUNDLED_SAMPLES` pending clear CC0 provenance.',
  '',
].join('\n');

fs.writeFileSync(path.join(DMC_DIR, 'NOTICE'), notice);

console.log(`\nWrote NOTICE and ${embed.length} samples.`);
console.log('Next: node scripts/patch-dmc-samples.mjs');
