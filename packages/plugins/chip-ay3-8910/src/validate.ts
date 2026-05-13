import { noteToMidi, type InstrumentNode, type ValidationError } from '@beatbax/engine';
import { parseMacro } from '@beatbax/engine';
import type { AyEnvelopeShape } from './envelope.js';
import { isRepeatingEnvelopeShape } from './envelope.js';
import { shouldUseEnvelope } from './instrument.js';

const AY_TYPES = new Set(['tone', 'noise', 'tone_noise']);
const AY_NOISE = new Set(['on', 'off']);
const AY_ENVS = new Set<AyEnvelopeShape>([
  'none',
  'attack_decay',
  'attack_decay_repeat',
  'decay_only',
  'decay_repeat',
  'attack_only',
  'hold',
  'attack_hold',
  'decay_quick',
  'decay_hold_max',
  'attack_hold_max',
  'triangle_down_up',
  'triangle_up_down',
]);

const FORBIDDEN_FIELDS = [
  'duty',
  'duty_env',
  'sweep',
  'sweep_en',
  'sweep_period',
  'sweep_shift',
  'sweep_dir',
  'linear',
  'noise_mode',
  'noise_period',
  'dmc_rate',
  'dmc_loop',
  'dmc_sample',
  'dmc_level',
];

function pushError(errors: ValidationError[], field: string, message: string): void {
  errors.push({ field, message });
}

export function validateAyInstrument(inst: InstrumentNode): ValidationError[] {
  const errors: ValidationError[] = [];
  const type = String(inst.type ?? 'tone').toLowerCase();

  if (!AY_TYPES.has(type)) {
    pushError(errors, 'type', `Unknown AY instrument type '${inst.type}'. Valid types: tone, noise, tone_noise.`);
    return errors;
  }

  for (const field of FORBIDDEN_FIELDS) {
    if ((inst as any)[field] !== undefined) {
      pushError(errors, field, `${field} is not supported on AY-3-8910 instruments.`);
    }
  }

  const env = String(inst.env ?? 'none').toLowerCase() as AyEnvelopeShape;
  if (!AY_ENVS.has(env)) {
    pushError(errors, 'env', `env must be one of: ${Array.from(AY_ENVS).join(', ')}. Got '${inst.env}'.`);
  }

  const noise = String(inst.noise ?? (type === 'noise' ? 'on' : 'off')).toLowerCase();
  if (!AY_NOISE.has(noise)) {
    pushError(errors, 'noise', `noise must be 'on' or 'off'. Got '${inst.noise}'.`);
  }

  if (inst.noise_rate !== undefined) {
    const rate = Number(inst.noise_rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 31) {
      pushError(errors, 'noise_rate', `noise_rate must be between 0 and 31. Got '${inst.noise_rate}'.`);
    }
  }

  const envPitchRaw = (inst as any).env_pitch;
  const envPeriodRaw = (inst as any).env_period;

  if (envPitchRaw !== undefined) {
    if (typeof envPitchRaw !== 'string' || noteToMidi(envPitchRaw) == null) {
      pushError(errors, 'env_pitch', `env_pitch must be a valid note name (e.g. A2). Got '${envPitchRaw}'.`);
    }
  }

  if (envPeriodRaw !== undefined) {
    const envPeriod = Number(envPeriodRaw);
    if (!Number.isInteger(envPeriod) || envPeriod < 0 || envPeriod > 65535) {
      pushError(errors, 'env_period', `env_period must be an integer between 0 and 65535. Got '${envPeriodRaw}'.`);
    }
  }

  if (envPitchRaw !== undefined && envPeriodRaw !== undefined) {
    pushError(errors, 'env_period', 'env_pitch and env_period cannot be set at the same time.');
  }

  if ((envPitchRaw !== undefined || envPeriodRaw !== undefined) && (env === 'none' || !isRepeatingEnvelopeShape(env))) {
    pushError(errors, 'env', 'env_pitch/env_period require a repeating envelope shape (attack_decay_repeat, decay_repeat, triangle_down_up, triangle_up_down).');
  }

  const volEnv = parseMacro((inst as any).vol_env);
  if (volEnv) {
    const invalid = volEnv.values.find((v: number) => v < 0 || v > 31);
    if (invalid !== undefined) {
      pushError(errors, 'vol_env', `vol_env values must be between 0 and 31. Got '${invalid}'.`);
    }
  }

  const pitchEnv = parseMacro((inst as any).pitch_env);
  if (pitchEnv) {
    const invalid = pitchEnv.values.find((v: number) => !Number.isFinite(v) || v < -96 || v > 96);
    if (invalid !== undefined) {
      pushError(errors, 'pitch_env', `pitch_env values must be finite semitone offsets. Got '${invalid}'.`);
    }
  }

  const arpEnv = parseMacro((inst as any).arp_env);
  if (arpEnv) {
    const invalid = arpEnv.values.find((v: number) => !Number.isFinite(v) || v < -96 || v > 96);
    if (invalid !== undefined) {
      pushError(errors, 'arp_env', `arp_env values must be finite semitone offsets. Got '${invalid}'.`);
    }
  }

  const noiseRateEnv = parseMacro((inst as any).noise_rate_env);
  if (noiseRateEnv) {
    const invalid = noiseRateEnv.values.find((v: number) => v < 0 || v > 31);
    if (invalid !== undefined) {
      pushError(errors, 'noise_rate_env', `noise_rate_env values must be between 0 and 31. Got '${invalid}'.`);
    }
  }

  const useEnvelope = shouldUseEnvelope(inst);

  if (inst.vol !== undefined && !(typeof inst.vol === 'string' && inst.vol.toLowerCase() === 'use_envelope')) {
    const vol = Number(inst.vol);
    if (!Number.isFinite(vol) || vol < 0 || vol > 15) {
      pushError(errors, 'vol', `vol must be between 0 and 15 or 'use_envelope'. Got '${inst.vol}'.`);
    }
  }

  if (useEnvelope && env === 'none') {
    pushError(errors, 'use_envelope', 'use_envelope=true requires a non-none env shape.');
  }

  if (type === 'noise' && noise === 'off') {
    pushError(errors, 'noise', 'type=noise requires noise=on.');
  }

  return errors;
}
