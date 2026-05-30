/**
 * Song-level validation for shared AY-3-8912 resources.
 *
 * The AY chip shares R6 (noise period) and R11–R13 (envelope program) across
 * all three channels. This module detects conflicts between instrument
 * definitions that would produce undefined hardware behaviour.
 *
 * Conflict types checked:
 *  1. Different `noise_rate` values from overlapping active notes (same tick).
 *  2. More than one `vol_env` (hardware envelope) program active concurrently.
 *  3. Simultaneous `env_bass` + `vol_env` on the same phrase.
 */
import type { InstrumentNode, ValidationError } from '@beatbax/engine';

export interface SongValidationContext {
  /** Map of instrument name → instrument definition. */
  instruments: Record<string, InstrumentNode>;
}

/**
 * Check for shared-resource conflicts at the song definition level.
 * This is a static check (no per-tick simulation needed).
 *
 * Returns diagnostic ValidationErrors (as warnings in the editor).
 */
export function validateSong(ctx: SongValidationContext): ValidationError[] {
  const errors: ValidationError[] = [];
  const insts = Object.values(ctx.instruments);

  // ── Check 1: Multiple instruments with different noise_rate ──────────────
  const noiseInsts = insts.filter(i => i.noise_rate !== undefined);
  if (noiseInsts.length > 1) {
    const rates = new Set(noiseInsts.map(i => Number(i.noise_rate)));
    if (rates.size > 1) {
      errors.push({
        field: 'noise_rate',
        message: `Multiple instruments request different noise_rate values (${[...rates].join(', ')}). ` +
          `When notes overlap on the same tick, R6 will be set to the last writer's value. ` +
          `Use the same noise_rate for all simultaneously active noise instruments.`,
      });
    }
  }

  // ── Check 2: Multiple vol_env programs (hardware envelope conflict) ───────
  const envInsts = insts.filter(i => i.vol_env !== undefined && !i.env_bass);
  if (envInsts.length > 1) {
    errors.push({
      field: 'vol_env',
      message: `Multiple instruments define vol_env (${envInsts.map(i => i.type ?? '?').join(', ')}). ` +
        `The AY-3-8912 has a single hardware envelope generator (R11–R13) shared by all channels. ` +
        `Only one vol_env program may be active at a time. ` +
        `Use software volume slides (BeatBax volSlide effect) for independent per-channel volume shaping.`,
    });
  }

  // ── Check 3: env_bass + vol_env overlap ──────────────────────────────────
  const envBassInsts = insts.filter(i => !!i.env_bass);
  if (envBassInsts.length > 0 && envInsts.length > 0) {
    errors.push({
      field: 'env_bass',
      message: `env_bass (buzz bass) and vol_env cannot be used simultaneously — both program R11–R13 (envelope). ` +
        `env_bass instruments: ${envBassInsts.map(i => i.type ?? '?').join(', ')}. ` +
        `vol_env instruments: ${envInsts.map(i => i.type ?? '?').join(', ')}.`,
    });
  }

  return errors;
}
