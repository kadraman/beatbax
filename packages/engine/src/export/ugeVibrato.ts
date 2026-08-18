/**
 * Lower BeatBax `vib` into hUGETracker pitch slides.
 *
 * hUGE `4xy` is a one-sided square trill (AND the speed nibble with a global
 * counter, then add depth to the period). That is not BeatBax's sine/triangle
 * LFO. hUGE authors get a real wobble from repeating `1xx` / `2xx` at tick
 * rate — usually in an instrument subpattern.
 *
 * This module plans that motion: a looping (or duration-capped) tick program
 * for a cloned instrument, plus a coarser per-row fallback when a clone is
 * not possible.
 */

import type { TickProgram, TickRow } from '../chips/gameboy/instrumentProgram.js';
import { MAX_UGE_SUBPATTERN_ROWS } from '../chips/gameboy/instrumentProgram.js';

export const HUGE_FX_PORTA_UP = 1;
export const HUGE_FX_PORTA_DOWN = 2;
/** Legacy 4xy vibrato — still recognised so leftover cells can be cleared. */
export const HUGE_FX_VIBRATO = 4;

/** hUGE ticks/row from BeatBax BPM (same formula as the UGE tempo field). */
export function ugeTicksPerRow(bpm: number): number {
  const b = Number.isFinite(bpm) && bpm > 0 ? bpm : 128;
  return Math.max(1, Math.round(896 / b));
}

export type VibratoShape = 'triangle' | 'sawup' | 'sawdown' | 'square';

export interface VibratoSpec {
  /** Peak period-register offset (0–15). */
  depth: number;
  /** LFO rate in Hz (BeatBax `vib` 2nd param). */
  rateHz: number;
  shape: VibratoShape;
  /** Pattern rows of active vibrato. Omitted = hold for the whole note (loop). */
  durationRows?: number;
  /** Pattern rows to wait before the LFO starts. */
  delayRows: number;
}

export interface PatternVibCell {
  code: typeof HUGE_FX_PORTA_UP | typeof HUGE_FX_PORTA_DOWN;
  param: number;
}

export function isVibratoSlideEffect(code: number): boolean {
  return code === HUGE_FX_PORTA_UP || code === HUGE_FX_PORTA_DOWN || code === HUGE_FX_VIBRATO;
}

export function classifyVibratoShape(waveform: string | number | undefined): VibratoShape {
  if (typeof waveform === 'number' && Number.isFinite(waveform)) {
    const n = Math.round(waveform);
    if (n === 1) return 'square';
    if (n === 3) return 'sawup';
    if (n === 4) return 'sawdown';
    return 'triangle';
  }
  const name = String(waveform ?? 'sine').toLowerCase().trim();
  if (name === 'square' || name === 'sqr' || name === 'pulse') return 'square';
  if (name === 'saw' || name === 'sawup' || name === 'sawtooth') return 'sawup';
  if (name === 'sawdown' || name === 'ramp') return 'sawdown';
  return 'triangle';
}

export function parseVibratoSpec(fx: any): VibratoSpec | null {
  if (!fx) return null;
  const name = String(fx.type || fx).toLowerCase();
  if (name !== 'vib') return null;

  const params = Array.isArray(fx.params) ? fx.params : [];
  const depthRaw = params.length > 0 ? Number(params[0]) : 0;
  if (!Number.isFinite(depthRaw) || depthRaw <= 0) return null;

  const rateRaw = params.length > 1 ? Number(params[1]) : 4;
  const rateHz = Number.isFinite(rateRaw) && rateRaw > 0 ? Math.max(0.25, rateRaw) : 4;

  let durationRows: number | undefined;
  if (params.length > 3 && Number.isFinite(Number(params[3]))) {
    const d = Math.round(Number(params[3]));
    if (d > 0) durationRows = d;
  } else if (typeof fx.paramsStr === 'string') {
    const parts = fx.paramsStr.split(',').map((s: string) => s.trim());
    if (parts.length > 3) {
      const d = Number(parts[3]);
      if (Number.isFinite(d) && d > 0) durationRows = Math.round(d);
    }
  }

  let delayRows = 0;
  if (params.length > 4 && Number.isFinite(Number(params[4]))) {
    delayRows = Math.max(0, Math.round(Number(params[4])));
  } else if (Number.isFinite(fx.delaySec) && fx.delaySec > 0) {
    // Resolver stores delayRows in params[4] when present; delaySec is the fallback.
    delayRows = 0;
  }

  return {
    depth: Math.max(1, Math.min(15, Math.round(depthRaw))),
    rateHz,
    shape: classifyVibratoShape(params[2]),
    durationRows,
    delayRows,
  };
}

export function vibratoSpecKey(spec: VibratoSpec): string {
  const dur = spec.durationRows === undefined ? 'loop' : String(spec.durationRows);
  return `d${spec.depth}_r${spec.rateHz}_${spec.shape}_${dur}_w${spec.delayRows}`;
}

export function vibratoCloneLookupKey(baseName: string, spec: VibratoSpec): string {
  return `${baseName}::${vibratoSpecKey(spec)}`;
}

function emptyRow(): TickRow {
  return { offset: null };
}

function portaRow(code: 1 | 2, param: number): TickRow {
  return { offset: null, effect: { code, param: Math.max(1, Math.min(255, param)) } };
}

function repeatRows(row: TickRow, n: number): TickRow[] {
  const out: TickRow[] = [];
  for (let i = 0; i < n; i++) out.push({ ...row, effect: row.effect ? { ...row.effect } : undefined });
  return out;
}

function distribute(total: number, parts: number): number[] {
  const p = Math.max(1, parts);
  const t = Math.max(p, total);
  const base = Math.floor(t / p);
  const rem = t - base * p;
  return Array.from({ length: p }, (_, i) => base + (i < rem ? 1 : 0));
}

/** Target ticks for one LFO cycle at ~60 Hz (hUGE subpattern rate). */
function cycleTicksForRate(rateHz: number): number {
  const ticks = Math.round(60 / Math.max(0.25, rateHz));
  return Math.max(4, Math.min(32, ticks));
}

function buildCycleRows(spec: VibratoSpec, cycleTicks: number): TickRow[] {
  const quarters = distribute(cycleTicks, 4);
  const depth = spec.depth;

  if (spec.shape === 'sawup' || spec.shape === 'sawdown') {
    const upCode: 1 | 2 = spec.shape === 'sawup' ? 1 : 2;
    const downCode: 1 | 2 = spec.shape === 'sawup' ? 2 : 1;
    const returnTicks = Math.max(1, quarters[3]);
    const climbTicks = Math.max(1, cycleTicks - returnTicks);
    const step = Math.max(1, Math.round(depth / climbTicks));
    const climb = step * climbTicks;
    const returnParam = Math.max(1, Math.min(255, Math.round(climb / returnTicks)));
    return [
      ...repeatRows(portaRow(upCode, step), climbTicks),
      ...repeatRows(portaRow(downCode, returnParam), returnTicks),
    ];
  }

  // triangle / square: bipolar 0 → +D → 0 → −D → 0
  const minQ = Math.max(1, Math.min(...quarters));
  const step = Math.max(1, Math.min(15, Math.round(depth / minQ)));
  if (spec.shape === 'square') {
    const upHold = quarters[0] + quarters[1];
    const downHold = quarters[2] + quarters[3];
    const peak = Math.max(1, Math.min(255, step * Math.max(1, quarters[0])));
    return [
      portaRow(1, peak),
      ...repeatRows(emptyRow(), Math.max(0, upHold - 1)),
      portaRow(2, Math.min(255, peak * 2)),
      ...repeatRows(emptyRow(), Math.max(0, downHold - 1)),
    ];
  }

  return [
    ...repeatRows(portaRow(1, step), quarters[0]),
    ...repeatRows(portaRow(2, step), quarters[1]),
    ...repeatRows(portaRow(2, step), quarters[2]),
    ...repeatRows(portaRow(1, step), quarters[3]),
  ];
}

/**
 * Build a UGE instrument subpattern that approximates `vib`.
 * Loops when `durationRows` is omitted; otherwise plays that many pattern
 * rows (converted via `ticksPerRow`) and freezes without silencing the note.
 */
export function buildVibratoTickProgram(spec: VibratoSpec, ticksPerRow: number): TickProgram {
  const tpr = Math.max(1, ticksPerRow);
  let delayTicks = Math.max(0, spec.delayRows) * tpr;
  let cycleTicks = cycleTicksForRate(spec.rateHz);

  if (delayTicks + 4 > MAX_UGE_SUBPATTERN_ROWS) delayTicks = 0;
  if (delayTicks + cycleTicks > MAX_UGE_SUBPATTERN_ROWS) {
    cycleTicks = Math.max(4, MAX_UGE_SUBPATTERN_ROWS - delayTicks);
  }

  const cycle = buildCycleRows(spec, cycleTicks);
  const delay = repeatRows(emptyRow(), delayTicks);
  const loop = spec.durationRows === undefined;

  let motion: TickRow[];
  if (loop) {
    motion = cycle;
  } else {
    const durationTicks = Math.max(1, spec.durationRows! * tpr);
    const budget = Math.max(1, Math.min(MAX_UGE_SUBPATTERN_ROWS - delayTicks, durationTicks));
    motion = [];
    while (motion.length < budget) {
      for (const row of cycle) {
        if (motion.length >= budget) break;
        motion.push({ ...row, effect: row.effect ? { ...row.effect } : undefined });
      }
    }
  }

  const rows = [...delay, ...motion];
  if (rows.length === 0) {
    return { enabled: false, rows: [], errors: [], warnings: [] };
  }

  const last = rows[rows.length - 1];
  if (loop) {
    last.jump = delayTicks + 1; // 1-based first motion row
    last.halt = false;
  } else {
    last.halt = true;
    delete last.jump;
  }

  return { enabled: true, rows, errors: [], warnings: [] };
}

/**
 * Coarse pattern-row 1xx/2xx when an instrument clone is not possible.
 * Alternates up/down each row; param 1 is the smallest slide hUGE allows.
 */
export function planPatternVibratoRows(
  spec: VibratoSpec,
  noteRows: number,
  ticksPerRow: number,
): Array<PatternVibCell | null> {
  const rows = Math.max(0, noteRows);
  const out: Array<PatternVibCell | null> = [];
  const delay = Math.max(0, spec.delayRows);
  const tpr = Math.max(1, ticksPerRow);
  const rowHz = 60 / tpr;
  const rowsPerCycle = Math.max(2, Math.round(rowHz / spec.rateHz));
  const half = Math.max(1, Math.round(rowsPerCycle / 2));
  const param = Math.max(1, Math.min(255, Math.round(spec.depth / Math.max(1, tpr * half)) || 1));

  for (let r = 0; r < rows; r++) {
    if (r < delay) {
      out.push(null);
      continue;
    }
    if (spec.durationRows !== undefined && r >= delay + spec.durationRows) {
      out.push(null);
      continue;
    }
    const k = r - delay;
    const up = Math.floor(k / half) % 2 === 0;
    out.push({ code: up ? HUGE_FX_PORTA_UP : HUGE_FX_PORTA_DOWN, param });
  }
  return out;
}

export function uniqueVibratoCloneName(
  baseName: string,
  spec: VibratoSpec,
  taken: Set<string>,
): string {
  const preferred = `${baseName} vib`;
  if (!taken.has(preferred)) return preferred;
  const keyed = `${baseName} vib ${vibratoSpecKey(spec)}`;
  if (!taken.has(keyed)) return keyed;
  let n = 2;
  while (taken.has(`${keyed} ${n}`)) n += 1;
  return `${keyed} ${n}`;
}

/** True when another note-level effect would take the UGE cell instead of vib. */
export function vibratoLosesToOtherEffects(
  effects: Array<{ type?: string } | string> | undefined,
  hasSeenNote: boolean,
): boolean {
  if (!effects || effects.length === 0) return false;
  for (const fx of effects) {
    const name = String((fx as any)?.type || fx).toLowerCase();
    if (name === 'arp') return true;
    if (name === 'bend') return true;
    if (name === 'port' && hasSeenNote) return true;
  }
  return false;
}
