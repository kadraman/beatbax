import type { InstrumentNode, ValidationError } from '@beatbax/engine';
import type { AyEnvelopeShape } from './envelope.js';

const AY_TYPES = new Set(['tone', 'noise']);
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
  'noise_rate_env',
  'dmc_rate',
  'dmc_loop',
  'dmc_sample',
  'dmc_level',
];

function pushError(errors: ValidationError[], field: string, message: string): void {
  errors.push({ field, message });
}

function parseBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const normalized = v.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return null;
}

export function validateAyInstrument(inst: InstrumentNode): ValidationError[] {
  const errors: ValidationError[] = [];
  const type = String(inst.type ?? 'tone').toLowerCase();

  if (!AY_TYPES.has(type)) {
    pushError(errors, 'type', `Unknown AY instrument type '${inst.type}'. Valid types: tone, noise.`);
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

  const useEnvelope = (
    parseBool(inst.use_envelope) ??
    (typeof inst.vol === 'string' && String(inst.vol).toLowerCase() === 'use_envelope')
  ) || (inst.vol === undefined && env !== 'none');

  if (inst.vol !== undefined && !(typeof inst.vol === 'string' && String(inst.vol).toLowerCase() === 'use_envelope')) {
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
