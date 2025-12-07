/** Wavetable playback helper for Game Boy wave channel (browser WebAudio). */
import { freqFromRegister, registerFromFreq, GB_CLOCK } from './periodTables';
import { parseEnvelope } from './pulse';

export function playWavetable(ctx: BaseAudioContext | any, freq: number, table: number[], start: number, dur: number, inst: any, scheduler?: any) {
  const sampleRate = 8192;
  const cycleLen = (table && table.length) ? table.length : 16;
  const buf = ctx.createBuffer(1, cycleLen, sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < cycleLen; i++) data[i] = (table[i] / 15) * 0.9;

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const baseRate = sampleRate;
  // Align frequency to Game Boy period register steps for consistent playback.
  try {
    const reg = registerFromFreq(freq);
    const aligned = freqFromRegister(reg);
    src.playbackRate.value = (aligned * cycleLen) / baseRate;
  } catch (e) {
    src.playbackRate.value = (freq * cycleLen) / baseRate;
  }

  const gain = ctx.createGain();
  src.connect(gain);
  gain.connect(ctx.destination);

  const env = parseEnvelope(inst && inst.env);
  const g = gain.gain;
  if (env && env.mode === 'gb') {
    const initialVol = (env.initial ?? 15) / 15;
    // Precise GB envelope step period using GB clock: 1/64s = 65536/GB_CLOCK
    const stepPeriod = (env.period ?? 1) * (65536 / GB_CLOCK);
    if (env.period && env.period > 0) {
      const maxSteps = Math.max(1, Math.floor(dur / stepPeriod));
      const vals: number[] = [];
      let cur = env.initial ?? 15;
      vals.push((cur / 15) * 0.9);
      for (let s = 1; s <= maxSteps; s++) {
        if (env.direction === 'up') cur = Math.min(15, cur + 1);
        else cur = Math.max(0, cur - 1);
        vals.push((cur / 15) * 0.9);
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
            for (let vi = 1; vi < vals.length; vi++) {
              g.setValueAtTime(vals[vi], t);
              t += stepPeriod;
            }
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
      g.setValueAtTime(0.6, start);
      g.setTargetAtTime(0.0001, start + dur - 0.02, 0.02);
    }
  } else {
    g.setValueAtTime(0.6, start);
    g.setTargetAtTime(0.0001, start + dur - 0.02, 0.02);
  }

  try { src.start(start); } catch (e) { try { src.start(); } catch (_) {} }
  try { src.stop(start + dur + 0.02); } catch (e) {}
  return [src, gain];
}

export function parseWaveTable(raw: any): number[] {
  if (!raw) return new Array(16).fill(0);
  if (Array.isArray(raw)) return raw.map(n => Number(n) || 0);
  try {
    const s = String(raw);
    const arr = JSON.parse(s);
    if (Array.isArray(arr)) return arr.map(n => Number(n) || 0);
  } catch (_) {}
  return new Array(16).fill(0);
}

export default { playWavetable, parseWaveTable };
