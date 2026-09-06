import type { ChipWaveformShape } from '../chips/types.js';

/** Fill a wavetable from a named shape (values clamped to min–max). */
export function generateWaveformPreset(
  kind: ChipWaveformShape,
  length: number,
  min: number,
  max: number,
): number[] {
  const out: number[] = [];
  const mid = (min + max) / 2;
  const amp = (max - min) / 2;
  for (let i = 0; i < length; i++) {
    const t = i / length;
    let v: number;
    switch (kind) {
      case 'sine':
        v = Math.sin(t * Math.PI * 2);
        break;
      case 'square':
        v = t < 0.5 ? 1 : -1;
        break;
      case 'saw':
        v = 2 * t - 1;
        break;
      case 'triangle':
        v = 1 - 4 * Math.abs(t - 0.5);
        break;
      default:
        v = 0;
    }
    out.push(Math.max(min, Math.min(max, Math.round(mid + v * amp))));
  }
  return out;
}

export function samplesToHex(samples: number[]): string {
  return samples.map((n) => Math.max(0, Math.min(15, n | 0)).toString(16).toUpperCase()).join('');
}

/**
 * Parse a typed/pasted wavetable hex string for the Instrument Editor.
 * Accepts 0–`length` hex nibbles (non-hex characters stripped); pads with `0`
 * and truncates to `length`. Empty input yields a silent table.
 */
export function parseWaveHexInput(raw: string, length = 32): { samples: number[]; hex: string } {
  const nibbles = String(raw ?? '').replace(/[^0-9A-Fa-f]/g, '').slice(0, length);
  const padded = nibbles.toUpperCase().padEnd(length, '0');
  const samples = padded.split('').map((c) => parseInt(c, 16));
  return { samples, hex: padded };
}
