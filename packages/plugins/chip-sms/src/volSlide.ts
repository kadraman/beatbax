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
import { parseMacro, makeMacroState, getMacroValue, advanceMacro } from './macros.js';

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

  const clampAttenuation = (att: number): number => Math.max(0, Math.min(15, att));
  const clampGain = (g: number): number => Math.max(0, Math.min(1.5, g));

  // Extract baseline attenuation from SMS instrument.
  // SMS attenuation semantics: 0=loudest, 15=silent.
  let baselineAttenuation = 0;
  let mixGain = SMS_MIX_GAIN.tone;

  if (inst) {
    try {
      const instType = inst.type ? String(inst.type).toLowerCase() : '';
      const isNoise = instType.includes('noise');
      mixGain = isNoise ? SMS_MIX_GAIN.noise : SMS_MIX_GAIN.tone;

      if (inst.vol !== undefined) {
        baselineAttenuation = clampAttenuation(Number(inst.vol));
      } else if (inst.vol_env) {
        const volEnvMacro = parseMacro(inst.vol_env);
        if (volEnvMacro && volEnvMacro.values.length > 0) {
          baselineAttenuation = clampAttenuation(volEnvMacro.values[0]);
        }
      }
    } catch (e) {
      console.warn(`[chip-sms] Volume slide: SMS volume extraction failed for channel ${chId || '?'}, using default baseline`);
      baselineAttenuation = 0;
    }
  }

  const gainFromAttenuation = (att: number): number => {
    const clampedAtt = clampAttenuation(att);
    return clampGain((1 - (clampedAtt / 15)) * mixGain);
  };

  const baselineGain = gainFromAttenuation(baselineAttenuation);

  try {
    // Cancel any existing automation on this gain node
    if (typeof gainParam.cancelScheduledValues === 'function') {
      gainParam.cancelScheduledValues(start);
    }

    // ── vol_env compound path ─────────────────────────────────────────────────
    // When the instrument has a vol_env, compound the volSlide ON TOP of it
    // rather than replacing it.  We rebuild a per-frame gain curve that adds
    // the slide delta to each vol_env attenuation value so the instrument's
    // natural shape is preserved while the volSlide modifies the trajectory.
    if (inst && inst.vol_env) {
      const volEnvMacro = parseMacro(inst.vol_env);
      if (volEnvMacro && volEnvMacro.values.length > 0) {
        const frameRate = 60;
        const totalFrames = Math.max(2, Math.ceil(dur * frameRate));
        const envState = makeMacroState();
        const combinedVals: number[] = [];

        for (let f = 0; f < totalFrames; f++) {
          const progress = totalFrames > 1 ? f / (totalFrames - 1) : 1;
          const envAtt = Math.max(0, Math.min(15, getMacroValue(volEnvMacro, envState)));
          // Negative delta = fade out → attenuation increases with progress.
          const slideAtt = -delta * (steps !== undefined
            ? Math.min(1, Math.ceil(progress * steps) / steps)
            : progress);
          const combinedAtt = Math.max(0, Math.min(15, envAtt + slideAtt));
          combinedVals.push((1 - combinedAtt / 15) * mixGain);
          advanceMacro(volEnvMacro, envState);
        }

        const combinedCurve = new Float32Array(combinedVals);
        try {
          gainParam.setValueCurveAtTime(combinedCurve, start, Math.max(0.001, dur));
        } catch (_) {
          if (combinedVals.length > 0) {
            gainParam.setValueAtTime(combinedVals[0], start);
          }
        }
        gainParam.setValueAtTime(0.0001, start + dur);
        gainParam.linearRampToValueAtTime(0.0001, start + dur + 0.005);
        return;
      }
    }

    // ── standalone vol slide (no vol_env) ────────────────────────────────────
    gainParam.setValueAtTime(baselineGain, start);

    // BeatBax volSlide semantics: positive delta = fade-in / louder.
    // On SMS this means attenuation decreases as delta increases.
    if (steps !== undefined && tickSeconds !== undefined) {
      // Stepped volume slide
      const stepDuration = dur / steps;
      gainParam.setValueAtTime(baselineGain, start);

      for (let i = 1; i <= steps; i++) {
        const stepTime = start + (i * stepDuration);
        const stepAtt = baselineAttenuation - (delta * i / steps);
        const stepGain = gainFromAttenuation(stepAtt);
        const prevGain = i === 1
          ? baselineGain
          : gainFromAttenuation(baselineAttenuation - (delta * (i - 1) / steps));
        gainParam.setValueAtTime(prevGain, stepTime - 0.00001);
        gainParam.setValueAtTime(stepGain, stepTime);
      }
      const finalGain = gainFromAttenuation(baselineAttenuation - delta);
      gainParam.setValueAtTime(finalGain, start + dur);
    } else {
      // Smooth volume slide: linear ramp over note duration
      const targetGain = gainFromAttenuation(baselineAttenuation - delta);
      gainParam.linearRampToValueAtTime(targetGain, start + dur);
    }
    gainParam.setValueAtTime(0.0001, start + dur);
    gainParam.linearRampToValueAtTime(0.0001, start + dur + 0.005);
  } catch (e) {
    console.warn(`[chip-sms] Volume slide failed for channel ${chId || '?'}: ${e}`);
  }
};
