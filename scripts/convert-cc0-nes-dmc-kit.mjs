/**
 * Convert CC0 source audio into the Feature 109 NES DMC kit.
 *
 * Prerequisites: downloads under samples/wav/nes_kit/_dl/ (see script body),
 * ffmpeg on PATH, engine dist with encodeDMCFromPCM.
 *
 * Usage: node scripts/convert-cc0-nes-dmc-kit.mjs
 * Then:  node scripts/patch-dmc-samples.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { encodeDMCFromPCM } from '../packages/engine/dist/chips/nes/dmcEncode.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WAV_DIR = path.join(ROOT, 'samples', 'wav', 'nes_kit');
const DMC_DIR = path.join(ROOT, 'samples', 'dmc');
const DL = path.join(WAV_DIR, '_dl');
const SFX = path.join(
  DL,
  'sfx16',
  'SFX- The Ultimate 2017 16 bit Mini pack'
);
const VOICE_M = path.join(DL, 'voice', 'Male');

const SR = 44100;
const RATE15 = 33143.94;
const RATE12 = 16884.65;

function findFfmpeg() {
  const probes =
    process.platform === 'win32'
      ? [
          ['where.exe', ['ffmpeg']],
          ['where', ['ffmpeg']],
        ]
      : [
          ['command', ['-v', 'ffmpeg']],
          ['which', ['ffmpeg']],
        ];
  for (const [cmd, args] of probes) {
    const found = spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform !== 'win32' });
    if (found.status === 0) {
      const line = found.stdout.split(/\r?\n/).find((l) => l.trim());
      if (line) return line.trim();
    }
  }
  const direct = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  if (direct.status === 0) return 'ffmpeg';
  throw new Error('ffmpeg not found on PATH');
}

const FFMPEG = findFfmpeg();

function runFfmpeg(args) {
  const r = spawnSync(FFMPEG, ['-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`ffmpeg failed: ${args.join(' ')}\n${r.stderr}`);
  }
}

function readWav16Mono(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error(`not RIFF: ${filePath}`);
  let offset = 12;
  let sampleRate = 0;
  let bits = 0;
  let channels = 0;
  let dataOffset = 0;
  let dataSize = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(start + 2);
      sampleRate = buf.readUInt32LE(start + 4);
      bits = buf.readUInt16LE(start + 14);
    } else if (id === 'data') {
      dataOffset = start;
      dataSize = size;
      break;
    }
    offset = start + size + (size % 2);
  }
  if (!dataOffset || bits !== 16) {
    throw new Error(`expected 16-bit PCM WAV: ${filePath} (bits=${bits})`);
  }
  const nFrames = Math.floor(dataSize / (2 * channels));
  const out = new Float32Array(nFrames);
  for (let i = 0; i < nFrames; i++) {
    let acc = 0;
    for (let c = 0; c < channels; c++) {
      acc += buf.readInt16LE(dataOffset + (i * channels + c) * 2) / 32768;
    }
    out[i] = acc / channels;
  }
  return { samples: out, sampleRate };
}

function toMono16(srcPath, destPath, { speedUp = 1, lowpassHz = 0, highpassHz = 0, durationSec = 0 } = {}) {
  const filters = ['pan=mono|c0=0.5*c0+0.5*c1'];
  if (highpassHz > 0) filters.push(`highpass=f=${highpassHz}`);
  if (lowpassHz > 0) filters.push(`lowpass=f=${lowpassHz}`);
  if (speedUp > 1.001) {
    // Tape-speed: raises pitch and shortens duration (needed for encode@15 / play@12).
    filters.push(`asetrate=${Math.round(SR * speedUp)},aresample=${SR}`);
  }
  if (durationSec > 0) filters.push(`atrim=0:${durationSec}`, 'afade=t=out:st=' + Math.max(0, durationSec - 0.02) + ':d=0.02');
  const args = ['-i', srcPath, '-ac', '1', '-ar', String(SR), '-sample_fmt', 's16'];
  if (filters.length) args.push('-af', filters.join(','));
  args.push(destPath);
  runFfmpeg(args);
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/** Kit map: name → { src, prep, encode } */
const KIT = [
  {
    name: 'kick_punch',
    src: path.join(SFX, 'Bass Drum', 'Wav', 'Bass Drum__005.wav'),
    url: 'https://opengameart.org/content/sfx-the-ultimate-2017-16-bit-mini-pack',
    author: 'phoenix1291 (SwissArcadeGameEntertainment)',
    note: 'Bass Drum__005.wav',
    prep: { lowpassHz: 5000, highpassHz: 30, durationSec: 0.12 },
    gain: 0.55,
    maxMs: 130,
  },
  {
    name: 'kick_body',
    src: path.join(SFX, 'Bass Drum', 'Wav', 'Bass Drum__001.wav'),
    url: 'https://opengameart.org/content/sfx-the-ultimate-2017-16-bit-mini-pack',
    author: 'phoenix1291 (SwissArcadeGameEntertainment)',
    note: 'Bass Drum__001.wav',
    prep: { lowpassHz: 4500, highpassHz: 30, durationSec: 0.22 },
    gain: 0.5,
    maxMs: 230,
  },
  {
    name: 'snare_tight',
    src: path.join(DL, 'snare_spring.wav'),
    url: 'https://opengameart.org/content/8-bitlo-fi-snare-drum-sound',
    author: 'Spring Spring',
    note: 'snare.wav (8-bit/lo-fi snare)',
    prep: { lowpassHz: 7000, highpassHz: 150, durationSec: 0.16 },
    gain: 0.5,
    maxMs: 170,
  },
  {
    name: 'snare_fat',
    src: path.join(DL, 'best_snare.wav'),
    url: 'https://opengameart.org/content/an-interesting-snare-drum-sound',
    author: 'Spring Spring',
    note: 'best_snare.wav',
    prep: { lowpassHz: 6500, highpassHz: 120, durationSec: 0.2 },
    gain: 0.48,
    maxMs: 210,
  },
  {
    name: 'hat_closed',
    src: path.join(SFX, 'Hi-hat', 'Wav', 'Hi-hat__002.wav'),
    url: 'https://opengameart.org/content/sfx-the-ultimate-2017-16-bit-mini-pack',
    author: 'phoenix1291 (SwissArcadeGameEntertainment)',
    note: 'Hi-hat__002.wav',
    prep: { lowpassHz: 9000, highpassHz: 2000, durationSec: 0.07 },
    gain: 0.45,
    maxMs: 80,
  },
  {
    name: 'hat_open',
    src: path.join(SFX, 'Hi-hat', 'Wav', 'Hi-hat__006.wav'),
    url: 'https://opengameart.org/content/sfx-the-ultimate-2017-16-bit-mini-pack',
    author: 'phoenix1291 (SwissArcadeGameEntertainment)',
    note: 'Hi-hat__006.wav',
    prep: { lowpassHz: 8000, highpassHz: 1200, durationSec: 0.24 },
    gain: 0.42,
    maxMs: 250,
  },
  {
    name: 'crash',
    src: path.join(SFX, 'Explosion', 'Wav', 'Explosion__001.wav'),
    url: 'https://opengameart.org/content/sfx-the-ultimate-2017-16-bit-mini-pack',
    author: 'phoenix1291 (SwissArcadeGameEntertainment)',
    note: 'Explosion__001.wav (noise burst used as crash)',
    prep: { lowpassHz: 7500, highpassHz: 800, durationSec: 0.4 },
    gain: 0.4,
    maxMs: 420,
  },
  {
    name: 'rim',
    src: path.join(SFX, 'Punch', 'Wav', 'Punch__005.wav'),
    url: 'https://opengameart.org/content/sfx-the-ultimate-2017-16-bit-mini-pack',
    author: 'phoenix1291 (SwissArcadeGameEntertainment)',
    note: 'Punch__005.wav (short click used as rim)',
    prep: { lowpassHz: 6000, highpassHz: 300, durationSec: 0.06 },
    gain: 0.5,
    maxMs: 70,
  },
  {
    name: 'shaker',
    src: path.join(SFX, 'Footstep', 'Wav', 'Footstep__001.wav'),
    url: 'https://opengameart.org/content/sfx-the-ultimate-2017-16-bit-mini-pack',
    author: 'phoenix1291 (SwissArcadeGameEntertainment)',
    note: 'Footstep__001.wav (grainy transient used as shaker)',
    prep: { lowpassHz: 7500, highpassHz: 1800, durationSec: 0.1 },
    gain: 0.45,
    maxMs: 110,
  },
  {
    name: 'cowbell',
    src: path.join(SFX, 'Menu', 'Wav', 'Menu__001.wav'),
    url: 'https://opengameart.org/content/sfx-the-ultimate-2017-16-bit-mini-pack',
    author: 'phoenix1291 (SwissArcadeGameEntertainment)',
    note: 'Menu__001.wav (tonal blip used as cowbell)',
    prep: { lowpassHz: 5000, highpassHz: 200, durationSec: 0.16 },
    gain: 0.48,
    maxMs: 170,
  },
  {
    name: 'bass_saw_c2',
    src: path.join(SFX, 'Instrument', 'Wav', 'Instrument__001.wav'),
    url: 'https://opengameart.org/content/sfx-the-ultimate-2017-16-bit-mini-pack',
    author: 'phoenix1291 (SwissArcadeGameEntertainment)',
    note: 'Instrument__001.wav (sustained low instrument tone)',
    prep: { lowpassHz: 2000, highpassHz: 40, durationSec: 0.24 },
    gain: 0.55,
    maxMs: 250,
  },
  {
    name: 'orch_hit',
    src: path.join(DL, 'orch_hit_sfxmint.mp3'),
    url: 'https://sfxmint.com/sounds/orchestral-hit-01',
    author: 'SFXMint',
    note: 'orchestral-hit-01.mp3 (brass+strings stab; CC0)',
    prep: { lowpassHz: 4500, highpassHz: 60, durationSec: 0.85 },
    gain: 0.45,
    maxMs: 900,
  },
  {
    name: 'voice_yeah',
    src: path.join(VOICE_M, 'correct.ogg'),
    url: 'https://opengameart.org/content/voiceover-pack-40-lines',
    author: 'Kenney (www.kenney.nl)',
    note: 'Male/correct.ogg (short affirmative; mapped to voice_yeah)',
    prep: { lowpassHz: 3500, highpassHz: 100, durationSec: 0.35 },
    gain: 0.5,
    maxMs: 360,
  },
  {
    name: 'voice_go',
    src: path.join(VOICE_M, 'go.ogg'),
    url: 'https://opengameart.org/content/voiceover-pack-40-lines',
    author: 'Kenney (www.kenney.nl)',
    note: 'Male/go.ogg',
    prep: { lowpassHz: 3500, highpassHz: 100, durationSec: 0.35 },
    gain: 0.5,
    maxMs: 360,
  },
  {
    name: 'voice_ready',
    src: path.join(VOICE_M, 'ready.ogg'),
    url: 'https://opengameart.org/content/voiceover-pack-40-lines',
    author: 'Kenney (www.kenney.nl)',
    note: 'Male/ready.ogg — sped up by rate15/rate12 then encoded @15 for playback @12',
    prep: {
      lowpassHz: 3400,
      highpassHz: 100,
      speedUp: RATE15 / RATE12,
      durationSec: 0.95,
    },
    gain: 0.48,
    maxMs: 980,
  },
];

fs.mkdirSync(WAV_DIR, { recursive: true });
fs.mkdirSync(DMC_DIR, { recursive: true });

const noticeRows = [];
const sourcesMd = [
  '# NES kit CC0 sources (Feature 109)',
  '',
  'Prepared WAVs in this folder were converted from CC0 originals listed below.',
  'Do not re-license. Intermediate downloads live in `_dl/` (not required at runtime).',
  '',
];

for (const item of KIT) {
  if (!fs.existsSync(item.src)) {
    throw new Error(`Missing source for ${item.name}: ${item.src}`);
  }
  const preparedWav = path.join(WAV_DIR, `${item.name}.wav`);
  toMono16(item.src, preparedWav, item.prep);
  const { samples, sampleRate } = readWav16Mono(preparedWav);
  const encoded = encodeDMCFromPCM(samples, sampleRate, {
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
  const dmcBuf = Buffer.from(encoded.bytes);
  fs.writeFileSync(dmcPath, dmcBuf);
  const hash = sha256(dmcBuf);
  noticeRows.push({
    name: item.name,
    bytes: encoded.byteLength,
    ms: Math.round(encoded.durationSec * 1000),
    hash,
    author: item.author,
    url: item.url,
    note: item.note,
  });
  sourcesMd.push(`## ${item.name}`);
  sourcesMd.push(`- Author: ${item.author}`);
  sourcesMd.push(`- URL: ${item.url}`);
  sourcesMd.push(`- File: ${item.note}`);
  sourcesMd.push(`- License: CC0 1.0`);
  sourcesMd.push('');
  console.log(
    `${item.name.padEnd(14)} ${String(encoded.byteLength).padStart(5)} bytes  ${encoded.durationSec.toFixed(3)}s  ← ${item.note}`
  );
}

const notice = [
  '# BeatBax NES DMC sample provenance',
  '',
  'Feature 109 kit samples below are converted from **CC0** third-party audio.',
  'Each entry lists author, source URL, and SHA-256 of the encoded `.dmc` bytes.',
  'Prepared mono WAVs live in `samples/wav/nes_kit/`. See also `SOURCES.md` there.',
  '',
  'Encoded with `encodeDMCFromPCM` at NTSC dmc_rate=15.',
  '`voice_ready` is time/pitch-compressed by ~rate15/rate12 before encode; play with dmc_rate=12.',
  '',
  '## Feature 109 kit (CC0)',
  '',
  '| Name | Bytes | ~ms @15 | Author | Source | SHA-256 |',
  '|------|------:|--------:|--------|--------|---------|',
  ...noticeRows.map(
    (r) =>
      `| ${r.name} | ${r.bytes} | ${r.ms} | ${r.author} | ${r.url} | ${r.hash} |`
  ),
  '',
  '### Per-file notes',
  '',
  ...noticeRows.map((r) => `- **${r.name}**: ${r.note}`),
  '',
  '## Pre-existing classic samples',
  '',
  'Files such as `kick.dmc`, `snare.dmc`, `clap.dmc`, `bongo.dmc`, `*_tom.dmc`,',
  '`muted_bongo.dmc` were already present and remain the classic `@nes/kick` /',
  '`@nes/snare` / latin kit. Unbundled `kick_909.dmc` / `snare_909.dmc` /',
  '`low_kick.dmc` / `open_hihat.dmc` are still **not** registered pending clear CC0 provenance.',
  '',
].join('\n');

fs.writeFileSync(path.join(DMC_DIR, 'NOTICE'), notice);
fs.writeFileSync(path.join(WAV_DIR, 'SOURCES.md'), sourcesMd.join('\n'));
console.log('\nWrote samples/dmc/NOTICE and samples/wav/nes_kit/SOURCES.md');
console.log('Next: node scripts/patch-dmc-samples.mjs');
