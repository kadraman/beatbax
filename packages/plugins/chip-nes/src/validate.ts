/**
 * NES instrument validation.
 *
 * Validates instrument definitions against NES-specific field requirements.
 * Called by the plugin's `validateInstrument()` method.
 */
import type { InstrumentNode } from '@beatbax/engine';
import type { ValidationError } from '@beatbax/engine';

/** NES instrument types and their channel assignments. */
export const NES_TYPES = new Set(['pulse1', 'pulse2', 'triangle', 'noise', 'dmc']);
const PULSE_DUTY_VALUES = new Set(['12.5', '12', '25', '50', '75']);

function checkRange(value: number, min: number, max: number, field: string, errors: ValidationError[]): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    errors.push({ field, message: `${field} must be between ${min} and ${max}, got ${value}` });
  }
}

export function validateNesInstrument(inst: InstrumentNode): ValidationError[] {
  const errors: ValidationError[] = [];
  const type = (inst.type || '').toLowerCase();

  if (!NES_TYPES.has(type)) {
    errors.push({
      field: 'type',
      message: `Unknown NES instrument type '${inst.type}'. Valid types: ${[...NES_TYPES].join(', ')}`
    });
    return errors;
  }

  // ── Pulse-specific fields ──────────────────────────────────────────────────
  if (type === 'pulse1' || type === 'pulse2') {
    if (inst.duty !== undefined) {
      const dutyStr = String(inst.duty).trim();
      if (!PULSE_DUTY_VALUES.has(dutyStr)) {
        errors.push({
          field: 'duty',
          message: `NES pulse duty must be one of: 12, 12.5, 25, 50, 75 (percent). Got '${inst.duty}'`
        });
      }
    }

    if (inst.env !== undefined && typeof inst.env === 'string') {
      const parts = inst.env.split(',');
      if (parts.length >= 1) {
        const vol = parseInt(parts[0], 10);
        if (isNaN(vol)) {
          errors.push({ field: 'env', message: `env initial volume must be a number (0–15)` });
        } else {
          checkRange(vol, 0, 15, 'env', errors);
        }
      }
    }

    if (inst.env_period !== undefined) {
      checkRange(Number(inst.env_period), 0, 15, 'env_period', errors);
    }

    if (inst.vol !== undefined) {
      checkRange(Number(inst.vol), 0, 15, 'vol', errors);
    }

    if (inst.sweep_en) {
      if (inst.sweep_period !== undefined) {
        checkRange(Number(inst.sweep_period), 1, 7, 'sweep_period', errors);
      }
      if (inst.sweep_shift !== undefined) {
        checkRange(Number(inst.sweep_shift), 0, 7, 'sweep_shift', errors);
      }
      if (inst.sweep_dir !== undefined) {
        const dir = String(inst.sweep_dir).toLowerCase();
        if (dir !== 'up' && dir !== 'down') {
          errors.push({ field: 'sweep_dir', message: `sweep_dir must be 'up' or 'down'` });
        }
      }
    }
  }

  // ── Triangle-specific fields ───────────────────────────────────────────────
  if (type === 'triangle') {
    if (inst.linear !== undefined) {
      // linear=0 means no linear counter (infinite duration); 1-127 are valid counter values
      checkRange(Number(inst.linear), 0, 127, 'linear', errors);
    }
    if (inst.vol !== undefined) {
      const vol = Number(inst.vol);
      if (vol === 0) {
        // vol=0 means mute; any non-zero value is treated as full amplitude —
        // the triangle channel has no hardware volume control.
      }
      // Intermediate values (1-14) are silently accepted and treated as full amplitude.
    }
  }

  // ── Noise-specific fields ──────────────────────────────────────────────────
  if (type === 'noise') {
    if (inst.noise_mode !== undefined) {
      const mode = String(inst.noise_mode).toLowerCase();
      if (mode !== 'normal' && mode !== 'loop') {
        errors.push({ field: 'noise_mode', message: `noise_mode must be 'normal' or 'loop'` });
      }
    }

    if (inst.noise_period !== undefined) {
      checkRange(Number(inst.noise_period), 0, 15, 'noise_period', errors);
    }

    if (inst.env !== undefined && typeof inst.env === 'string') {
      const parts = inst.env.split(',');
      if (parts.length >= 1) {
        const vol = parseInt(parts[0], 10);
        if (!isNaN(vol)) checkRange(vol, 0, 15, 'env', errors);
      }
    }

    if (inst.env_period !== undefined) {
      checkRange(Number(inst.env_period), 0, 15, 'env_period', errors);
    }

    if (inst.vol !== undefined) {
      checkRange(Number(inst.vol), 0, 15, 'vol', errors);
    }
  }

  // ── DMC-specific fields ───────────────────────────────────────────────────
  if (type === 'dmc') {
    if (inst.dmc_rate !== undefined) {
      checkRange(Number(inst.dmc_rate), 0, 15, 'dmc_rate', errors);
    }

    if (inst.dmc_level !== undefined) {
      checkRange(Number(inst.dmc_level), 0, 127, 'dmc_level', errors);
    }

    if (inst.dmc_sample !== undefined) {
      const ref = String(inst.dmc_sample);
      const validSchemes = ref.startsWith('@nes/') || ref.startsWith('https://') || ref.startsWith('github:') || ref.startsWith('local:');
      if (!validSchemes) {
        errors.push({
          field: 'dmc_sample',
          message: `dmc_sample must start with '@nes/', 'https://', 'github:', or 'local:'. Got '${ref}'`
        });
      }
      // Path traversal guard for local: references.
      // Mirrors the segment-based check in importResolver.ts and dmc.ts:
      // normalise backslashes first, then match '..' only when it is a
      // standalone path segment (preceded by '/' or start-of-string AND
      // followed by '/' or end-of-string).  This correctly allows safe
      // filenames like 'file..dmc' while still blocking '../' traversal.
      if (ref.startsWith('local:')) {
        const localPath = ref.slice('local:'.length).replace(/\\/g, '/');
        if (/(^|\/)\.\.($|\/)/.test(localPath)) {
          errors.push({
            field: 'dmc_sample',
            message: `dmc_sample 'local:' path must not contain '..' path segments (path traversal)`
          });
        }
      }
    }
  }

  return errors;
}
