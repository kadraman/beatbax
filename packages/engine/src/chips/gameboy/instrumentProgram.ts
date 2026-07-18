/**
 * Game Boy instrument tick programs: lower BeatBax macros / native `subpat`
 * into a shared IR used by UGE subpattern export and WebAudio/PCM preview.
 *
 * See docs/features/gameboy-uge-instrument-subpatterns.md
 */

import { parseMacro, type ParsedMacro } from '../../util/music.js';
import {
  applyNoiseWidthToNr43,
  getNotePoly,
  hugeTrackerNoteToIndex,
  nr43ToShiftDivisor,
  resolveNoiseWidth,
  UGE_EMPTY_NOTE,
  type NoiseClockParams,
} from './noiseNote.js';

/** Max UGE instrument subpattern rows. */
export const MAX_UGE_SUBPATTERN_ROWS = 64;

/**
 * hUGETracker UI uses C-6 as +0 offset reference.
 * hugeTrackerNoteToIndex('C-6') === 36.
 */
export const HUGE_SUBPAT_OFFSET_ZERO_NOTE = 36;

/** hUGE effect: Set volume (Cxy). */
export const HUGE_EFFECT_SET_VOLUME = 0x0c;

/** hUGE effect: Change timbre (9xx) — pulse duty / wave / noise width. */
export const HUGE_EFFECT_CHANGE_TIMBRE = 0x09;

/** Approximate hUGE/GB frame tick for preview (seconds). */
export const HUGE_TICK_SEC = 1 / 60;

export interface TickRow {
  /**
   * Semitone offset from the instrument base note.
   * `null` = empty subpattern cell (UGE note 90 — no offset write).
   */
  offset: number | null;
  /** Optional hUGE effect for this tick. */
  effect?: { code: number; param: number };
  /**
   * Optional jump target as 1-based row index (UGE: 0 = empty).
   * Prefer `halt` for self-jump encoding.
   */
  jump?: number;
  /** When true, encode a self-jump so the subpattern does not restart. */
  halt?: boolean;
}

export interface TickProgram {
  enabled: boolean;
  rows: TickRow[];
  errors: string[];
  warnings: string[];
}

/** UGE binary cell shape for one subpattern row. */
export interface UgeSubpatternCell {
  note: number;
  unused: number;
  jump: number;
  effectCode: number;
  effectParam: number;
}

/** Authoring row from native `subpat` declarations. */
export interface SubPatternRow {
  /** True for `.` — empty UGE cell. */
  empty?: boolean;
  /** Semitone offset; omitted/null when empty or effect-only. */
  offset?: number | null;
  vol?: number;
  /** 1-based jump target. */
  jump?: number;
  halt?: boolean;
  /** Raw hUGE effect. */
  fx?: { code: number; param: number };
  /** Timbre param for effect 9xx (0–255). */
  timbre?: number;
}

export interface LowerOptions {
  /** Instrument name for diagnostics. */
  name?: string;
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

function volumeEffectParam(vol: number): number {
  // Cxy: x = envelope nibble (0), y = volume 0–15
  return clampInt(vol, 0, 15) & 0x0f;
}

/** Map duty macro index 0–3 to NR11-style duty bits in effect 9 param. */
export function dutyIndexToTimbreParam(dutyIndex: number): number {
  return (clampInt(dutyIndex, 0, 3) & 0x3) << 6;
}

/** Decode duty index 0–3 from a hUGE `9xx` effect param. */
export function timbreParamToDutyIndex(param: number): number {
  return (clampInt(param, 0, 255) >> 6) & 0x3;
}

/** Duty index 0–3 → pulse width fraction (12.5% / 25% / 50% / 75%). */
export function dutyIndexToFraction(dutyIndex: number): number {
  return [0.125, 0.25, 0.5, 0.75][clampInt(dutyIndex, 0, 3)];
}

/** Duty fraction from a tick row's `9xx` effect, if present. */
export function tickRowDutyFraction(row: TickRow | null | undefined): number | null {
  if (!row?.effect || row.effect.code !== HUGE_EFFECT_CHANGE_TIMBRE) return null;
  return dutyIndexToFraction(timbreParamToDutyIndex(row.effect.param));
}

/** Apply a tick-program semitone offset to a base frequency. `null` = no change. */
export function applyTickOffsetToFreq(
  baseFreq: number,
  offset: number | null | undefined,
): number {
  if (!Number.isFinite(baseFreq) || baseFreq <= 0) return baseFreq;
  if (offset === null || offset === undefined || !Number.isFinite(offset) || offset === 0) {
    return baseFreq;
  }
  return baseFreq * Math.pow(2, offset / 12);
}

/**
 * Encode a signed semitone offset into a UGE subpattern note index.
 * `null` / non-finite → 90 (unused).
 */
export function offsetToUgeNote(offset: number | null | undefined): number {
  if (offset === null || offset === undefined || !Number.isFinite(offset)) return UGE_EMPTY_NOTE;
  return clampInt(HUGE_SUBPAT_OFFSET_ZERO_NOTE + offset, 0, 72);
}

/**
 * Decode a UGE subpattern note index back to a signed offset (C-6 = 0).
 */
export function ugeNoteToOffset(note: number): number | null {
  if (note === UGE_EMPTY_NOTE || !Number.isFinite(note)) return null;
  return note - HUGE_SUBPAT_OFFSET_ZERO_NOTE;
}

function appendSilenceHalt(rows: TickRow[], lastOffset: number | null, label: string, errors: string[]): void {
  const lastVol = tickRowVolume(rows[rows.length - 1]);
  if (lastVol !== null && lastVol === 0) {
    rows[rows.length - 1].halt = true;
    return;
  }
  if (rows.length + 1 > MAX_UGE_SUBPATTERN_ROWS) {
    errors.push(
      `${label}: instrument program needs a silence/halt row but would exceed ${MAX_UGE_SUBPATTERN_ROWS} ticks.`,
    );
    return;
  }
  rows.push({
    offset: lastOffset === null ? 0 : lastOffset,
    effect: { code: HUGE_EFFECT_SET_VOLUME, param: 0 },
    halt: true,
  });
}

/**
 * Lower native `subpat` rows into a tick program.
 */
export function lowerNativeSubPattern(
  rowsIn: SubPatternRow[],
  opts: LowerOptions = {},
): TickProgram {
  const errors: string[] = [];
  const warnings: string[] = [];
  const label = opts.name ? `Instrument '${opts.name}'` : 'Instrument';

  if (!rowsIn || rowsIn.length === 0) {
    return { enabled: false, rows: [], errors, warnings };
  }

  if (rowsIn.length > MAX_UGE_SUBPATTERN_ROWS) {
    errors.push(
      `${label}: subpat has ${rowsIn.length} rows; UGE supports at most ${MAX_UGE_SUBPATTERN_ROWS}.`,
    );
    return { enabled: false, rows: [], errors, warnings };
  }

  const rows: TickRow[] = [];
  for (let i = 0; i < rowsIn.length; i++) {
    const src = rowsIn[i];
    // Bare `halt` token: freeze on previous row (or silence-halt if first).
    const isBareHalt =
      !!src.halt &&
      !src.empty &&
      (src.offset === undefined || src.offset === null) &&
      src.vol === undefined &&
      !src.fx &&
      src.timbre === undefined &&
      src.jump === undefined;
    if (isBareHalt) {
      if (rows.length === 0) {
        rows.push({
          offset: 0,
          effect: { code: HUGE_EFFECT_SET_VOLUME, param: 0 },
          halt: true,
        });
      } else {
        rows[rows.length - 1].halt = true;
        if (rows[rows.length - 1].jump) {
          warnings.push(`${label}: halt overrides jump on subpat row ${i}.`);
          delete rows[rows.length - 1].jump;
        }
      }
      continue;
    }

    const row: TickRow = {
      offset: src.empty ? null : (src.offset === undefined ? null : src.offset),
    };

    if (src.halt) row.halt = true;
    if (src.jump !== undefined && src.jump > 0) {
      if (src.halt) {
        warnings.push(`${label}: subpat row ${i} has both halt and jump; using halt.`);
      } else {
        row.jump = src.jump;
      }
    }

    // Effect priority: explicit fx > vol > timbre (vol wins over timbre if both)
    if (src.fx) {
      row.effect = {
        code: clampInt(src.fx.code, 0, 15),
        param: clampInt(src.fx.param, 0, 255),
      };
      if (src.vol !== undefined || src.timbre !== undefined) {
        warnings.push(`${label}: subpat row ${i}: fx: overrides vol:/timbre:.`);
      }
    } else if (src.vol !== undefined) {
      row.effect = {
        code: HUGE_EFFECT_SET_VOLUME,
        param: volumeEffectParam(src.vol),
      };
      if (src.timbre !== undefined) {
        warnings.push(`${label}: subpat row ${i}: vol: wins over timbre: (one effect column).`);
      }
    } else if (src.timbre !== undefined) {
      row.effect = {
        code: HUGE_EFFECT_CHANGE_TIMBRE,
        param: clampInt(src.timbre, 0, 255),
      };
    }

    rows.push(row);
  }

  // If author never halted/jumped, append silence halt (same as one-shot macros).
  const last = rows[rows.length - 1];
  if (last && !last.halt && (last.jump === undefined || last.jump <= 0)) {
    const holdOffset = last.offset === null ? 0 : last.offset;
    appendSilenceHalt(rows, holdOffset, label, errors);
    if (errors.length) return { enabled: false, rows: [], errors, warnings };
  }

  return { enabled: rows.length > 0, rows, errors, warnings };
}

/**
 * Lower instrument macros into a tick program.
 *
 * Lanes: `pitch_env` / `arp_env` → offsets, `vol_env` → Cxy, `duty_env` → 9xx.
 * Native `subpatRows` on the instrument wins over macros when present.
 */
export function lowerGameBoyInstrumentProgram(
  inst: Record<string, unknown> | null | undefined,
  opts: LowerOptions = {},
): TickProgram {
  const errors: string[] = [];
  const warnings: string[] = [];
  const label = opts.name ? `Instrument '${opts.name}'` : 'Instrument';

  if (!inst) {
    return { enabled: false, rows: [], errors, warnings };
  }

  // Native subpat (Phase 4) — wins over macros.
  const nativeRows = inst.subpatRows as SubPatternRow[] | undefined;
  if (Array.isArray(nativeRows) && nativeRows.length > 0) {
    if (
      inst.pitch_env !== undefined ||
      inst.vol_env !== undefined ||
      inst.duty_env !== undefined ||
      inst.arp_env !== undefined
    ) {
      warnings.push(
        `${label}: has subpat=; pitch_env/vol_env/duty_env/arp_env are ignored for the instrument program.`,
      );
    }
    const native = lowerNativeSubPattern(nativeRows, opts);
    return {
      ...native,
      warnings: [...warnings, ...native.warnings],
      errors: [...errors, ...native.errors],
    };
  }

  if (typeof inst.subpat === 'string' && inst.subpat.trim()) {
    errors.push(
      `${label}: subpat='${inst.subpat}' was not resolved (missing subpat declaration?).`,
    );
    return { enabled: false, rows: [], errors, warnings };
  }

  const pitch = parseMacro(inst.pitch_env);
  const arp = parseMacro(inst.arp_env);
  const vol = parseMacro(inst.vol_env);
  const duty = parseMacro(inst.duty_env);

  let pitchLane = pitch;
  if (pitch && arp) {
    warnings.push(
      `${label}: pitch_env and arp_env both set; using pitch_env (arp_env ignored).`,
    );
  } else if (!pitch && arp) {
    pitchLane = arp;
  }

  if (!pitchLane && !vol && !duty) {
    return { enabled: false, rows: [], errors, warnings };
  }

  const pitchLen = pitchLane?.values.length ?? 0;
  const volLen = vol?.values.length ?? 0;
  const dutyLen = duty?.values.length ?? 0;
  const len = Math.max(pitchLen, volLen, dutyLen);

  if (len > MAX_UGE_SUBPATTERN_ROWS) {
    errors.push(
      `${label}: instrument program expands to ${len} ticks; UGE subpatterns support at most ${MAX_UGE_SUBPATTERN_ROWS}.`,
    );
    return { enabled: false, rows: [], errors, warnings };
  }

  const rows: TickRow[] = [];
  let lastOffset = 0;
  let sawPitch = false;

  for (let i = 0; i < len; i++) {
    let offset: number | null = lastOffset;
    if (pitchLane && i < pitchLane.values.length) {
      offset = pitchLane.values[i];
      if (!Number.isFinite(offset as number)) offset = lastOffset;
      lastOffset = offset as number;
      sawPitch = true;
    } else if (!sawPitch) {
      offset = 0;
      lastOffset = 0;
    }

    const row: TickRow = { offset };

    const hasVol = !!(vol && i < vol.values.length && Number.isFinite(vol.values[i]));
    const hasDuty = !!(duty && i < duty.values.length && Number.isFinite(duty.values[i]));

    if (hasVol && hasDuty) {
      warnings.push(
        `${label}: tick ${i}: vol_env wins over duty_env (one UGE effect column).`,
      );
    }

    if (hasVol) {
      row.effect = {
        code: HUGE_EFFECT_SET_VOLUME,
        param: volumeEffectParam(vol!.values[i]),
      };
    } else if (hasDuty) {
      row.effect = {
        code: HUGE_EFFECT_CHANGE_TIMBRE,
        param: dutyIndexToTimbreParam(duty!.values[i]),
      };
    }

    rows.push(row);
  }

  const loopCandidates: number[] = [];
  if (pitchLane && pitchLane.loopPoint >= 0) loopCandidates.push(pitchLane.loopPoint);
  if (vol && vol.loopPoint >= 0) loopCandidates.push(vol.loopPoint);
  if (duty && duty.loopPoint >= 0) loopCandidates.push(duty.loopPoint);

  if (loopCandidates.length > 0) {
    const last = rows[rows.length - 1];
    const loopTo = Math.min(...loopCandidates);
    const loops = [pitchLane?.loopPoint, vol?.loopPoint, duty?.loopPoint].filter(
      (n): n is number => n !== undefined && n >= 0,
    );
    if (new Set(loops).size > 1) {
      warnings.push(
        `${label}: macro lanes have different loop points; using row ${loopTo}.`,
      );
    }
    last.jump = loopTo + 1; // 1-based for UGE
    last.halt = false;
  } else {
    appendSilenceHalt(rows, lastOffset, label, errors);
    if (errors.length) return { enabled: false, rows: [], errors, warnings };
  }

  return { enabled: rows.length > 0, rows, errors, warnings };
}

/**
 * Expand a TickProgram to exactly 64 UGE subpattern cells.
 */
export function encodeTickProgramToUgeRows(program: TickProgram): UgeSubpatternCell[] {
  const cells: UgeSubpatternCell[] = [];
  for (let i = 0; i < MAX_UGE_SUBPATTERN_ROWS; i++) {
    const row = program.enabled ? program.rows[i] : undefined;
    if (!row) {
      cells.push({
        note: UGE_EMPTY_NOTE,
        unused: 0,
        jump: 0,
        effectCode: 0,
        effectParam: 0,
      });
      continue;
    }

    let jump = 0;
    if (row.halt) {
      jump = i + 1; // self-jump, 1-based
    } else if (row.jump !== undefined && row.jump > 0) {
      jump = row.jump;
    }

    cells.push({
      note: offsetToUgeNote(row.offset),
      unused: 0,
      jump,
      effectCode: row.effect?.code ?? 0,
      effectParam: row.effect?.param ?? 0,
    });
  }
  return cells;
}

/**
 * Resolve noise LFSR clock for a base instrument note plus a tick-program offset.
 * Empty/null offset uses the base note (no extra semitone shift).
 */
export function resolveNoiseClockWithOffset(
  inst: Record<string, unknown> | null | undefined,
  offsetSemitones: number | null,
): NoiseClockParams {
  let baseIndex = HUGE_SUBPAT_OFFSET_ZERO_NOTE;
  const ugeNote = inst?.uge_note;
  if (typeof ugeNote === 'string' && ugeNote.trim()) {
    const idx = hugeTrackerNoteToIndex(ugeNote);
    if (idx !== UGE_EMPTY_NOTE) baseIndex = idx;
  }

  const off = offsetSemitones === null || offsetSemitones === undefined ? 0 : offsetSemitones;
  const noteIndex = clampInt(baseIndex + off, 0, 72);
  const poly = getNotePoly(noteIndex);
  const { shift, divisor } = nr43ToShiftDivisor(poly);
  const width = resolveNoiseWidth(inst);
  return { shift, divisor, nr43: applyNoiseWidthToNr43(poly, width) };
}

/**
 * Resolve the active TickRow at time `t` seconds after note-on.
 * Honors halt (freeze) and jump loops.
 */
export function tickRowAtTime(program: TickProgram, tSec: number): TickRow | null {
  if (!program.enabled || program.rows.length === 0) return null;

  const n = program.rows.length;
  let idx = Math.floor(tSec / HUGE_TICK_SEC);
  if (idx < 0) idx = 0;

  let rowIndex = 0;
  let ticks = 0;
  const maxSteps = idx + 1;
  while (ticks < maxSteps) {
    const row = program.rows[rowIndex];
    if (!row) return program.rows[program.rows.length - 1] ?? null;

    if (ticks === idx) return row;

    if (row.halt) {
      return row;
    }

    if (row.jump !== undefined && row.jump > 0) {
      rowIndex = clampInt(row.jump - 1, 0, n - 1);
    } else if (rowIndex >= n - 1) {
      rowIndex = 0;
    } else {
      rowIndex++;
    }
    ticks++;
  }

  return program.rows[rowIndex] ?? null;
}

/**
 * Volume 0–15 from a tick row's Cxy effect, if present.
 */
export function tickRowVolume(row: TickRow | null | undefined): number | null {
  if (!row?.effect || row.effect.code !== HUGE_EFFECT_SET_VOLUME) return null;
  return row.effect.param & 0x0f;
}

/** True when the instrument defines a lowerable program. */
export function instrumentHasTickProgram(inst: Record<string, unknown> | null | undefined): boolean {
  if (!inst) return false;
  if (Array.isArray(inst.subpatRows) && (inst.subpatRows as unknown[]).length > 0) return true;
  return (
    parseMacro(inst.pitch_env) !== null ||
    parseMacro(inst.vol_env) !== null ||
    parseMacro(inst.duty_env) !== null ||
    parseMacro(inst.arp_env) !== null
  );
}

export type { ParsedMacro };
