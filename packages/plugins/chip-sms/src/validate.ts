/**
 * SMS SN76489 instrument validation.
 *
 * Validates instrument definitions against SMS-specific field requirements.
 * Called by the plugin's `validateInstrument()` method.
 */
import type { InstrumentNode } from '@beatbax/engine';
import type { ValidationError } from '@beatbax/engine';
import { parseMacro } from './macros.js';

/** SMS instrument types and their channel assignments. */
export const SMS_TYPES = new Set(['tone1', 'tone2', 'tone3', 'noise']);

function checkRange(value: any, min: number, max: number, field: string, errors: ValidationError[]): void {
  if (value === undefined || value === null) return;
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) {
    errors.push({ field, message: `${field} must be between ${min} and ${max}, got ${value}` });
  }
}

function checkEnum(value: any, validValues: Set<string>, field: string, errors: ValidationError[]): void {
  if (value === undefined || value === null) return;
  const str = String(value).toLowerCase();
  if (!validValues.has(str)) {
    errors.push({ field, message: `${field} must be one of: ${[...validValues].join(', ')}. Got '${value}'` });
  }
}

/**
 * Validate an SMS instrument definition.
 */
export function validateSmsInstrument(inst: InstrumentNode): ValidationError[] {
  const errors: ValidationError[] = [];
  const type = (inst.type || '').toLowerCase();

  if (!SMS_TYPES.has(type)) {
    errors.push({
      field: 'type',
      message: `Unknown SMS instrument type '${inst.type}'. Valid types: ${[...SMS_TYPES].join(', ')}`
    });
    return errors;
  }

  // ── Reject unsupported effects ────────────────────────────────────────────
  
  if (inst.sweep !== undefined) {
    errors.push({
      field: 'sweep',
      message: 'Hardware pitch sweep is a Game Boy NR10 feature. On SMS, use pitch_env or bend for equivalent pitch-ramp effects.'
    });
  }

  if (inst.echo !== undefined) {
    errors.push({
      field: 'echo',
      message: 'Echo/delay requires spare channels. The SN76489 has only 4 channels total with no delay buffer.'
    });
  }

  if (inst.retrig !== undefined) {
    // According to spec, retrig should be a warning, not an error
    // For v1, we'll keep it as an error but with clear messaging
    // Future versions could implement proper warning support
    errors.push({
      field: 'retrig',
      message: 'Note retriggering on SN76489 is emulation-dependent. Phase-reset behaviour may differ between VGM players and real hardware. Use with caution.'
    });
  }

  // ── Reject Game Boy/NES-specific fields ───────────────────────────────────
  
  if (inst.duty !== undefined) {
    errors.push({
      field: 'duty',
      message: 'Duty cycle is not supported on SMS. The SN76489 outputs a fixed 50% duty square wave with no hardware duty modulation.'
    });
  }

  if (inst.duty_env !== undefined) {
    errors.push({
      field: 'duty_env',
      message: 'Duty envelope is not supported on SMS. The SN76489 outputs a fixed 50% duty square wave with no hardware duty modulation.'
    });
  }

  if (inst.sweep_en !== undefined) {
    errors.push({
      field: 'sweep_en',
      message: 'Hardware sweep unit is a Game Boy/NES feature. On SMS, use pitch_env or bend for pitch sweep effects.'
    });
  }

  if (inst.sweep_period !== undefined) {
    errors.push({
      field: 'sweep_period',
      message: 'Hardware sweep is not supported on SMS. Use pitch_env or bend instead.'
    });
  }

  if (inst.sweep_shift !== undefined) {
    errors.push({
      field: 'sweep_shift',
      message: 'Hardware sweep is not supported on SMS. Use pitch_env or bend instead.'
    });
  }

  if (inst.sweep_dir !== undefined) {
    errors.push({
      field: 'sweep_dir',
      message: 'Hardware sweep is not supported on SMS. Use pitch_env or bend instead.'
    });
  }

  if (inst.linear !== undefined) {
    errors.push({
      field: 'linear',
      message: 'Linear counter is an NES triangle channel feature. Not applicable to SMS.'
    });
  }

  if (inst.dmc_rate !== undefined || inst.dmc_loop !== undefined || inst.dmc_sample !== undefined || inst.dmc_level !== undefined) {
    errors.push({
      field: 'dmc_*',
      message: 'DMC fields are Nintendo Entertainment System features. Not applicable to SMS.'
    });
  }

  // ── Tone-specific fields (tone1, tone2, tone3) ───────────────────────────────
  
  if (type === 'tone1' || type === 'tone2' || type === 'tone3') {
    if (inst.noise_mode !== undefined) {
      errors.push({ field: 'noise_mode', message: `noise_mode is only valid for type=noise, not type=${type}` });
    }
    
    if (inst.noise_rate !== undefined) {
      errors.push({ field: 'noise_rate', message: `noise_rate is only valid for type=noise, not type=${type}` });
    }
    
    if (inst.noise_rate_env !== undefined) {
      errors.push({ field: 'noise_rate_env', message: `noise_rate_env is only valid for type=noise, not type=${type}` });
    }

    // Accept vol, vol_env, arp_env, pitch_env
    if (inst.vol !== undefined) {
      checkRange(inst.vol, 0, 15, 'vol', errors);
    }
  }

  // ── Noise-specific fields ────────────────────────────────────────────────
  
  if (type === 'noise') {
    if (inst.arp_env !== undefined) {
      errors.push({ field: 'arp_env', message: 'Arpeggio macro is not meaningful for noise channel. Use vol_env or noise_rate_env instead.' });
    }
    
    if (inst.pitch_env !== undefined) {
      // pitch_env on noise is unusual but we allow it for effects
      // Could be used for pitch bend on tuned noise
      // For now, we'll allow it but could add a warning in the future
    }

    // Validate noise_mode
    if (inst.noise_mode !== undefined) {
      const validModes = new Set(['white', 'periodic']);
      checkEnum(inst.noise_mode, validModes, 'noise_mode', errors);
    }

    // Validate noise_rate
    if (inst.noise_rate !== undefined) {
      const rate = inst.noise_rate;
      if (typeof rate === 'string') {
        const lowerRate = rate.toLowerCase();
        if (lowerRate !== 'tone3' && (isNaN(Number(rate)) || Number(rate) < 0 || Number(rate) > 3)) {
          errors.push({ field: 'noise_rate', message: `noise_rate string must be 'tone3' or a number 0-3. Got '${rate}'` });
        }
      } else if (typeof rate === 'number') {
        // noise_rate must be 0, 1, 2, or 3 (where 3 = tone3)
        if (rate !== 0 && rate !== 1 && rate !== 2 && rate !== 3) {
          errors.push({ field: 'noise_rate', message: `noise_rate must be 0, 1, 2, or 3 (where 3 = tone3). Got ${rate}` });
        }
      }
    }

    // Validate noise_rate_env
    if (inst.noise_rate_env !== undefined) {
      const rateEnv = parseMacro(inst.noise_rate_env);
      if (rateEnv) {
        for (const val of rateEnv.values) {
          // noise_rate_env values must be 0, 1, 2, or 3 (where 3 = tone3)
          if (val !== 0 && val !== 1 && val !== 2 && val !== 3) {
            errors.push({ 
              field: 'noise_rate_env', 
              message: `noise_rate_env values must be 0, 1, 2, or 3 (where 3 = tone3). Got ${val}` 
            });
            break;
          }
        }
      }
    }

    // Validate vol
    if (inst.vol !== undefined) {
      checkRange(inst.vol, 0, 15, 'vol', errors);
    }
  }

  // ── Game Gear pan validation ──────────────────────────────────────────────
  
  // Support both gg:pan (with colon) and gg_pan (without colon) formats
  const ggPanValue = inst.gg_pan !== undefined ? inst.gg_pan : inst['gg:pan'];
  if (ggPanValue !== undefined) {
    const validPans = new Set(['l', 'c', 'r', 'left', 'center', 'right']);
    checkEnum(ggPanValue, validPans, 'gg:pan', errors);
  }

  // Also check the plain 'pan' field for SMS (we'll snap to gg:pan values)
  if (inst.pan !== undefined) {
    // For v1, we accept numeric pan but warn that it will be snapped to L/C/R
    if (typeof inst.pan === 'number') {
      // Accept but note it will be snapped
      // Don't push an error, just a validation note
    } else {
      const validPans = new Set(['l', 'c', 'r', 'left', 'center', 'right']);
      checkEnum(inst.pan, validPans, 'pan', errors);
    }
  }

  return errors;
}


