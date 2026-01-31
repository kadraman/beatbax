/** Noise channel helper implementing an LFSR-like buffer generator. */
import { parseEnvelope } from './pulse.js';
import { GB_CLOCK } from './periodTables.js';

export function playNoise(ctx: BaseAudioContext | any, start: number, dur: number, inst: any, scheduler?: any, destination?: AudioNode, skipEnvelope?: boolean) {
  const sr = ctx.sampleRate;
  const len = Math.ceil(Math.min(1, dur + 0.05) * sr);
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);

  const width = inst && inst.width ? Number(inst.width) : 15;
  const divisor = inst && inst.divisor ? Number(inst.divisor) : 3;
  const shift = inst && inst.shift ? Number(inst.shift) : 4;
  const GB_CLOCK = 4194304;
  const div = Math.max(1, Number.isFinite(divisor) ? divisor : 3);
  const lfsrHz = GB_CLOCK / (div * Math.pow(2, (shift || 0) + 1));
  let phase = 0;
  let lfsr = 1;
  const is7bit = width === 7 || width === 7;

  function stepLFSR(state: number) {
    const bit = ((state >> 0) ^ (state >> 1)) & 1;
    state = (state >> 1) | (bit << 14);
    if (is7bit) {
      const low7 = ((state >> 8) & 0x7F) >>> 0;
      const newLow7 = ((low7 >> 1) | ((low7 & 1) << 6)) & 0x7F;
      state = (state & ~(0x7F << 8)) | (newLow7 << 8);
    }
    return state >>> 0;
  }

  for (let i = 0; i < len; i++) {
    phase += lfsrHz / sr;
    const ticks = Math.floor(phase);
    if (ticks > 0) {
      for (let t = 0; t < ticks; t++) lfsr = stepLFSR(lfsr);
      phase -= ticks;
    }
    const sampleVal = (lfsr & 1) ? 1 : -1;
    data[i] = sampleVal * 0.3;
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
    g.setValueAtTime(0.3, start);
  } else if (env && env.mode === 'gb') {
    const initialVol = (env.initial ?? 15) / 15;
    const stepPeriod = (env.period ?? 1) * (65536 / GB_CLOCK);
    if (env.period && env.period > 0) {
      const maxSteps = Math.max(1, Math.floor(dur / stepPeriod));
      const vals: number[] = [];
      let cur = env.initial ?? 15;
      vals.push((cur / 15) * 0.3);
      for (let s = 1; s <= maxSteps; s++) {
        if (env.direction === 'up') cur = Math.min(15, cur + 1);
        else cur = Math.max(0, cur - 1);
        vals.push((cur / 15) * 0.3);
        if (cur === 0 || cur === 15) break;
      }
      const curve = new Float32Array(vals);
      const curveDuration = (vals.length - 1) * stepPeriod;
      if (scheduler && typeof scheduler.scheduleAligned === 'function' && typeof (g as any).setValueCurveAtTime === 'function') {
        scheduler.scheduleAligned(start, () => {
          try { (g as any).setValueCurveAtTime(curve, start, curveDuration); } catch (e) { try { g.setValueAtTime(vals[0], start); } catch (_) {} }
        });
        scheduler.scheduleAligned(start + dur, () => { try { g.setValueAtTime(g.value, start + dur); g.linearRampToValueAtTime(0.0001, start + dur + 0.005); } catch (e) {} });
      } else if (scheduler && typeof scheduler.schedule === 'function' && typeof (g as any).setValueCurveAtTime === 'function') {
        scheduler.schedule(start, () => {
          try { (g as any).setValueCurveAtTime(curve, start, curveDuration); } catch (e) { try { g.setValueAtTime(vals[0], start); } catch (_) {} }
        });
        scheduler.schedule(start + dur, () => { try { g.setValueAtTime(g.value, start + dur); g.linearRampToValueAtTime(0.0001, start + dur + 0.005); } catch (e) {} });
      } else {
        try {
          if (typeof (g as any).setValueCurveAtTime === 'function') {
            (g as any).setValueCurveAtTime(curve, start, curveDuration);
            g.setValueAtTime(g.value, start + dur);
            g.linearRampToValueAtTime(0.0001, start + dur + 0.005);
          } else {
            g.setValueAtTime(vals[0], start);
            let t = start + stepPeriod;
            for (let vi = 1; vi < vals.length; vi++) { g.setValueAtTime(vals[vi], t); t += stepPeriod; }
            g.setValueAtTime(g.value, start + dur);
            g.linearRampToValueAtTime(0.0001, start + dur + 0.005);
          }
        } catch (e) {
          g.setValueAtTime(vals[0], start);
          g.setValueAtTime(g.value, start + dur);
          g.linearRampToValueAtTime(0.0001, start + dur + 0.005);
        }
      }
    } else {
      g.gain.setValueAtTime(0.3, start);
      g.gain.setTargetAtTime(0.0001, start + dur - 0.02, 0.02);
    }
  } else {
    g.gain.setValueAtTime(0.3, start);
    g.gain.setTargetAtTime(0.0001, start + dur - 0.02, 0.02);
  }

  try { src.start(start); } catch (e) { try { src.start(); } catch (_) {} }
  try { src.stop(start + dur + 0.02); } catch (e) {}
  return [src, gain];
}

export default { playNoise };
