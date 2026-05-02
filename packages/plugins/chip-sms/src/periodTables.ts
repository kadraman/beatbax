/**
 * SN76489 PSG period tables for Sega Master System / Game Gear.
 *
 * The SN76489 has:
 * - 3 tone channels (square wave, 50% duty, 10-bit period registers)
 * - 1 noise channel (LFSR with 2 modes: white/periodic)
 *
 * Tone period formula: f = clock / (32 * period)
 * where period is a 10-bit value (0-1023)
 *
 * Clock rates:
 * - SMS (NTSC): 3,579,545 Hz
 * - SMS (PAL):  3,546,895 Hz
 * - Game Gear:  3,579,545 Hz (same as NTSC SMS, but with stereo)
 */

// --- Note to MIDI conversion ----------------------------------------------------

const NOTE_BASE: Record<string, number> = {
  C: 0,
  'C#': 1,
  DB: 1,
  D: 2,
  'D#': 3,
  EB: 3,
  E: 4,
  F: 5,
  'F#': 6,
  GB: 6,
  G: 7,
  'G#': 8,
  AB: 8,
  A: 9,
  'A#': 10,
  BB: 10,
  B: 11,
};

function normalizeNoteName(name: string): { letter: string; accidental: string | null; octave: number } | null {
  const m = name.match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const accidental = m[2] || null;
  const octave = parseInt(m[3], 10);
  return { letter, accidental, octave };
}

function noteToMidi(note: string): number | null {
  const p = normalizeNoteName(note);
  if (!p) return null;
  const key = p.letter + (p.accidental ? (p.accidental === 'b' ? 'B' : '#') : '');
  const semitone = NOTE_BASE[key as keyof typeof NOTE_BASE];
  if (semitone === undefined) return null;
  // MIDI: C4 = 60. So calculate from octave.
  // octave numbers follow scientific pitch: C4=60
  return (p.octave + 1) * 12 + semitone; // because octave -1 would be MIDI starting at C-1 = 0
}

// --- Clock constants ------------------------------------------------------------

export const SMS_CLOCK_NTSC = 3579545;
export const SMS_CLOCK_PAL = 3546895;
export const GG_CLOCK = 3579545; // Game Gear uses same clock as NTSC SMS

export type SmsClockRegion = 'ntsc' | 'pal';

let _smsClockRegion: SmsClockRegion = 'ntsc';
// Mutable live binding used by tone/noise backends.
export let SMS_CLOCK = SMS_CLOCK_NTSC;

export function setSmsClockRegion(region?: string | null): SmsClockRegion {
  const nextRegion: SmsClockRegion = String(region || '').toLowerCase() === 'pal' ? 'pal' : 'ntsc';
  _smsClockRegion = nextRegion;
  SMS_CLOCK = nextRegion === 'pal' ? SMS_CLOCK_PAL : SMS_CLOCK_NTSC;
  return _smsClockRegion;
}

export function getSmsClockRegion(): SmsClockRegion {
  return _smsClockRegion;
}

// --- Tone period calculation -----------------------------------------------------

/**
 * Calculate the 10-bit period register value from a frequency.
 * Formula: period = clock / (32 * frequency)
 * Clamped to valid range: 0-1023
 *
 * Note: Period 0 produces the highest pitch (but is effectively silence on real hardware).
 */
export function freqToPeriod(frequency: number): number {
  if (frequency <= 0) return 0;
  // period = clock / (32 * freq)
  const period = SMS_CLOCK / (32 * frequency);
  // Clamp to 10-bit range (0-1023)
  return Math.max(0, Math.min(1023, Math.round(period)));
}

/**
 * Calculate frequency from a 10-bit period register value.
 * Formula: frequency = clock / (32 * period)
 * Returns 0 if period is 0.
 */
export function periodToFreq(period: number): number {
  if (period <= 0) return 0;
  return SMS_CLOCK / (32 * period);
}

/**
 * Calculate frequency from a MIDI note number.
 * Uses equal temperament: f = 440 * 2^((n-69)/12)
 */
export function midiToFreq(midiNote: number): number {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

/**
 * Calculate period from a MIDI note number.
 */
export function midiToPeriod(midiNote: number): number {
  return freqToPeriod(midiToFreq(midiNote));
}

/**
 * Calculate period from a note name (e.g., 'C4', 'F#3').
 */
export function noteNameToPeriod(noteName: string): number {
  const midiNote = noteToMidi(noteName);
  if (midiNote === null || midiNote === undefined) return 0;
  return midiToPeriod(midiNote);
}

// --- Noise period table ----------------------------------------------------------

/**
 * SN76489 noise clock divider values.
 * The noise generator uses a 4-bit divisor to clock the LFSR.
 * Values 0-2 map to fixed dividers; value 3 means "use Tone 3's period".
 *
 * The actual divider values (from SN76489 documentation):
 * - rate 0: divide by 128  (noise clock = chip clock / 256)
 * - rate 1: divide by 256  (noise clock = chip clock / 512)
 * - rate 2: divide by 512  (noise clock = chip clock / 1024)
 * - rate 3: use Tone 3's period value
 */
export const NOISE_RATE_DIVIDERS = [128, 256, 512] as const;

/**
 * Noise rate index type.
 */
export type NoiseRate = 0 | 1 | 2 | 3; // 3 = tone3-derived

/**
 * Resolve noise rate index to actual divider value.
 * @param rate - Noise rate (0, 1, 2, or "tone3")
 * @param tone3Period - Current period of Tone 3 channel (for rate=3)
 */
export function resolveNoiseRateDivisor(rate: number | string, tone3Period: number = 0): number {
  if (rate === 'tone3' || rate === 3) {
    return tone3Period;
  }
  const idx = Math.max(0, Math.min(2, Number(rate)));
  return NOISE_RATE_DIVIDERS[idx];
}

// --- Pre-computed period table for common MIDI notes ---------------------------

/**
 * Period values for all 128 MIDI notes (C-1 to G9) at NTSC SMS clock rate.
 * Useful for quick lookup without repeated calculations.
 */
export const PERIOD_TABLE: number[] = (() => {
  const table: number[] = new Array(128);
  for (let midiNote = 0; midiNote < 128; midiNote++) {
    table[midiNote] = midiToPeriod(midiNote);
  }
  return table;
})();

// --- Volume/attenuation ---------------------------------------------------------

/**
 * SN76489 volume attenuation table.
 * The chip uses 4-bit attenuation: 0 = loudest, 15 = silent.
 * Volume is stored as attenuation value (0-15).
 */
export const VOLUME_ATTENUATION_MAX = 15; // 0 = max, 15 = mute

/**
 * Convert attenuation value (0-15) to linear gain (0.0-1.0).
 * Attenuation 0 = full volume (gain 1.0)
 * Attenuation 15 = silent (gain 0.0)
 */
export function attenuationToGain(attenuation: number): number {
  // Linear mapping: att=0 -> 1.0, att=15 -> 0.0
  attenuation = Math.max(0, Math.min(VOLUME_ATTENUATION_MAX, Math.round(attenuation)));
  return 1.0 - (attenuation / VOLUME_ATTENUATION_MAX);
}

// --- Game Gear stereo ------------------------------------------------------------

/**
 * Game Gear stereo pan values.
 * Each channel can be routed to Left, Center (both), or Right.
 * The SN76489 has a stereo register (0x4F) that controls this.
 */
export type GGPan = 'L' | 'C' | 'R';

/**
 * Convert gg:pan string to stereo register bitmask.
 * The stereo register is 8 bits: TTNN CCCC
 * - TT = Tone 3 (bits 6-7)
 * - NN = Noise (bits 4-5)
 * - CCCC = Tone 1/2 (bits 0-3)
 * Each channel pair uses 2 bits: bit 0 = left enable, bit 1 = right enable
 * So: L=10 (right only), C=11 (both), R=01 (left only), 00=silent
 */
export const GGPAN_TO_BITS: Record<GGPan, number> = {
  L: 0b01, // Left only
  C: 0b11, // Center (both)
  R: 0b10, // Right only
} as const;

/**
 * Build the Game Gear stereo register byte from individual channel pans.
 * @param pans - Array of pan values for channels 0-3 (Tone1, Tone2, Tone3, Noise)
 */
export function buildGGStereoByte(pans: GGPan[]): number {
  // Bits: 7 6 | 5 4 | 3 2 | 1 0
  //       T3  | N  | T2  | T1
  // Each pair: bit0=left, bit1=right
  let byte = 0;

  // Channel 0 = Tone1 -> bits 0-1
  if (pans[0]) {
    const bits = GGPAN_TO_BITS[pans[0]];
    byte |= (bits & 0b11) << 0;
  }

  // Channel 1 = Tone2 -> bits 2-3
  if (pans[1]) {
    const bits = GGPAN_TO_BITS[pans[1]];
    byte |= (bits & 0b11) << 2;
  }

  // Channel 2 = Tone3 -> bits 4-5
  if (pans[2]) {
    const bits = GGPAN_TO_BITS[pans[2]];
    byte |= (bits & 0b11) << 4;
  }

  // Channel 3 = Noise -> bits 6-7
  if (pans[3]) {
    const bits = GGPAN_TO_BITS[pans[3]];
    byte |= (bits & 0b11) << 6;
  }

  return byte;
}
