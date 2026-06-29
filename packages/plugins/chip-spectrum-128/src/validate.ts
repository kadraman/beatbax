/**
 * Instrument validation for the ZX Spectrum 128 / AY-3-8912 chip plugin.
 *
 * Validates instrument definitions against AY-specific field requirements.
 * Called by the plugin's `validateInstrument()` method.
 */
import type { InstrumentNode, ValidationError } from '@beatbax/engine';

/** AY instrument types (maps to AY channels A/B/C). */
export const SPECTRUM_TYPES = new Set(['tone1', 'tone2', 'tone3']);

function checkRange(value: any, min: number, max: number, field: string, errors: ValidationError[]): void {
  if (value === undefined || value === null) return;
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) {
    errors.push({ field, message: `${field} must be between ${min} and ${max}, got ${value}` });
  }
}

/**
 * Validate a Spectrum 128 instrument definition.
 */
export function validateSpectrumInstrument(inst: InstrumentNode): ValidationError[] {
  const errors: ValidationError[] = [];
  const type = (inst.type ?? '').toLowerCase();

  if (!SPECTRUM_TYPES.has(type)) {
    errors.push({
      field: 'type',
      message: `Unknown Spectrum 128 instrument type '${inst.type}'. Valid types: ${[...SPECTRUM_TYPES].join(', ')}`,
    });
    return errors;
  }

  // ── vol (0–15) ────────────────────────────────────────────────────────────
  if (inst.vol !== undefined) {
    checkRange(inst.vol, 0, 15, 'vol', errors);
  }

  // ── noise_rate (0–31 for AY R6) ──────────────────────────────────────────
  if (inst.noise_rate !== undefined) {
    checkRange(inst.noise_rate, 0, 31, 'noise_rate', errors);
  }

  // ── noise_frames (transient noise mix duration at 60 Hz) ─────────────────
  if (inst.noise_frames !== undefined) {
    checkRange(inst.noise_frames, 0, 60, 'noise_frames', errors);
  }

  // ── tone_frames (transient tone mix duration at 60 Hz) ───────────────────
  if (inst.tone_frames !== undefined) {
    checkRange(inst.tone_frames, 0, 60, 'tone_frames', errors);
  }

  // ── tone_vol (attenuated tone path for stick transients) ─────────────────
  if (inst.tone_vol !== undefined) {
    checkRange(inst.tone_vol, 0, 15, 'tone_vol', errors);
  }

  // ── env_shape (0–15, env_bass only) ─────────────────────────────────────
  if ((inst as { env_shape?: number }).env_shape !== undefined) {
    if (!inst.env_bass) {
      errors.push({
        field: 'env_shape',
        message: 'env_shape is only valid when env_bass=true (hardware R13 shape).',
      });
    } else {
      checkRange((inst as { env_shape?: number }).env_shape, 0, 15, 'env_shape', errors);
    }
  }

  // ── chipRegion ───────────────────────────────────────────────────────────
  if (inst.chipRegion !== undefined) {
    errors.push({
      field: 'chipRegion',
      message: 'chipRegion is not an instrument property for Spectrum/CPC songs. Use chip cpc or chip amstrad-cpc to select the CPC platform.',
    });
  }

  // ── Reject NES/Game Boy specific fields ──────────────────────────────────
  const unsupportedFields: [string, string][] = [
    ['duty', 'Duty cycle is not supported on AY-3-8912. The chip outputs a fixed 50% square wave.'],
    ['duty_env', 'Duty envelope is not supported on AY-3-8912.'],
    ['sweep', 'Hardware pitch sweep is not available on AY-3-8912. Use pitch_env instead.'],
    ['sweep_en', 'Hardware sweep unit is a Game Boy/NES feature. Use pitch_env instead.'],
    ['sweep_period', 'Hardware sweep is not supported. Use pitch_env instead.'],
    ['sweep_shift', 'Hardware sweep is not supported. Use pitch_env instead.'],
    ['sweep_dir', 'Hardware sweep is not supported. Use pitch_env instead.'],
    ['linear', 'Linear counter is an NES triangle channel feature. Not applicable to AY-3-8912.'],
    ['noise_mode', 'noise_mode is not applicable to AY-3-8912. Use noise_rate (0–31) and tone_mix=true.'],
    ['noise_rate_env', 'noise_rate_env is an SMS SN76489 macro (rates 0–3). On AY-3-8912 use fixed noise_rate (0–31) or stagger hits with different instruments.'],
    ['dmc_rate', 'DMC fields are NES features. Not applicable to AY-3-8912.'],
    ['dmc_loop', 'DMC fields are NES features. Not applicable to AY-3-8912.'],
    ['dmc_sample', 'DMC fields are NES features. Not applicable to AY-3-8912.'],
    ['dmc_level', 'DMC fields are NES features. Not applicable to AY-3-8912.'],
  ];

  for (const [field, message] of unsupportedFields) {
    if ((inst as any)[field] !== undefined) {
      errors.push({ field, message });
    }
  }

  return errors;
}
