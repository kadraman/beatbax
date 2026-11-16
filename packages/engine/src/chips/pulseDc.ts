/**
 * Web Audio PeriodicWave ignores the DC (index-0) Fourier coefficient.
 * Built-in pulse PCM is bipolar ±1 with mean `2d − 1` for duty fraction `d`.
 * Sum a ConstantSourceNode at that offset into the same GainNode as the
 * oscillator so Desktop/web matches CLI PCM levels (#271).
 */

/** Mean of a ±1 pulse with high-time fraction `duty` in [0, 1]. */
export function bipolarPulseDcOffset(duty: number): number {
  let d = Number(duty);
  if (!Number.isFinite(d)) d = 0.5;
  d = Math.max(0, Math.min(1, d));
  return 2 * d - 1;
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
