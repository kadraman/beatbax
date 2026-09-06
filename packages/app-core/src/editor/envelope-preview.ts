/**
 * Shared hardware envelope / sweep preview helpers for Monaco hovers
 * and the Desktop Instrument Editor.
 */

export type EnvelopeDirection = 'up' | 'down' | 'flat';
export type SweepDirection = 'up' | 'down';

export interface HardwareEnvelopeParams {
  /** Initial volume level 0–15. */
  level: number;
  direction: EnvelopeDirection;
  /** Envelope period. 0 = constant. GB clamps 0–7; NES sibling period may be 0–15. */
  period: number;
}

export interface HardwareSweepParams {
  time: number;
  direction: SweepDirection;
  shift: number;
}

/** Parse a hardware `env=` value into structured params (null if not GB-style). */
export function parseHardwareEnvelope(value: unknown): HardwareEnvelopeParams | null {
  if (value == null || value === '') return null;

  if (typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const initialRaw = obj.initial ?? obj.level ?? obj.value;
    const level = Math.max(0, Math.min(15, Number.isFinite(Number(initialRaw)) ? Number(initialRaw) : 15));
    const dirStr = String(obj.direction ?? obj.dir ?? 'down').toLowerCase();
    const direction: EnvelopeDirection =
      dirStr === 'up' ? 'up' : dirStr === 'flat' ? 'flat' : 'down';
    // Omitted period defaults to 1 (matches GB pulse.parseEnvelope / playback).
    const periodRaw = obj.period ?? obj.step ?? 1;
    const period = direction === 'flat'
      ? 0
      : Math.max(0, Math.min(15, Number.isFinite(Number(periodRaw)) ? Number(periodRaw) : 1));
    return { level, direction, period };
  }

  let s = String(value).trim();
  if (s.startsWith('gb:')) s = s.slice(3).trim();
  if (s.startsWith('{')) {
    try {
      return parseHardwareEnvelope(JSON.parse(s));
    } catch {
      return null;
    }
  }

  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  if (!/^\d{1,2}$/.test(parts[0]) || !/^(up|down|flat)$/i.test(parts[1])) return null;

  const level = Math.max(0, Math.min(15, parseInt(parts[0], 10)));
  if (Number.isNaN(level)) return null;
  const dirStr = parts[1].toLowerCase();
  const direction: EnvelopeDirection =
    dirStr === 'up' ? 'up' : dirStr === 'flat' ? 'flat' : 'down';
  const periodRaw = parts[2];
  // Two-part CSV (`12,down`) means period 1 — same as serialize omitting period===1.
  const period = direction === 'flat'
    ? 0
    : Math.max(0, Math.min(15, Number.isFinite(Number(periodRaw)) ? Number(periodRaw) : 1));
  return { level, direction, period };
}

/** Format hardware envelope params to BeatBax CSV (`12,down` or `12,down,1`). */
export function formatHardwareEnvelope(params: HardwareEnvelopeParams): string {
  const level = Math.max(0, Math.min(15, Math.round(params.level)));
  const direction = params.direction;
  if (direction === 'flat') return `${level},flat`;
  const period = Math.max(0, Math.min(15, Math.round(params.period)));
  // Omit period when it is the common default of 1 (matches serialize.ts).
  if (period === 1) return `${level},${direction}`;
  if (period === 0) return `${level},${direction},0`;
  return `${level},${direction},${period}`;
}

/** Parse a hardware `sweep=` CSV / object. */
export function parseHardwareSweep(value: unknown): HardwareSweepParams | null {
  if (value == null || value === '') return null;

  if (typeof value === 'object' && !Array.isArray(value)) {
    const s = value as Record<string, unknown>;
    if (s.time === undefined || s.direction === undefined || s.shift === undefined) return null;
    const time = Math.max(0, Math.min(7, Number.isFinite(Number(s.time)) ? Number(s.time) : 0));
    const dirStr = String(s.direction).toLowerCase();
    const direction: SweepDirection =
      dirStr === 'down' || dirStr === 'dec' || dirStr === '1' ? 'down' : 'up';
    const shift = Math.max(0, Math.min(7, Number.isFinite(Number(s.shift)) ? Number(s.shift) : 0));
    return { time, direction, shift };
  }

  const parts = String(value).split(',').map((p) => p.trim());
  if (parts.length < 3) return null;
  const timeRaw = parseInt(parts[0], 10);
  const time = Math.max(0, Math.min(7, Number.isNaN(timeRaw) ? 0 : timeRaw));
  const dirStr = parts[1].toLowerCase();
  const direction: SweepDirection =
    dirStr === 'down' || dirStr === 'dec' || dirStr === '1' ? 'down' : 'up';
  const shiftRaw = parseInt(parts[2], 10);
  const shift = Math.max(0, Math.min(7, Number.isNaN(shiftRaw) ? 0 : shiftRaw));
  return { time, direction, shift };
}

export function formatHardwareSweep(params: HardwareSweepParams): string {
  const time = Math.max(0, Math.min(7, Math.round(params.time)));
  const shift = Math.max(0, Math.min(7, Math.round(params.shift)));
  return `${time},${params.direction},${shift}`;
}

/**
 * Simulate a Game Boy NR5x-style hardware envelope.
 * One array entry per envelope tick (~1/64 s on GB).
 */
export function simulateGBEnvelope(
  env: Pick<HardwareEnvelopeParams, 'level' | 'direction' | 'period'>,
  steps = 20,
): number[] {
  const result: number[] = [];
  let vol = env.level;

  for (let t = 0; t < steps; t++) {
    result.push(vol);

    if (env.period === 0 || env.direction === 'flat') continue;

    if ((t + 1) % env.period === 0) {
      if (env.direction === 'up') {
        vol = Math.min(15, vol + 1);
      } else {
        vol = Math.max(0, vol - 1);
      }
    }
  }

  return result;
}

/**
 * Approximate hardware pitch-sweep trajectory as relative period ratios.
 * Starts at 1.0; each step applies `± period/2^shift` (GB-style).
 * Returns null ratios (channel silenced) when period overflows above 2047
 * in a notional start period of 1024.
 */
export function simulateHardwareSweep(
  sweep: HardwareSweepParams,
  steps = 16,
  startPeriod = 1024,
): number[] {
  const result: number[] = [];
  if (sweep.time === 0) {
    for (let i = 0; i < steps; i++) result.push(1);
    return result;
  }

  let period = startPeriod;
  for (let t = 0; t < steps; t++) {
    result.push(period / startPeriod);
    // Change every `time` steps (simplified vs exact GB clock).
    if ((t + 1) % Math.max(1, sweep.time) !== 0) continue;
    if (sweep.shift === 0) continue;
    const delta = Math.floor(period / (1 << sweep.shift));
    if (sweep.direction === 'up') {
      period = period + delta;
    } else {
      period = Math.max(0, period - delta);
    }
    if (period > 2047) {
      // Remaining steps: silenced
      for (let j = t + 1; j < steps; j++) result.push(0);
      break;
    }
  }
  return result;
}

/** Render a horizontal level sparkline for an envelope volume curve (0–15). */
export function renderEnvelopeSparkline(levels: number[]): string {
  const chars = ' ▁▂▃▄▅▆▇█';
  return levels
    .map((v) => {
      const idx = Math.round((Math.max(0, Math.min(15, v)) / 15) * 8);
      return chars[idx] ?? chars[0];
    })
    .join('');
}
