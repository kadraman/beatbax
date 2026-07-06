/** Noise channel helper implementing an LFSR-like buffer generator. */
import { parseEnvelope } from './pulse.js';
import { GB_CLOCK } from './periodTables.js';
import {
  gameBoyNoiseSample,
  NOISE_OUTPUT_GAIN,
  noiseClockToLfsrHz,
  resolveNoiseClock,
  resolveNoisePlayDurationSec,
  resolveNoiseWidth,
  stepGameBoyLfsr,
  triggerGameBoyLfsr,
} from './noiseNote.js';

export function playNoise(ctx: BaseAudioContext | any, start: number, dur: number, inst: any, scheduler?: any, destination?: AudioNode, skipEnvelope?: boolean) {
  const sr = ctx.sampleRate;
  const playDur = resolveNoisePlayDurationSec(inst ?? {}, dur);
  const len = Math.ceil(Math.min(playDur + 0.05, 4) * sr);
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);

  const width = resolveNoiseWidth(inst);
  const width7 = width === 7;
  const { shift, divisor } = resolveNoiseClock(inst ?? {});
  const lfsrHz = noiseClockToLfsrHz(shift, divisor, GB_CLOCK);
  let phase = 0;
  let lfsr = triggerGameBoyLfsr(width7);

  for (let i = 0; i < len; i++) {
    phase += lfsrHz / sr;
    const ticks = Math.floor(phase);
    if (ticks > 0) {
      for (let t = 0; t < ticks; t++) lfsr = stepGameBoyLfsr(lfsr, width7);
      phase -= ticks;
    }
    data[i] = gameBoyNoiseSample(lfsr) * NOISE_OUTPUT_GAIN;
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  src.connect(gain);
  gain.connect(destination || ctx.destination);

  const env = parseEnvelope(inst && inst.env);
  const g = gain.gain;
  // Skip envelope automation if skipEnvelope flag is set (e.g., when volume effects are present)
  if (skipEnvelope) {
    g.setValueAtTime(1.0, start);
  } else if (env && env.mode === 'gb') {
    const initialVol = (env.initial ?? 15) / 15;
    const stepPeriod = (env.period ?? 1) * (65536 / GB_CLOCK);
    if (env.period && env.period > 0) {
      const maxSteps = Math.max(1, Math.floor(playDur / stepPeriod));
      const vals: number[] = [];
      let cur = env.initial ?? 15;
      vals.push((cur / 15) * 1.0);
      for (let s = 1; s <= maxSteps; s++) {
        if (env.direction === 'up') cur = Math.min(15, cur + 1);
        else cur = Math.max(0, cur - 1);
        vals.push((cur / 15) * 1.0);
        if (cur === 0 || cur === 15) break;
      }
      const curve = new Float32Array(vals);
      const curveDuration = (vals.length - 1) * stepPeriod;
      const gainAtDur = vals[vals.length - 1];
      if (scheduler && typeof scheduler.scheduleAligned === 'function' && typeof (g as any).setValueCurveAtTime === 'function') {
        scheduler.scheduleAligned(start, () => {
          try { (g as any).setValueCurveAtTime(curve, start, curveDuration); } catch (e) { try { g.setValueAtTime(vals[0], start); } catch (_) {} }
        });
        scheduler.scheduleAligned(start + playDur, () => { try { g.setValueAtTime(gainAtDur, start + playDur); g.linearRampToValueAtTime(0.0001, start + playDur + 0.005); } catch (e) {} });
      } else if (scheduler && typeof scheduler.schedule === 'function' && typeof (g as any).setValueCurveAtTime === 'function') {
        scheduler.schedule(start, () => {
          try { (g as any).setValueCurveAtTime(curve, start, curveDuration); } catch (e) { try { g.setValueAtTime(vals[0], start); } catch (_) {} }
        });
        scheduler.schedule(start + playDur, () => { try { g.setValueAtTime(gainAtDur, start + playDur); g.linearRampToValueAtTime(0.0001, start + playDur + 0.005); } catch (e) {} });
      } else {
        try {
          if (typeof (g as any).setValueCurveAtTime === 'function') {
            (g as any).setValueCurveAtTime(curve, start, curveDuration);
            g.setValueAtTime(gainAtDur, start + playDur);
            g.linearRampToValueAtTime(0.0001, start + playDur + 0.005);
          } else {
            g.setValueAtTime(vals[0], start);
            let t = start + stepPeriod;
            for (let vi = 1; vi < vals.length; vi++) { g.setValueAtTime(vals[vi], t); t += stepPeriod; }
            g.setValueAtTime(gainAtDur, start + playDur);
            g.linearRampToValueAtTime(0.0001, start + playDur + 0.005);
          }
        } catch (e) {
          g.setValueAtTime(vals[0], start);
          g.setValueAtTime(gainAtDur, start + playDur);
          g.linearRampToValueAtTime(0.0001, start + playDur + 0.005);
        }
      }
    } else {
      const hold = Math.max(0.0001, initialVol);
      g.setValueAtTime(hold, start);
      g.setValueAtTime(hold, start + playDur);
      g.linearRampToValueAtTime(0.0001, start + playDur + 0.005);
    }
  } else {
    g.setValueAtTime(1.0, start);
    g.setTargetAtTime(0.0001, start + playDur - 0.02, 0.02);
  }

  try { src.start(start); } catch (e) { try { src.start(); } catch (_) {} }
  try { src.stop(start + playDur + 0.02); } catch (e) {}
  return [src, gain];
}

export default { playNoise };
