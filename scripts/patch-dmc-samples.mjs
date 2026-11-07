/**
 * Patch packages/engine/src/chips/nes/dmcSamples.ts with Feature 109 kit base64.
 * Run after convert-cc0 / apply-audition-verdicts.
 */
import fs from 'node:fs';
import path from 'node:path';

const KIT_NAMES = [
  'bass_saw_a0',
  'bass_saw_c0',
  'bass_saw_c1',
  'bass_saw_d0',
  'bass_saw_e0',
  'bass_saw_g0',
  'clap_808',
  'cowbell',
  'cowbell_808',
  'crash',
  'crash_cym',
  'cymbal_808',
  'hat_808',
  'hat_909',
  'hat_closed',
  'hat_open',
  'hat_open_808',
  'hat_open_909',
  'kick_808',
  'kick_909',
  'kick_body',
  'kick_punch',
  'maracas_808',
  'orch_hit',
  'orch_hit_up',
  'rim',
  'rim_808',
  'shaker',
  'snare_808',
  'snare_909',
  'snare_fat',
  'snare_tight',
  'tom_high_808',
  'tom_low_808',
  'tom_mid_808',
  'voice_correct',
  'voice_go',
  'voice_go_go_go',
  'voice_hurry_up',
  'voice_level_up',
  'voice_ready',
  'voice_set',
  'voice_you_win',
];

const BASS_NOTES = {
  bass_saw_c0: 'C0',
  bass_saw_d0: 'D0',
  bass_saw_e0: 'E0',
  bass_saw_g0: 'G0',
  bass_saw_a0: 'A0',
  bass_saw_c1: 'C1',
};

const srcPath = 'packages/engine/src/chips/nes/dmcSamples.ts';
let src = fs.readFileSync(srcPath, 'utf8');

function toConstName(name) {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, '_') + '_SAMPLE';
}

function fmtConst(name, constName, b64, bytes) {
  const lines = [];
  for (let i = 0; i < b64.length; i += 72) {
    lines.push(`'${b64.slice(i, i + 72)}'`);
  }
  return (
    `// samples/dmc/${name}.dmc — ${bytes} bytes (feature 109)\n` +
    `const ${constName} =\n  ${lines.join(' +\n  ')};\n`
  );
}

const json = {};
for (const name of KIT_NAMES) {
  const file = path.join('samples', 'dmc', `${name}.dmc`);
  if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
  const bytes = fs.readFileSync(file);
  json[name] = {
    constName: toConstName(name),
    bytes: bytes.length,
    base64: bytes.toString('base64'),
  };
}

let block = '// ── Feature 109 kit ─────────────────────────────────────────────────────\n\n';
for (const name of KIT_NAMES) {
  const e = json[name];
  block += fmtConst(name, e.constName, e.base64, e.bytes) + '\n';
}

const kitStart = src.indexOf('// ── Feature 109 kit');
const synthMarker = '// ── Synthetic samples';
const synthIdx = src.indexOf(synthMarker);
if (synthIdx < 0) throw new Error('synthetic marker missing');
if (kitStart >= 0) {
  src = src.slice(0, kitStart) + block + src.slice(synthIdx);
} else {
  src = src.slice(0, synthIdx) + block + src.slice(synthIdx);
}

const header = `/**
 * Bundled NES DMC sample library.
 *
 * Classic latin/drum hits are real recorded NES DMC files from samples/dmc/,
 * stored as base64-encoded raw DMC byte streams. Designed for rate index 15
 * (33143 Hz, FamiTracker "33 kHz") unless BUNDLED_SAMPLE_META says otherwise.
 *
 * Feature 109 kit: CC0 recordings + a few purpose-built synth hits where no
 * suitable CC0 source was available (see samples/dmc/NOTICE). \`hihat\` maps to
 * \`hat_closed\`. Classic \`kick\`/\`snare\` bytes are preserved.
 *
 * Supported names (via '@nes/<name>' references): see BUNDLED_SAMPLES keys.
 */
`;

src = src.replace(/^\/\*\*[\s\S]*?\*\/\r?\n/, header);

const percKeys = [
  'kick_punch',
  'kick_body',
  'snare_tight',
  'snare_fat',
  'hat_closed',
  'hat_open',
  'hihat',
  'crash',
  'crash_cym',
  'rim',
  'shaker',
  'cowbell',
];
const drumMachineKeys = [
  'kick_808',
  'snare_808',
  'hat_808',
  'hat_open_808',
  'clap_808',
  'cymbal_808',
  'rim_808',
  'cowbell_808',
  'maracas_808',
  'tom_low_808',
  'tom_mid_808',
  'tom_high_808',
  'kick_909',
  'snare_909',
  'hat_909',
  'hat_open_909',
];
const bassKeys = Object.keys(BASS_NOTES);
const specialKeys = [
  'orch_hit',
  'orch_hit_up',
  'voice_correct',
  'voice_go',
  'voice_go_go_go',
  'voice_hurry_up',
  'voice_level_up',
  'voice_set',
  'voice_you_win',
  'voice_ready',
];

function sampleLine(key) {
  if (key === 'hihat') return '  hihat: HAT_CLOSED_SAMPLE,';
  if (key === 'bass') return '  bass: BASS_SAW_C2_SAMPLE,';
  return `  ${key}: ${toConstName(key)},`;
}

const samplesObj = `export const BUNDLED_SAMPLES: Record<string, string> = {
  // Classic kit
  bongo: BONGO_SAMPLE,
  clap: CLAP_SAMPLE,
  high_tom: HIGH_TOM_SAMPLE,
  kick: KICK_SAMPLE,
  kick_classic: KICK_SAMPLE,
  low_tom: LOW_TOM_SAMPLE,
  middle_tom: MIDDLE_TOM_SAMPLE,
  muted_bongo: MUTED_BONGO_SAMPLE,
  snare: SNARE_SAMPLE,
  snare_classic: SNARE_SAMPLE,
  bass_c2: makeSyntheticDMC(BASS_PATTERN, BASS_PATTERN.length),

  // Feature 109 percussion
${percKeys.map(sampleLine).join('\n')}

  // Feature 109 drum-machine style (original synth; not ROM dumps)
${drumMachineKeys.map(sampleLine).join('\n')}

  // Feature 109 bass (C0–C1; pitched from bass_saw_c2 source WAV)
${bassKeys.map(sampleLine).join('\n')}
  bass: BASS_SAW_C1_SAMPLE,

  // Feature 109 special / voice
${specialKeys.map(sampleLine).join('\n')}
};
`;

const metaLines = [];
for (const key of [
  'bongo',
  'clap',
  'high_tom',
  'kick',
  'kick_classic',
  'low_tom',
  'middle_tom',
  'muted_bongo',
  'snare',
  'snare_classic',
]) {
  metaLines.push(`  ${key}: RATE_15,`);
}
metaLines.push(`  bass_c2: { designedRate: 15, baseNote: 'C2' },`);
metaLines.push('');
for (const key of percKeys) metaLines.push(`  ${key}: RATE_15,`);
metaLines.push('');
for (const key of drumMachineKeys) metaLines.push(`  ${key}: RATE_15,`);
metaLines.push('');
for (const [key, note] of Object.entries(BASS_NOTES)) {
  metaLines.push(`  ${key}: { designedRate: 15, baseNote: '${note}' },`);
}
metaLines.push(`  bass: { designedRate: 15, baseNote: 'C1' },`);
metaLines.push('');
for (const key of specialKeys) {
  if (key === 'voice_ready') metaLines.push(`  ${key}: RATE_12,`);
  else metaLines.push(`  ${key}: RATE_15,`);
}

const metaObj = `const RATE_15: ChipBundledSampleMeta = { designedRate: 15 };
const RATE_12: ChipBundledSampleMeta = { designedRate: 12 };

/**
 * UI guidance for bundled samples (decode paths ignore this map).
 */
export const BUNDLED_SAMPLE_META: Record<string, ChipBundledSampleMeta> = {
${metaLines.join('\n')}
};
`;

const start = src.indexOf('export const BUNDLED_SAMPLES');
if (start < 0) throw new Error('BUNDLED_SAMPLES missing');
src = src.slice(0, start) + samplesObj + '\n' + metaObj + '\n';

fs.writeFileSync(srcPath, src);
console.log('Updated', srcPath, `(${KIT_NAMES.length} feature-109 buffers)`);
