import { freqFromRegister, registerFromFreq, GB_CLOCK } from './periodTables.js';
import { parseEnvelope } from './pulse.js';
export function playWavetable(ctx, freq, table, start, dur, inst, scheduler, destination) {
    // Normalize: guard against empty/missing table — default to silence (all zeros, 32 samples = GB wave RAM size)
    const safeTable = (table && table.length > 0) ? table : new Array(32).fill(0);
    const cycleLen = safeTable.length;
    // Use the native audio context sample rate so the playback rate stays near 1.0.
    // At native rate we can implement zero-order hold (ZOH) upsampling — each 4-bit
    // sample is held flat for its full duration, preserving the staircase character of
    // the real GB wave DAC.  A slow playbackRate with a tiny 8192 Hz buffer causes
    // WebAudio to linearly interpolate, smoothing away all the grungy step edges.
    const nativeSampleRate = ctx.sampleRate || 44100;
    // Resolve GB-aligned frequency so our period matches actual hardware registers.
    let alignedFreq = freq;
    try {
        const reg = registerFromFreq(freq);
        alignedFreq = freqFromRegister(reg);
    }
    catch (_) { }
    // One-cycle buffer length at native sample rate.
    const bufLen = Math.max(cycleLen, Math.round(nativeSampleRate / alignedFreq));
    const buf = ctx.createBuffer(1, bufLen, nativeSampleRate);
    const data = buf.getChannelData(0);
    // AC-couple: subtract mean so the waveform is centred around 0, matching the
    // real GB wave DAC which is always AC-coupled at the hardware level.
    const mean = safeTable.reduce((a, b) => a + b, 0) / cycleLen;
    // Scale by /15 (the 4-bit max) to preserve relative amplitude across waveforms;
    // using /peak would always normalise to ±0.9 regardless of the original level.
    // ZOH fill: for each output sample, look up which wave step it belongs to and
    // copy that step's value without any interpolation — staircase preserved.
    for (let s = 0; s < bufLen; s++) {
        const step = Math.floor(s * cycleLen / bufLen);
        data[s] = ((safeTable[step] - mean) / 15) * 0.9;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    // playbackRate ≈ 1.0 — minimal WebAudio interpolation.
    src.playbackRate.value = (alignedFreq * bufLen) / nativeSampleRate;
    // Attach metadata so effect handlers (e.g. portamento) can derive playbackRate
    // from a target frequency: playbackRate(f) = (f / __freq) * __basePlaybackRate
    src.__freq = alignedFreq;
    src.__basePlaybackRate = src.playbackRate.value;
    const gain = ctx.createGain();
    src.connect(gain);
    gain.connect(destination || ctx.destination);
    const env = parseEnvelope(inst && inst.env);
    const g = gain.gain;
    if (env && env.mode === 'gb') {
        const initialVol = (env.initial ?? 15) / 15;
        const stepPeriod = (env.period ?? 1) * (65536 / GB_CLOCK);
        if (env.period && env.period > 0) {
            const maxSteps = Math.max(1, Math.floor(dur / stepPeriod));
            const vals = [];
            let cur = env.initial ?? 15;
            vals.push((cur / 15) * 0.9);
            for (let s = 1; s <= maxSteps; s++) {
                if (env.direction === 'up')
                    cur = Math.min(15, cur + 1);
                else
                    cur = Math.max(0, cur - 1);
                vals.push((cur / 15) * 0.9);
                if (cur === 0 || cur === 15)
                    break;
            }
            const curve = new Float32Array(vals);
            const curveDuration = (vals.length - 1) * stepPeriod;
            if (scheduler && typeof scheduler.scheduleAligned === 'function' && typeof g.setValueCurveAtTime === 'function') {
                scheduler.scheduleAligned(start, () => {
                    try {
                        g.setValueCurveAtTime(curve, start, curveDuration);
                    }
                    catch (e) {
                        try {
                            g.setValueAtTime(vals[0], start);
                        }
                        catch (_) { }
                    }
                });
                scheduler.scheduleAligned(start + dur, () => { try {
                    g.setValueAtTime(g.value, start + dur);
                    g.linearRampToValueAtTime(0.0001, start + dur + 0.005);
                }
                catch (e) { } });
            }
            else if (scheduler && typeof scheduler.schedule === 'function' && typeof g.setValueCurveAtTime === 'function') {
                scheduler.schedule(start, () => {
                    try {
                        g.setValueCurveAtTime(curve, start, curveDuration);
                    }
                    catch (e) {
                        try {
                            g.setValueAtTime(vals[0], start);
                        }
                        catch (_) { }
                    }
                });
                scheduler.schedule(start + dur, () => { try {
                    g.setValueAtTime(g.value, start + dur);
                    g.linearRampToValueAtTime(0.0001, start + dur + 0.005);
                }
                catch (e) { } });
            }
            else {
                try {
                    if (typeof g.setValueCurveAtTime === 'function') {
                        g.setValueCurveAtTime(curve, start, curveDuration);
                        g.setValueAtTime(g.value, start + dur);
                        g.linearRampToValueAtTime(0.0001, start + dur + 0.005);
                    }
                    else {
                        g.setValueAtTime(vals[0], start);
                        let t = start + stepPeriod;
                        for (let vi = 1; vi < vals.length; vi++) {
                            g.setValueAtTime(vals[vi], t);
                            t += stepPeriod;
                        }
                        g.setValueAtTime(g.value, start + dur);
                        g.linearRampToValueAtTime(0.0001, start + dur + 0.005);
                    }
                }
                catch (e) {
                    g.setValueAtTime(vals[0], start);
                    g.setValueAtTime(g.value, start + dur);
                    g.linearRampToValueAtTime(0.0001, start + dur + 0.005);
                }
            }
        }
        else {
            g.setValueAtTime(0.6, start);
            g.setTargetAtTime(0.0001, start + dur - 0.02, 0.02);
        }
    }
    else {
        g.setValueAtTime(0.6, start);
        g.setTargetAtTime(0.0001, start + dur - 0.02, 0.02);
    }
    try {
        src.start(start);
    }
    catch (e) {
        try {
            src.start();
        }
        catch (_) { }
    }
    try {
        src.stop(start + dur + 0.02);
    }
    catch (e) { }
    return [src, gain];
}
/** Tile a short array up to targetLen by repeating it, preserving waveform shape. */
function padToLength(samples, targetLen) {
    if (samples.length >= targetLen)
        return samples;
    const out = [];
    for (let i = 0; i < targetLen; i++)
        out.push(samples[i % samples.length]);
    return out;
}
export function parseWaveTable(raw) {
    // GB wave RAM is 32 × 4-bit samples; all defaults and short tables tile up to 32.
    const GB_WAVE_LEN = 32;
    if (!raw)
        return new Array(GB_WAVE_LEN).fill(0);
    if (Array.isArray(raw)) {
        const mapped = raw.map(n => Number(n) || 0);
        if (mapped.length === 0)
            return new Array(GB_WAVE_LEN).fill(0);
        return padToLength(mapped, GB_WAVE_LEN);
    }
    try {
        const s = String(raw).replace(/^["']|["']$/g, '').trim(); // strip optional surrounding quotes
        // hUGETracker hex format: 32 hex nibbles, e.g. "0478ABBB986202467776420146777631"
        if (/^[0-9A-Fa-f]{32}$/.test(s)) {
            return s.split('').map(c => parseInt(c, 16));
        }
        const arr = JSON.parse(s);
        if (Array.isArray(arr) && arr.length > 0)
            return padToLength(arr.map(n => Number(n) || 0), GB_WAVE_LEN);
    }
    catch (_) { }
    return new Array(GB_WAVE_LEN).fill(0);
}
export default { playWavetable, parseWaveTable };
//# sourceMappingURL=wave.js.map