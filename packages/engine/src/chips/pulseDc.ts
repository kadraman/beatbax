/**
 * Web Audio PeriodicWave ignores the DC (index-0) Fourier coefficient.
 * Built-in pulse PCM is bipolar ±1 with mean `2d − 1` for duty fraction `d`.
 * Sum a ConstantSourceNode at that offset into the same GainNode as the
 * oscillator so Desktop/web matches CLI PCM levels (#271).
 *
 * AC coefficients are the real Fourier series of a ±1 pulse on [0, 1):
 *   a_n = (2/(nπ)) sin(2π n d),  b_n = (2/(nπ)) (1 − cos(2π n d))
 * The older imag-only `(2/(nπ)) sin(nπ d)` series peaks near ±2.1 at 50% duty
 * and must not be used with `disableNormalization`.
 */

/** Clamp duty fraction to [0, 1]; default 0.5 when non-finite. */
export function clampPulseDuty(duty: number): number {
  let d = Number(duty);
  if (!Number.isFinite(d)) d = 0.5;
  return Math.max(0, Math.min(1, d));
}

/** Mean of a ±1 pulse with high-time fraction `duty` in [0, 1]. */
export function bipolarPulseDcOffset(duty: number): number {
  return 2 * clampPulseDuty(duty) - 1;
}

/**
 * Fill PeriodicWave real/imag arrays with AC terms for a bipolar ±1 pulse.
 * Leaves index 0 at 0 (PeriodicWave ignores DC; use {@link attachBipolarPulseDc}).
 */
export function fillBipolarPulseFourierCoeffs(
  real: Float32Array,
  imag: Float32Array,
  duty: number,
  maxHarmonic = 200,
): void {
  const d = clampPulseDuty(duty);
  const nMax = Math.min(maxHarmonic, real.length - 1, imag.length - 1);
  real[0] = 0;
  imag[0] = 0;
  for (let n = 1; n <= nMax; n++) {
    const scale = 2 / (n * Math.PI);
    const twoPiNd = 2 * Math.PI * n * d;
    real[n] = scale * Math.sin(twoPiNd);
    imag[n] = scale * (1 - Math.cos(twoPiNd));
  }
  for (let n = nMax + 1; n < real.length; n++) {
    real[n] = 0;
    imag[n] = 0;
  }
}

/** Create a normalize-disabled PeriodicWave for a bipolar ±1 pulse duty. */
export function createBipolarPulsePeriodicWave(
  ctx: BaseAudioContext,
  duty: number,
  options?: { size?: number; maxHarmonic?: number },
): PeriodicWave {
  const size = options?.size ?? 4096;
  const real = new Float32Array(size);
  const imag = new Float32Array(size);
  fillBipolarPulseFourierCoeffs(real, imag, duty, options?.maxHarmonic ?? 200);
  return (ctx as any).createPeriodicWave(real, imag, { disableNormalization: true });
}

/**
 * Reconstruct one period of bipolar pulse (AC Fourier + DC) for parity tests.
 * Uses the same a_n/b_n as {@link fillBipolarPulseFourierCoeffs}.
 */
export function synthesizeBipolarPulseWave(
  duty: number,
  sampleCount: number,
  maxHarmonic = 200,
): Float32Array {
  const d = clampPulseDuty(duty);
  const dc = bipolarPulseDcOffset(d);
  const out = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleCount;
    let x = dc;
    for (let n = 1; n <= maxHarmonic; n++) {
      const scale = 2 / (n * Math.PI);
      const twoPiNd = 2 * Math.PI * n * d;
      const real = scale * Math.sin(twoPiNd);
      const imag = scale * (1 - Math.cos(twoPiNd));
      const theta = 2 * Math.PI * n * t;
      x += real * Math.cos(theta) + imag * Math.sin(theta);
    }
    out[i] = x;
  }
  return out;
}

/**
 * Connect a ConstantSourceNode into `gainNode` with the bipolar pulse DC for
 * `duty`. Returns the source so callers can retarget offset when duty changes,
 * or null when ConstantSourceNode is unavailable (tests / exotic contexts).
 */
export function attachBipolarPulseDc(
  ctx: BaseAudioContext,
  gainNode: AudioNode,
  duty: number,
  start: number,
  stopAt: number,
): { offset: { setValueAtTime: (value: number, time: number) => void }; start: (when?: number) => void; stop: (when?: number) => void; connect: (dest: AudioNode) => void } | null {
  const create = (ctx as any).createConstantSource;
  if (typeof create !== 'function') return null;
  const dc = create.call(ctx);
  try {
    dc.offset.setValueAtTime(bipolarPulseDcOffset(duty), start);
  } catch {
    try { dc.offset.value = bipolarPulseDcOffset(duty); } catch { /* ignore */ }
  }
  try { dc.connect(gainNode); } catch { /* ignore */ }
  try { dc.start(start); } catch {
    try { dc.start(); } catch { /* ignore */ }
  }
  try { dc.stop(stopAt); } catch { /* ignore */ }
  return dc;
}

/** Update an existing pulse DC source when duty changes mid-voice (portamento). */
export function setBipolarPulseDcOffset(dc: { offset: { setValueAtTime: (value: number, time: number) => void } } | null | undefined, duty: number, atTime: number): void {
  if (!dc?.offset?.setValueAtTime) return;
  try {
    dc.offset.setValueAtTime(bipolarPulseDcOffset(duty), atTime);
  } catch { /* ignore */ }
}
