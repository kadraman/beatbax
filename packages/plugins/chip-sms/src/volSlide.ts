/**
 * WebAudio volSlide effect handler for SMS PSG.
 * This is registered as a chip-specific effect override in the SMS plugin.
 *
 * SMS PSG uses 4-bit attenuation where:
 * - vol=0 is loudest (full volume)
 * - vol=15 is silent
 * - Volume in instrument definition: 0-15 where 0=loudest
 *
 * The baseline gain is calculated from the instrument's vol or vol_env[0] value.
 */

// EffectHandler imported from engine via ChipPlugin interface
import { SMS_MIX_GAIN } from './mixer.js';
import { getSmsWebAudioNorm } from './mixer.js';

export const smsVolSlideEffect = (
  ctx: any,
  nodes: any[],
  params: any[],
  start: number,
  dur: number,
  chId?: number,
  tickSeconds?: number,
  inst?: any
) => {
  if (!nodes || nodes.length < 2) return;
  const gain = nodes[1];
  if (!gain || !gain.gain) {
    console.warn(`[chip-sms] Volume slide: gain node is missing or invalid for channel ${chId || '?'}`);
    return;
  }

  const gainParam = gain.gain;
  if (!gainParam || typeof gainParam.setValueAtTime !== 'function') {
    console.warn(`[chip-sms] Volume slide: gain.gain AudioParam is invalid for channel ${chId || '?'}`);
    return;
  }

  const deltaRaw = params && params.length > 0 ? Number(params[0]) : 0;
  const stepsRaw = params && params.length > 1 ? Number(params[1]) : undefined;
  const delta = Number.isFinite(deltaRaw) ? deltaRaw : 0;
  const steps = (stepsRaw !== undefined && Number.isFinite(stepsRaw)) ? Math.max(1, Math.round(stepsRaw)) : undefined;

  if (delta === 0) return; // No volume change

  // Extract baseline from SMS instrument
  // SMS: vol=0 is loudest, vol=15 is silent (inverted from typical attenuation)
  // In inst, vol field is 0-15 where 0=loudest, 15=silent
  // So baselineGain = (15 - vol) / 15 * mixGain * webNorm
  let baselineGain = 1.0;

  if (inst) {
    try {
      // Get instrument type to determine mix gain
      const instType = inst.type ? String(inst.type).toLowerCase() : '';
      const isNoise = instType.includes('noise');
      const mixGain = isNoise ? SMS_MIX_GAIN.noise : SMS_MIX_GAIN.tone;
      const webNorm = getSmsWebAudioNorm();

      if (inst.vol !== undefined) {
        // vol is 0-15 where 0=loudest, 15=silent (SMS convention)
        const vol = Math.max(0, Math.min(15, Number(inst.vol)));
        // Convert to gain: (15 - vol) / 15 = normalized gain
        // Then scale by mix gain and web normalization
        baselineGain = ((15 - vol) / 15) * mixGain * webNorm;
      } else if (inst.vol_env) {
        let volEnv = inst.vol_env;
        if (typeof volEnv === 'string') {
          const m = volEnv.match(/^\[(\d+,*)+\]/);
          if (m) {
            const values = m[1].split(',').map(Number).filter(Number.isFinite);
            if (values.length > 0) {
              const firstVol = Math.max(0, Math.min(15, values[0]));
              baselineGain = ((15 - firstVol) / 15) * mixGain * webNorm;
            }
          }
        } else if (Array.isArray(volEnv) && volEnv.length > 0) {
          const firstVol = Math.max(0, Math.min(15, Number(volEnv[0])));
          baselineGain = ((15 - firstVol) / 15) * mixGain * webNorm;
        }
      }
    } catch (e) {
      console.warn(`[chip-sms] Volume slide: SMS volume extraction failed for channel ${chId || '?'}, using default baseline`);
      baselineGain = 1.0;
    }
  }

  try {
    // Cancel any existing automation on this gain node
    if (typeof gainParam.cancelScheduledValues === 'function') {
      gainParam.cancelScheduledValues(start);
    }
    gainParam.setValueAtTime(baselineGain, start);

    // SMS PSG: volume changes are in vol units (0-15, 0=loudest)
    // For volSlide, delta represents change in vol level
    // Since SMS vol=0 is loudest and vol=15 is silent:
    //   gain = (15 - vol) / 15
    //   new_vol = old_vol + delta
    //   new_gain = (15 - new_vol) / 15 = (15 - old_vol - delta) / 15
    //   delta_gain = new_gain - old_gain = -delta / 15
    // So we negate delta and divide by 15

    if (steps !== undefined && tickSeconds !== undefined) {
      // Stepped volume slide
      const stepDuration = dur / steps;
      // Set initial value
      gainParam.setValueAtTime(baselineGain, start);

      for (let i = 1; i <= steps; i++) {
        const stepTime = start + (i * stepDuration);
        // Calculate gain for this step: delta is in vol units (0-15, 0=loudest)
        // Change in gain = -delta * i / steps / 15
        const stepGain = Math.max(0.001, Math.min(1.5, baselineGain - (delta * i / steps / 15)));
        // Hold previous value right up to step boundary
        const prevGain = i === 1 ? baselineGain : Math.max(0.001, Math.min(1.5, baselineGain - (delta * (i - 1) / steps / 15)));
        gainParam.setValueAtTime(prevGain, stepTime - 0.00001);
        // Jump to new value at step boundary
        gainParam.setValueAtTime(stepGain, stepTime);
      }
      // Hold final value until note end
      const finalGain = Math.max(0.001, Math.min(1.5, baselineGain - (delta / 15)));
      gainParam.setValueAtTime(finalGain, start + dur);
    } else {
      // Smooth volume slide: linear ramp over note duration
      // delta is in vol units (0-15, 0=loudest), so negate and divide by 15
      const targetGain = Math.max(0, Math.min(1.5, baselineGain - (delta / 15)));
      gainParam.linearRampToValueAtTime(targetGain, start + dur);
    }
  } catch (e) {
    console.warn(`[chip-sms] Volume slide failed for channel ${chId || '?'}: ${e}`);
  }
};
