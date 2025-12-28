export const GB_CLOCK = 4194304; // 4.194304 MHz

/**
 * Standard Game Boy period table used by hUGETracker.
 * Covers 72 notes (6 octaves), starting from C2 (MIDI 36).
 * Index 0 = C2, Index 12 = C3, etc.
 */
export const GB_PERIOD_TABLE = [
  44, 156, 262, 363, 457, 547, 631, 711, 786, 856, 923, 986,
  1046, 1102, 1155, 1205, 1253, 1297, 1339, 1379, 1417, 1452, 1486, 1517,
  1547, 1575, 1601, 1627, 1650, 1673, 1694, 1714, 1732, 1750, 1767, 1783,
  1797, 1811, 1825, 1837, 1849, 1860, 1871, 1881, 1890, 1899, 1907, 1915,
  1923, 1930, 1936, 1943, 1949, 1954, 1959, 1964, 1969, 1973, 1977, 1981,
  1985, 1989, 1992, 1995, 1998, 2001, 2004, 2006, 2008, 2011, 2013, 2015
];

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
