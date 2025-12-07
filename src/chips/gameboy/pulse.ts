import { freqFromRegister, registerFromFreq, GB_CLOCK } from './periodTables';

// Create a PeriodicWave representing a pulse wave with given duty (0..1).
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
  // Support two envelope styles:
  // - Game Boy style: "<initial(0-15)>,<up|down>[,<period(0-7)>]" e.g. "12,down"
  // - ADSR-like fallback: a number like "12" or other strings interpreted by legacy logic
  if (!envStr) {
    return { mode: 'adsr', attack: 0.001, decay: 0.05, sustainLevel: 0.6, release: 0.02 };
  }
  if (typeof envStr === 'object') return envStr;
  const s = String(envStr).trim();
  // Detect explicit Game Boy-style envelope only when the syntax is unambiguous:
  // - prefixed with `gb:` OR
  // - contains at least three comma-separated tokens (initial,direction,period)
  const gbPrefixed = s.match(/^gb:\s*(\d{1,2})\s*,\s*(up|down)(?:\s*,\s*(\d+))?$/i);
  const parts = s.split(',').map(p => p.trim()).filter(Boolean);
  const gbThree = parts.length >= 3 && /^\d{1,2}$/.test(parts[0]) && /^(up|down)$/i.test(parts[1]);
  const gb = gbPrefixed || (gbThree ? parts : null);
  if (gb) {
    const initial = Math.max(0, Math.min(15, parseInt((gbPrefixed ? gb[1] : parts[0]) as any, 10)));
    const direction = (gbPrefixed ? gb[2] : parts[1]).toLowerCase() === 'up' ? 'up' : 'down';
    const periodRaw = gbPrefixed ? gb[3] : parts[2];
    const period = Math.max(0, Math.min(7, Number.isFinite(Number(periodRaw)) ? Number(periodRaw) : 1));
    return { mode: 'gb', initial, direction, period };
  }

  // Legacy ADSR-ish parsing for backwards compatibility
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

/** Play a pulse note with given frequency, duty, duration and inst props. */
export function playPulse(ctx: BaseAudioContext, freq: number, duty: number, start: number, dur: number, inst: any, scheduler?: any) {
  const osc = (ctx as any).createOscillator();
  const gain = (ctx as any).createGain();
  const pw = createPulsePeriodicWave(ctx, duty);
  try { (osc as any).setPeriodicWave(pw); } catch (e) {
    try { (osc as any).type = 'square'; } catch (e2) {}
  }
  // Quantize/align frequency to the Game Boy frequency register steps so
  // playback matches the hardware-period grid as closely as possible.
  try {
    const reg = registerFromFreq(freq);
    const aligned = freqFromRegister(reg);
    osc.frequency.value = aligned;
  } catch (e) {
    // If period table helpers fail for any reason, fall back to requested freq.
    osc.frequency.value = freq;
  }
  osc.connect(gain);
  gain.connect((ctx as any).destination);

  const env = parseEnvelope(inst && inst.env);
  const g = gain.gain;
  if (env && env.mode === 'gb') {
    // Game Boy envelope: initial (0-15), direction up/down, period (0-7)
    const initialVol = (env.initial ?? 15) / 15;
    // Envelope step period: GB frame sequencer clocks envelope at 64Hz (1/64 s).
    // Use GB clock to compute exact period: 1/64 = 65536 / GB_CLOCK seconds.
    const stepPeriod = (env.period ?? 1) * (65536 / GB_CLOCK);
    // Start at initial volume (schedule immediately via scheduler if provided)
    if (env.period && env.period > 0) {
      // Attempt to coalesce envelope steps into a single automation curve
      const maxSteps = Math.max(1, Math.floor(dur / stepPeriod));
      // Build values sequence starting with initial
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
      const curveDuration = (vals.length - 1) * stepPeriod;
      if (scheduler && typeof scheduler.scheduleAligned === 'function' && typeof (g as any).setValueCurveAtTime === 'function') {
        // Schedule a single call that installs the automation curve at start,
        // but align it to the GB frame boundaries via scheduleAligned.
        scheduler.scheduleAligned(start, () => {
          try { (g as any).setValueCurveAtTime(curve, start, curveDuration); } catch (e) { try { g.setValueAtTime(vals[0], start); } catch (_) {} }
        });
        // Final small ramp to silence after the note ends (frame-aligned)
        scheduler.scheduleAligned(start + dur, () => { try { g.setValueAtTime(g.value, start + dur); g.linearRampToValueAtTime(0.0001, start + dur + 0.005); } catch (e) {} });
      } else if (scheduler && typeof scheduler.schedule === 'function' && typeof (g as any).setValueCurveAtTime === 'function') {
        // If scheduleAligned isn't available use regular scheduling
        scheduler.schedule(start, () => {
          try { (g as any).setValueCurveAtTime(curve, start, curveDuration); } catch (e) { try { g.setValueAtTime(vals[0], start); } catch (_) {} }
        });
        scheduler.schedule(start + dur, () => { try { g.setValueAtTime(g.value, start + dur); g.linearRampToValueAtTime(0.0001, start + dur + 0.005); } catch (e) {} });
      } else {
        // Fallback: apply the curve directly on the AudioParam if available
        try {
          if (typeof (g as any).setValueCurveAtTime === 'function') {
            (g as any).setValueCurveAtTime(curve, start, curveDuration);
            g.setValueAtTime(g.value, start + dur);
            g.linearRampToValueAtTime(0.0001, start + dur + 0.005);
          } else {
            // last-resort per-step scheduling
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
          // worst-case fallback
          g.setValueAtTime(vals[0], start);
          g.setValueAtTime(g.value, start + dur);
          g.linearRampToValueAtTime(0.0001, start + dur + 0.005);
        }
      }
    } else {
      // no GB-style stepping requested -- use legacy ADSR scheduling
      g.setValueAtTime(0.0001, start);
      g.exponentialRampToValueAtTime(env.attackLevel || 1.0, start + (env.attack || 0.001));
      g.setTargetAtTime(env.sustainLevel ?? 0.5, start + (env.attack || 0.001), env.decay || 0.1);
      g.setTargetAtTime(0.0001, start + dur - (env.release || 0.02), env.release || 0.02);
    }
  } else {
    // Legacy ADSR path
    g.setValueAtTime(0.0001, start);
    g.exponentialRampToValueAtTime(env.attackLevel || 1.0, start + (env.attack || 0.001));
    g.setTargetAtTime(env.sustainLevel ?? 0.5, start + (env.attack || 0.001), env.decay || 0.1);
    g.setTargetAtTime(0.0001, start + dur - (env.release || 0.02), env.release || 0.02);
  }

  try { (osc as any).start(start); } catch (e) { try { (osc as any).start(); } catch (_) {} }
  try { (osc as any).stop(start + dur + 0.02); } catch (e) {}
  return [osc, gain];
}

export default { playPulse };
