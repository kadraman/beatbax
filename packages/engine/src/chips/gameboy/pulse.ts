import { freqFromRegister, registerFromFreq, GB_CLOCK } from './periodTables.js';
import {
  applyTickOffsetToFreq,
  lowerGameBoyInstrumentProgram,
  tickRowAtTime,
  tickRowDutyFraction,
  tickRowVolume,
  type TickProgram,
} from './instrumentProgram.js';

/**
 * Pulse PCM/WebAudio output scale tuned against hUGETracker WAV export.
 *
 * Calibrated so held pulse notes (e.g. env=12,flat → peak ≈ 12/15 × gain) match
 * hUGETracker on `gb_subpattern_macro_demo` (~0.20). Raw ±1 squares without this
 * scale sit ~2× above the DMG/hUGE mix on sustained tones.
 */
export const PULSE_OUTPUT_GAIN = 0.25;

function createPulsePeriodicWave(ctx: BaseAudioContext, duty = 0.5) {
  const size = 4096;
  const real = new Float32Array(size);
  const imag = new Float32Array(size);
  const maxHarm = 200;
  let d = Number(duty);
  if (!Number.isFinite(d)) d = 0.5;
  d = Math.max(0, Math.min(1, d));
  for (let n = 1; n <= maxHarm; n++) {
    const k = n;
    const a = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * d);
    real[k] = 0;
    imag[k] = Number.isFinite(a) ? a : 0;
  }
  return (ctx as any).createPeriodicWave(real, imag, { disableNormalization: true });
}

export function parseEnvelope(envStr: any) {
  if (!envStr) {
    return { mode: 'adsr', attack: 0.001, decay: 0.05, sustainLevel: 0.6, release: 0.02 };
  }
  // If an object is provided, accept ADSR objects as-is but
  // normalize known Game Boy-style object shapes (backwards/alternate formats).
  if (typeof envStr === 'object') {
    const obj: any = envStr;
    const isGbFormat = (obj.format && String(obj.format).toLowerCase() === 'gb') ||
      (obj.mode && String(obj.mode).toLowerCase() === 'gb') ||
      typeof obj.level !== 'undefined' || typeof obj.initial !== 'undefined';
    if (isGbFormat) {
      const initialRaw = obj.initial ?? obj.level ?? obj.value;
      const initial = Math.max(0, Math.min(15, Number.isFinite(Number(initialRaw)) ? Number(initialRaw) : 15));
      const dirStr = String(obj.direction ?? obj.dir ?? 'down').toLowerCase();
      let direction: 'up' | 'down' | 'flat';
      if (dirStr === 'up') direction = 'up';
      else if (dirStr === 'flat') direction = 'flat';
      else direction = 'down';
      const periodRaw = obj.period ?? obj.step ?? obj.periodRaw ?? 1;
      const period = (direction === 'flat') ? 0 : Math.max(0, Math.min(7, Number.isFinite(Number(periodRaw)) ? Number(periodRaw) : 1));
      return { mode: 'gb', initial, direction, period };
    }
    return obj;
  }
  const s = String(envStr).trim();
  const gbPrefixed = s.match(/^gb:\s*(\d{1,2})\s*,\s*(up|down|flat)(?:\s*,\s*(\d+))?$/i);
  const parts = s.split(',').map(p => p.trim()).filter(Boolean);
  const gbThree = parts.length >= 3 && /^\d{1,2}$/.test(parts[0]) && /^(up|down|flat)$/i.test(parts[1]);
  const gbTwo = parts.length >= 2 && /^\d{1,2}$/.test(parts[0]) && /^(up|down|flat)$/i.test(parts[1]);
  const gb = gbPrefixed || (gbThree ? parts : (gbTwo ? parts : null));
  if (gb) {
    const initial = Math.max(0, Math.min(15, parseInt((gbPrefixed ? gb[1] : parts[0]) as any, 10)));
    const directionStr = (gbPrefixed ? gb[2] : parts[1]).toLowerCase();
    let direction: 'up' | 'down' | 'flat';
    if (directionStr === 'up') direction = 'up';
    else if (directionStr === 'flat') direction = 'flat';
    else direction = 'down';
    const periodRaw = gbPrefixed ? gb[3] : parts[2];
    const period = (direction === 'flat') ? 0 : Math.max(0, Math.min(7, Number.isFinite(Number(periodRaw)) ? Number(periodRaw) : 1));
    return { mode: 'gb', initial, direction, period };
  }

  const res: any = { mode: 'adsr', attack: 0.001, decay: 0.05, sustainLevel: 0.6, release: 0.02 };
  const m = s.match(/(\d+)/);
  if (m) {
    const v = parseInt(m[1], 10);
    res.decay = Math.max(0.01, (16 - v) * 0.01);
    res.sustainLevel = 0.2 + (v / 15) * 0.8;
  }
  if (s.includes('down')) res.sustainLevel = 0.0;
  return res;
}

export function parseSweep(sweepStr: any) {
  if (!sweepStr) return null;

  // If already an object, validate/clamp and return
  if (typeof sweepStr === 'object') {
    const s: any = sweepStr;
    if (s.time === undefined || s.direction === undefined || s.shift === undefined) return null;
    const time = Math.max(0, Math.min(7, Number.isFinite(Number(s.time)) ? Number(s.time) : 0));
    const dirStr = String(s.direction).toLowerCase();
    const direction: 'up' | 'down' = (dirStr === 'down' || dirStr === 'dec' || dirStr === '1') ? 'down' : 'up';
    const shift = Math.max(0, Math.min(7, Number.isFinite(Number(s.shift)) ? Number(s.shift) : 0));
    return { time, direction, shift };
  }

  const parts = String(sweepStr).split(',').map(p => p.trim());
  if (parts.length < 3) return null;

  const timeRaw = parseInt(parts[0], 10);
  const time = Math.max(0, Math.min(7, isNaN(timeRaw) ? 0 : timeRaw));

  const dirStr = parts[1].toLowerCase();
  const direction: 'up' | 'down' = (dirStr === 'down' || dirStr === 'dec' || dirStr === '1') ? 'down' : 'up';

  const shiftRaw = parseInt(parts[2], 10);
  const shift = Math.max(0, Math.min(7, isNaN(shiftRaw) ? 0 : shiftRaw));

  return { time, direction, shift };
}

function applySweep(
  freqParam: AudioParam,
  initialFreq: number,
  start: number,
  dur: number,
  sweep: { time: number; direction: 'up' | 'down'; shift: number }
) {
  const sweepInterval = sweep.time / 128; // 128Hz intervals
  if (sweepInterval <= 0) return;

  const numSweeps = Math.floor(dur / sweepInterval);
  let currentReg = registerFromFreq(initialFreq);

  for (let i = 1; i <= numSweeps; i++) {
    const time = start + (i * sweepInterval);
    const delta = currentReg >> sweep.shift;

    if (sweep.direction === 'up') {
      // Pitch UP = Frequency INCREASE = Register INCREASE
      currentReg += delta;
    } else {
      // Pitch DOWN = Frequency DECREASE = Register DECREASE
      currentReg -= delta;
    }

    // Hardware constraints
    if (currentReg < 0) currentReg = 0;
    if (currentReg > 2047) {
      // Overflow silences the channel on real hardware
      freqParam.setValueAtTime(0, time);
      break;
    }

    const nextFreq = freqFromRegister(currentReg);
    freqParam.setValueAtTime(nextFreq, time);
  }
}

/**
 * Render a pulse into a buffer while advancing a Game Boy tick program
 * (arp_env / pitch_env offsets, duty_env → 9xx, vol_env → Cxy).
 */
export function fillPulseBufferFromProgram(
  data: Float32Array,
  sr: number,
  baseFreq: number,
  initialDuty: number,
  program: TickProgram,
  useProgramVolume: boolean,
): void {
  let phase = 0;
  let duty = Math.max(0.01, Math.min(0.99, initialDuty));
  let currentOffset: number | null = 0;
  let lastTick = -1;
  let volScale = 1;
  let effFreq = applyTickOffsetToFreq(baseFreq, 0);

  const r0 = tickRowAtTime(program, 0);
  if (r0) {
    const d0 = tickRowDutyFraction(r0);
    if (d0 !== null) duty = d0;
    currentOffset = r0.offset === undefined ? 0 : r0.offset;
    effFreq = applyTickOffsetToFreq(baseFreq, currentOffset);
    if (useProgramVolume) {
      const v0 = tickRowVolume(r0);
      if (v0 !== null) volScale = v0 / 15;
    }
  }

  for (let i = 0; i < data.length; i++) {
    const t = i / sr;
    const tick = Math.floor(t * 60);
    if (tick !== lastTick) {
      lastTick = tick;
      const row = tickRowAtTime(program, t);
      if (row) {
        const d = tickRowDutyFraction(row);
        if (d !== null) duty = d;
        const off = row.offset === undefined ? null : row.offset;
        if (off !== currentOffset) {
          currentOffset = off;
          effFreq = applyTickOffsetToFreq(baseFreq, currentOffset);
        }
        if (useProgramVolume) {
          const v = tickRowVolume(row);
          if (v !== null) volScale = v / 15;
        }
      }
    }

    let sample = 0;
    if (effFreq > 0 && effFreq < sr / 2) {
      phase += effFreq / sr;
      phase -= Math.floor(phase);
      sample = phase < duty ? 1.0 : -1.0;
    }
    data[i] = sample * (useProgramVolume ? volScale : 1) * PULSE_OUTPUT_GAIN;
  }
}

export function playPulse(ctx: BaseAudioContext, freq: number, duty: number, start: number, dur: number, inst: any, scheduler?: any, destination?: AudioNode) {
  const program = lowerGameBoyInstrumentProgram(inst ?? {});
  const useProgram = program.enabled;
  const useProgramVolume = useProgram && program.rows.some((r) => tickRowVolume(r) !== null);

  // Tick programs need per-frame duty/pitch — OscillatorNode PeriodicWave can't
  // automate duty, so bake into a buffer (same approach as noise programs).
  if (useProgram) {
    const sr = ctx.sampleRate;
    const len = Math.max(1, Math.ceil(dur * sr));
    const buf = ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    let aligned = freq;
    try {
      aligned = freqFromRegister(registerFromFreq(freq));
    } catch (_) {}
    fillPulseBufferFromProgram(data, sr, aligned, duty, program, useProgramVolume);

    const src = (ctx as any).createBufferSource();
    src.buffer = buf;
    (src as any).__basePlaybackRate = 1;
    (src as any)._baseFreq = aligned;
    const gain = (ctx as any).createGain();
    src.connect(gain);
    gain.connect(destination || (ctx as any).destination);

    const g = gain.gain;
    if (useProgramVolume) {
      g.setValueAtTime(1.0, start);
      g.setValueAtTime(1.0, start + dur);
      g.linearRampToValueAtTime(0.0001, start + dur + 0.005);
    } else {
      const env = parseEnvelope(inst && inst.env);
      if (env && env.mode === 'gb') {
        const initialVol = (env.initial ?? 15) / 15;
        const stepPeriod = (env.period ?? 1) * (65536 / GB_CLOCK);
        if (env.period && env.period > 0) {
          const maxSteps = Math.max(1, Math.floor(dur / stepPeriod));
          const vals: number[] = [];
          let cur = env.initial ?? 15;
          vals.push(cur / 15);
          for (let s = 1; s <= maxSteps; s++) {
            if (env.direction === 'up') cur = Math.min(15, cur + 1);
            else cur = Math.max(0, cur - 1);
            vals.push(cur / 15);
            if (cur === 0 || cur === 15) break;
          }
          const curve = new Float32Array(vals);
          const curveDuration = Math.max(0.001, (vals.length - 1) * stepPeriod);
          try { (g as any).setValueCurveAtTime(curve, start, curveDuration); } catch (_) {
            try { g.setValueAtTime(vals[0], start); } catch (_) {}
          }
          g.setValueAtTime(vals[vals.length - 1], start + dur);
          g.linearRampToValueAtTime(0.0001, start + dur + 0.005);
        } else {
          const hold = Math.max(0.0001, initialVol);
          g.setValueAtTime(hold, start);
          g.setValueAtTime(hold, start + dur);
          g.linearRampToValueAtTime(0.0001, start + dur + 0.005);
        }
      } else {
        g.setValueAtTime(1.0, start);
        g.setValueAtTime(1.0, start + dur);
        g.linearRampToValueAtTime(0.0001, start + dur + 0.005);
      }
    }

    try { src.start(start); } catch (_) { try { src.start(); } catch (_) {} }
    try { src.stop(start + dur + 0.02); } catch (_) {}
    return [src, gain];
  }

  const osc = (ctx as any).createOscillator();
  const gain = (ctx as any).createGain();
  const pw = createPulsePeriodicWave(ctx, duty);
  try { (osc as any).setPeriodicWave(pw); } catch (e) { try { (osc as any).type = 'square'; } catch (e2) {} }
  try {
    const reg = registerFromFreq(freq);
    const aligned = freqFromRegister(reg);
    // Use setValueAtTime instead of .value to avoid canceling later automations
    osc.frequency.setValueAtTime(aligned, start);
    // Store the base frequency for effects to use (since .value is not reliable before start time)
    (osc as any)._baseFreq = aligned;
  } catch (e) {
    osc.frequency.setValueAtTime(freq, start);
    (osc as any)._baseFreq = freq;
  }

  // Apply sweep if present (Game Boy pulse1 only)
  const sweep = parseSweep(inst && inst.sweep);
  if (sweep && sweep.time > 0) {
    applySweep(osc.frequency, freq, start, dur, sweep);
  }

  osc.connect(gain);
  gain.connect(destination || (ctx as any).destination);

  const env = parseEnvelope(inst && inst.env);
  const g = gain.gain;
  if (env && env.mode === 'gb') {
    const initialVol = ((env.initial ?? 15) / 15) * PULSE_OUTPUT_GAIN;
    const stepPeriod = (env.period ?? 1) * (65536 / GB_CLOCK);
    if (env.period && env.period > 0) {
      const maxSteps = Math.max(1, Math.floor(dur / stepPeriod));
      const vals: number[] = [];
      let cur = env.initial ?? 15;
      vals.push((cur / 15) * PULSE_OUTPUT_GAIN);
      for (let s = 1; s <= maxSteps; s++) {
        if (env.direction === 'up') cur = Math.min(15, cur + 1);
        else cur = Math.max(0, cur - 1);
        vals.push((cur / 15) * PULSE_OUTPUT_GAIN);
        if (cur === 0 || cur === 15) break;
      }
      const curve = new Float32Array(vals);
      const curveDuration = (vals.length - 1) * stepPeriod;

      // Helper used in every scheduling path below.
      // When the portamento effect has flagged __portamento_legato__ on this gain
      // node, replace the normal re-attacking envelope curve with a smooth gain
      // continuation so consecutive portamento notes don't produce audible attacks.
      function applyGainStart() {
        if ((g as any).__portamento_legato__) {
          const startG: number = (g as any).__portamento_gain_start__ ?? initialVol;
          const endG: number   = (g as any).__portamento_gain_end__   ?? initialVol;
          try {
            g.cancelScheduledValues(start);
            g.setValueAtTime(Math.max(0.0001, startG), start);
            if (Math.abs(endG - startG) > 0.001 && curveDuration > 0) {
              g.linearRampToValueAtTime(Math.max(0.0001, endG), start + curveDuration);
            }
          } catch (_) {}
        } else {
          try { (g as any).setValueCurveAtTime(curve, start, curveDuration); } catch (e) { try { g.setValueAtTime(vals[0], start); } catch (_) {} }
        }
      }
      function applyGainEnd() {
        try {
          const endG: number = (g as any).__portamento_legato__
            ? ((g as any).__portamento_gain_end__ ?? initialVol)
            : g.value;
          g.setValueAtTime(Math.max(0.0001, endG), start + dur);
          g.linearRampToValueAtTime(0.0001, start + dur + 0.005);
        } catch (e) {}
      }

      if (scheduler && typeof scheduler.scheduleAligned === 'function' && typeof (g as any).setValueCurveAtTime === 'function') {
        scheduler.scheduleAligned(start, applyGainStart);
        scheduler.scheduleAligned(start + dur, applyGainEnd);
      } else if (scheduler && typeof scheduler.schedule === 'function' && typeof (g as any).setValueCurveAtTime === 'function') {
        scheduler.schedule(start, applyGainStart);
        scheduler.schedule(start + dur, applyGainEnd);
      } else {
        // Direct (no scheduler): flags already set, apply immediately.
        applyGainStart();
        applyGainEnd();
      }
    } else {
      // GB envelope period 0 means constant volume at the initial level.
      const hold = Math.max(0.0001, initialVol);
      g.setValueAtTime(hold, start);
      g.setValueAtTime(hold, start + dur);
      g.linearRampToValueAtTime(0.0001, start + dur + 0.005);
    }
  } else {
    g.setValueAtTime(0.0001, start);
    g.exponentialRampToValueAtTime((env.attackLevel || 1.0) * PULSE_OUTPUT_GAIN, start + (env.attack || 0.001));
    g.setTargetAtTime((env.sustainLevel ?? 0.5) * PULSE_OUTPUT_GAIN, start + (env.attack || 0.001), env.decay || 0.1);
    g.setTargetAtTime(0.0001, start + dur - (env.release || 0.02), env.release || 0.02);
  }

  try { (osc as any).start(start); } catch (e) { try { (osc as any).start(); } catch (_) {} }
  try { (osc as any).stop(start + dur + 0.02); } catch (e) {}
  return [osc, gain];
}

export default { playPulse };
