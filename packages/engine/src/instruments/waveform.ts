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

/**
 * Normalize instrument-editor waveform data to a plugin schema length and range.
 * Accepts arrays, JSON array strings, or exact-length hex nibble strings.
 * Pads short tables with `min` and truncates long ones (does not tile to 32).
 */
export function normalizeWaveSamples(
  raw: unknown,
  length: number,
  min: number,
  max: number,
): number[] {
  const len = Math.max(0, Math.floor(Number(length) || 0));
  const lo = Number.isFinite(min) ? min : 0;
  const hi = Number.isFinite(max) ? max : lo;
  const clamp = (n: unknown): number => {
    const v = Number(n);
    const base = Number.isFinite(v) ? Math.round(v) : lo;
    return Math.max(lo, Math.min(hi, base));
  };
  const empty = (): number[] => new Array(len).fill(lo);

  if (len === 0) return [];
  if (raw == null || raw === '') return empty();

  let mapped: number[] | null = null;
  if (Array.isArray(raw)) {
    mapped = raw.map(clamp);
  } else {
    try {
      const s = String(raw).replace(/^["']|["']$/g, '').trim();
      if (s.length === len && /^[0-9A-Fa-f]+$/.test(s)) {
        mapped = [...s].map((c) => clamp(parseInt(c, 16)));
      } else {
        const arr = JSON.parse(s);
        if (Array.isArray(arr)) mapped = arr.map(clamp);
      }
    } catch {
      mapped = null;
    }
  }

  if (!mapped || mapped.length === 0) return empty();
  if (mapped.length === len) return mapped;
  if (mapped.length > len) return mapped.slice(0, len);
  return mapped.concat(new Array(len - mapped.length).fill(lo));
}
