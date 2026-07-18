/**
 * Game Boy instrument tick programs: lower BeatBax macros into a shared IR
 * used by UGE subpattern export and WebAudio/PCM preview.
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

/** Approximate hUGE/GB frame tick for preview (seconds). */
export const HUGE_TICK_SEC = 1 / 60;

export interface TickRow {
  /** Semitone offset from the instrument base note. */
  offset: number;
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

/**
 * Encode a signed semitone offset into a UGE subpattern note index.
 * Empty/unused → 90; otherwise C-6 (+0) + offset, clamped to 0–72.
 */
export function offsetToUgeNote(offset: number): number {
  if (!Number.isFinite(offset)) return UGE_EMPTY_NOTE;
  return clampInt(HUGE_SUBPAT_OFFSET_ZERO_NOTE + offset, 0, 72);
}

/**
 * Decode a UGE subpattern note index back to a signed offset (C-6 = 0).
 */
export function ugeNoteToOffset(note: number): number | null {
  if (note === UGE_EMPTY_NOTE || !Number.isFinite(note)) return null;
  return note - HUGE_SUBPAT_OFFSET_ZERO_NOTE;
}

/**
 * Lower instrument macros into a tick program.
 *
 * v1 lanes: `pitch_env` → offsets, `vol_env` → Cxy volume effects.
 * Merge: zip to max length; hold last pitch; omit volume effect when lane shorter
 * (do not invent volumes). One-shot → halt on last row; `|N` → jump to N (0-based → 1-based).
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

  if (inst.duty_env !== undefined && inst.duty_env !== null && inst.duty_env !== '') {
    warnings.push(
      `${label}: duty_env is not lowered to UGE subpatterns yet; ignored for the instrument program.`,
    );
  }
  if (inst.arp_env !== undefined && inst.arp_env !== null && inst.arp_env !== '') {
    warnings.push(
      `${label}: arp_env is not lowered to UGE subpatterns yet; use pitch_env for pitch steps.`,
    );
  }

  const pitch = parseMacro(inst.pitch_env);
  const vol = parseMacro(inst.vol_env);

  if (!pitch && !vol) {
    return { enabled: false, rows: [], errors, warnings };
  }

  const pitchLen = pitch?.values.length ?? 0;
  const volLen = vol?.values.length ?? 0;
  const len = Math.max(pitchLen, volLen);

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
    let offset = lastOffset;
    if (pitch && i < pitch.values.length) {
      offset = pitch.values[i];
      if (!Number.isFinite(offset)) offset = lastOffset;
      lastOffset = offset;
      sawPitch = true;
    } else if (!sawPitch) {
      offset = 0;
      lastOffset = 0;
    }

    const row: TickRow = { offset };

    if (vol && i < vol.values.length) {
      const v = vol.values[i];
      if (Number.isFinite(v)) {
        row.effect = {
          code: HUGE_EFFECT_SET_VOLUME,
          param: volumeEffectParam(v),
        };
      }
    }

    rows.push(row);
  }

  // Loop / halt on the last authored row.
  // One-shot halt must not freeze on a non-zero Cxy — hUGE keeps applying that
  // volume every tick, so drums would ring forever (including after the song ends).
  const loopCandidates: number[] = [];
  if (pitch && pitch.loopPoint >= 0) loopCandidates.push(pitch.loopPoint);
  if (vol && vol.loopPoint >= 0) loopCandidates.push(vol.loopPoint);

  if (loopCandidates.length > 0) {
    const last = rows[rows.length - 1];
    const loopTo = Math.min(...loopCandidates);
    if (pitch && vol && pitch.loopPoint >= 0 && vol.loopPoint >= 0 && pitch.loopPoint !== vol.loopPoint) {
      warnings.push(
        `${label}: pitch_env and vol_env have different loop points; using row ${loopTo}.`,
      );
    }
    last.jump = loopTo + 1; // 1-based for UGE
    last.halt = false;
  } else {
    const lastVol = tickRowVolume(rows[rows.length - 1]);
    if (lastVol === null || lastVol > 0) {
      if (rows.length + 1 > MAX_UGE_SUBPATTERN_ROWS) {
        errors.push(
          `${label}: instrument program needs a silence/halt row but would exceed ${MAX_UGE_SUBPATTERN_ROWS} ticks.`,
        );
        return { enabled: false, rows: [], errors, warnings };
      }
      rows.push({
        offset: lastOffset,
        effect: { code: HUGE_EFFECT_SET_VOLUME, param: 0 },
        halt: true,
      });
    } else {
      rows[rows.length - 1].halt = true;
    }
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
 */
export function resolveNoiseClockWithOffset(
  inst: Record<string, unknown> | null | undefined,
  offsetSemitones: number,
): NoiseClockParams {
  let baseIndex = HUGE_SUBPAT_OFFSET_ZERO_NOTE;
  const ugeNote = inst?.uge_note;
  if (typeof ugeNote === 'string' && ugeNote.trim()) {
    const idx = hugeTrackerNoteToIndex(ugeNote);
    if (idx !== UGE_EMPTY_NOTE) baseIndex = idx;
  }

  const noteIndex = clampInt(baseIndex + offsetSemitones, 0, 72);
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

  // Walk with jumps/halt — for short programs, simulate from start.
  let rowIndex = 0;
  let ticks = 0;
  const maxSteps = idx + 1;
  while (ticks < maxSteps) {
    const row = program.rows[rowIndex];
    if (!row) return program.rows[program.rows.length - 1] ?? null;

    if (ticks === idx) return row;

    if (row.halt) {
      // Stay on this row for remaining time
      return row;
    }

    if (row.jump !== undefined && row.jump > 0) {
      rowIndex = clampInt(row.jump - 1, 0, n - 1);
    } else if (rowIndex >= n - 1) {
      // Auto-loop to start (hUGE default) — should be rare if halt is set
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

/** True when the instrument defines a lowerable program (macros present). */
export function instrumentHasTickProgram(inst: Record<string, unknown> | null | undefined): boolean {
  if (!inst) return false;
  return parseMacro(inst.pitch_env) !== null || parseMacro(inst.vol_env) !== null;
}

export type { ParsedMacro };
