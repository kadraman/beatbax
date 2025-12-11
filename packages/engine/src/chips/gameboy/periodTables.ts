export const GB_CLOCK = 4194304; // 4.194304 MHz

export function freqFromRegister(reg: number): number {
  const r = Math.max(0, Math.min(2047, Math.floor(reg)));
  const denom = 2048 - r;
  if (denom <= 0) return Infinity;
  return 131072 / denom;
}

export function registerFromFreq(freq: number): number {
  if (!isFinite(freq) || freq <= 0) return 0;
  const val = Math.round(2048 - (131072 / freq));
  return Math.max(0, Math.min(2047, val));
}

export default { GB_CLOCK, freqFromRegister, registerFromFreq };
