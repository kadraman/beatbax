/** Noise channel helper implementing an LFSR-like buffer generator. */
import { parseEnvelope } from './pulse.js';
import { GB_CLOCK } from './periodTables.js';
import {
  lowerGameBoyInstrumentProgram,
  resolveNoiseClockWithOffset,
  tickRowAtTime,
  tickRowVolume,
  type TickProgram,
} from './instrumentProgram.js';
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

function fillNoiseBuffer(
  data: Float32Array,
  sr: number,
  inst: Record<string, unknown>,
  program: TickProgram | null,
  useProgramVolume: boolean,
): void {
  const width = resolveNoiseWidth(inst);
  const width7 = width === 7;
  let phase = 0;
  let lfsr = triggerGameBoyLfsr(width7);

  let currentOffset = 0;
  let { shift, divisor } = program?.enabled
    ? resolveNoiseClockWithOffset(inst, 0)
    : resolveNoiseClock(inst);
  let lfsrHz = noiseClockToLfsrHz(shift, divisor, GB_CLOCK);
  let lastTick = -1;
  let volScale = 1;

  for (let i = 0; i < data.length; i++) {
    const t = i / sr;

    if (program?.enabled) {
      const tick = Math.floor(t * 60);
      if (tick !== lastTick) {
        lastTick = tick;
        const row = tickRowAtTime(program, t);
        if (row) {
          if (row.offset !== currentOffset) {
            currentOffset = row.offset;
            ({ shift, divisor } = resolveNoiseClockWithOffset(inst, currentOffset));
            lfsrHz = noiseClockToLfsrHz(shift, divisor, GB_CLOCK);
          }
          if (useProgramVolume) {
            const v = tickRowVolume(row);
            if (v !== null) volScale = v / 15;
          }
        }
      }
    }

    phase += lfsrHz / sr;
    const ticks = Math.floor(phase);
    if (ticks > 0) {
      for (let step = 0; step < ticks; step++) lfsr = stepGameBoyLfsr(lfsr, width7);
      phase -= ticks;
    }
    data[i] = gameBoyNoiseSample(lfsr) * NOISE_OUTPUT_GAIN * (useProgramVolume ? volScale : 1);
  }
}

export function playNoise(ctx: BaseAudioContext | any, start: number, dur: number, inst: any, scheduler?: any, destination?: AudioNode, skipEnvelope?: boolean) {
  const sr = ctx.sampleRate;
  const playDur = resolveNoisePlayDurationSec(inst ?? {}, dur);
  const len = Math.ceil(Math.min(playDur + 0.05, 4) * sr);
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);

  const program = lowerGameBoyInstrumentProgram(inst ?? {});
  const useProgramVolume = program.enabled && program.rows.some((r) => tickRowVolume(r) !== null);
  fillNoiseBuffer(data, sr, inst ?? {}, program.enabled ? program : null, useProgramVolume);

  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  src.connect(gain);
  gain.connect(destination || ctx.destination);

  const env = parseEnvelope(inst && inst.env);
  const g = gain.gain;
  // When vol_env drives the program, volume is baked into the buffer — hold unity gain.
  if (useProgramVolume || skipEnvelope) {
    g.setValueAtTime(1.0, start);
    g.setValueAtTime(1.0, start + playDur);
    g.linearRampToValueAtTime(0.0001, start + playDur + 0.005);
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
