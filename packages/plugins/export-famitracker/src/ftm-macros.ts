/**
 * FamiTracker macro (sequence) builders and deduplication.
 *
 * Converts BeatBax instrument fields to FtmMacro objects.
 */

import type { InstrumentNode } from '@beatbax/engine';
import { FtmMacro, MacroTypeName, NesChannelType } from './ftm-types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Parse a macro array string like "[1,2,3|2]" or "1,2,3|2" into values + loop point. */
export function parseMacroField(
  field: string | number[] | undefined,
): { values: number[]; loop: number } | null {
  if (field === undefined || field === null) return null;

  if (Array.isArray(field)) {
    return { values: field.map(Number), loop: -1 };
  }

  let s = String(field).trim();
  // Strip surrounding brackets
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);

  const pipeIdx = s.indexOf('|');
  let loop = -1;
  let valueStr = s;

  if (pipeIdx !== -1) {
    const loopPart = s.slice(pipeIdx + 1).trim();
    loop = parseInt(loopPart, 10);
    if (!Number.isFinite(loop)) loop = -1;
    valueStr = s.slice(0, pipeIdx);
  }

  const values = valueStr
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
    .map((v) => parseInt(v, 10))
    .filter((v) => Number.isFinite(v));

  if (values.length === 0) return null;
  return { values, loop };
}

/** Parse a BeatBax `env` field (string or EnvelopeAST) into {level, direction, period}. */
function parseEnvField(
  env: any,
  envPeriod?: any,
): { level: number; direction: 'flat' | 'down' | 'up'; period: number } | null {
  if (!env) return null;

  let level = 15;
  let direction: 'flat' | 'down' | 'up' = 'down';
  let period = 1;

  if (typeof env === 'object') {
    // EnvelopeAST-style object
    const obj = env as any;
    level = Math.max(0, Math.min(15, Number(obj.level ?? obj.initial ?? obj.value ?? 15)));
    const dirStr = String(obj.direction ?? obj.dir ?? 'down').toLowerCase();
    direction = dirStr === 'flat' ? 'flat' : dirStr === 'up' ? 'up' : 'down';
    period = Math.max(0, Math.min(7, Number(obj.period ?? 1)));
  } else {
    const s = String(env).trim();
    // Remove "gb:" prefix if present
    const clean = s.startsWith('gb:') ? s.slice(3).trim() : s;
    const parts = clean.split(',').map((p) => p.trim());
    if (parts.length >= 1) {
      const v = parseInt(parts[0], 10);
      if (Number.isFinite(v)) level = Math.max(0, Math.min(15, v));
    }
    if (parts.length >= 2) {
      const d = parts[1].toLowerCase();
      direction = d === 'flat' ? 'flat' : d === 'up' ? 'up' : 'down';
    }
    if (parts.length >= 3) {
      const p = parseInt(parts[2], 10);
      if (Number.isFinite(p)) period = Math.max(0, Math.min(7, p));
    }
  }

  // env_period overrides period from env string
  if (envPeriod !== undefined) {
    const ep = parseInt(String(envPeriod), 10);
    if (Number.isFinite(ep)) period = Math.max(0, Math.min(15, ep));
  }

  return { level, direction, period };
}

/** Map a BeatBax duty string to FamiTracker duty index 0-3. */
export function dutyStringToFtm(duty: string | number | undefined): number {
  const s = String(duty ?? '50').trim();
  if (s === '12' || s === '12.5') return 0;
  if (s === '25') return 1;
  if (s === '75') return 3;
  return 2; // 50% is default / fallback
}

// ─── Macro builders ───────────────────────────────────────────────────────────

/**
 * Build a VOLUME macro from an instrument's volume-related fields.
 * Priority: vol_env > env (with direction) > vol (constant).
 */
export function buildVolumeMacro(inst: InstrumentNode): FtmMacro | null {
  // 1. vol_env: direct sequence
  const fromVolEnv = parseMacroField(inst.vol_env);
  if (fromVolEnv) {
    return {
      type: 'VOLUME',
      index: -1,
      loop: fromVolEnv.loop,
      release: -1,
      setting: 0,
      values: fromVolEnv.values,
    };
  }

  // 2. env: level + direction
  const envParsed = parseEnvField(inst.env, inst.env_period);
  if (envParsed) {
    const { level, direction, period } = envParsed;
    const stepRep = period + 1; // each level repeated this many frames

    if (direction === 'flat') {
      return { type: 'VOLUME', index: -1, loop: 0, release: -1, setting: 0, values: [level] };
    }

    if (direction === 'down') {
      const values: number[] = [];
      for (let v = level; v >= 0; v--) {
        for (let r = 0; r < stepRep; r++) values.push(v);
      }
      return { type: 'VOLUME', index: -1, loop: -1, release: -1, setting: 0, values };
    }

    if (direction === 'up') {
      const values: number[] = [];
      for (let v = 0; v <= level; v++) {
        for (let r = 0; r < stepRep; r++) values.push(v);
      }
      return { type: 'VOLUME', index: -1, loop: -1, release: -1, setting: 0, values };
    }
  }

  // 3. vol: constant level
  if (inst.vol !== undefined) {
    const v = Math.max(0, Math.min(15, Math.round(Number(inst.vol))));
    return { type: 'VOLUME', index: -1, loop: 0, release: -1, setting: 0, values: [v] };
  }

  return null;
}

/**
 * Build an ARPEGGIO macro from arp_env.
 * Values are semitone offsets — no scaling needed.
 */
export function buildArpMacro(inst: InstrumentNode): FtmMacro | null {
  const parsed = parseMacroField(inst.arp_env);
  if (!parsed) return null;
  return {
    type: 'ARPEGGIO',
    index: -1,
    loop: parsed.loop,
    release: -1,
    setting: 0,
    values: parsed.values,
  };
}

/**
 * Build a PITCH macro from pitch_env.
 * BeatBax values are in semitones; FTM units are 1/16 semitone → multiply by 16.
 */
export function buildPitchMacro(inst: InstrumentNode): FtmMacro | null {
  const parsed = parseMacroField(inst.pitch_env);
  if (!parsed) return null;
  return {
    type: 'PITCH',
    index: -1,
    loop: parsed.loop,
    release: -1,
    setting: 0,
    values: parsed.values.map((v) => v * 16),
  };
}

/**
 * Build a DUTYSEQ (HIPITCH type-4) macro from duty_env or constant duty.
 * Values are duty indices 0-3.
 */
export function buildDutyMacro(inst: InstrumentNode): FtmMacro | null {
  const fromDutyEnv = parseMacroField(inst.duty_env);
  if (fromDutyEnv) {
    return {
      type: 'DUTYSEQ',
      index: -1,
      loop: fromDutyEnv.loop,
      release: -1,
      setting: 0,
      values: fromDutyEnv.values,
    };
  }

  // Constant duty → single entry, no loop needed (duty is static)
  if (inst.duty !== undefined) {
    const idx = dutyStringToFtm(inst.duty);
    return { type: 'DUTYSEQ', index: -1, loop: -1, release: -1, setting: 0, values: [idx] };
  }

  return null;
}

/** Warnings accumulated during macro building for a single instrument. */
export interface MacroBuildResult {
  macros: Partial<Record<MacroTypeName, FtmMacro>>;
  warnings: string[];
}

/**
 * Build all applicable macros for an instrument, applying channel-specific
 * compatibility rules from the FamiTracker export spec.
 */
export function buildInstrumentMacros(
  inst: InstrumentNode,
  channelType: NesChannelType,
  instName: string,
): MacroBuildResult {
  const macros: Partial<Record<MacroTypeName, FtmMacro>> = {};
  const warnings: string[] = [];

  const vol = buildVolumeMacro(inst);
  const arp = buildArpMacro(inst);
  const pitch = buildPitchMacro(inst);
  const duty = buildDutyMacro(inst);

  // ── VOLUME ────────────────────────────────────────────────────────────────
  if (vol) {
    macros.VOLUME = vol;
    if (channelType === 'triangle' && (inst.vol_env || inst.env || inst.vol)) {
      warnings.push(
        `[${instName}] MACRO VOLUME written for triangle channel but has no effect (no HW volume register)`,
      );
    }
    if (channelType === 'dmc') {
      // DMC has no macro support — skip
      delete macros.VOLUME;
    }
  }

  // ── ARPEGGIO ──────────────────────────────────────────────────────────────
  if (arp) {
    if (channelType === 'noise') {
      warnings.push(
        `[${instName}] MACRO ARPEGGIO on noise channel shifts LFSR period; non-musical but written`,
      );
      macros.ARPEGGIO = arp;
    } else if (channelType === 'dmc') {
      // DMC: skip
    } else {
      macros.ARPEGGIO = arp;
    }
  }

  // ── PITCH ─────────────────────────────────────────────────────────────────
  if (pitch) {
    if (channelType === 'noise') {
      warnings.push(
        `[${instName}] MACRO PITCH skipped for noise channel (pitch register fixed by noise_period)`,
      );
    } else if (channelType === 'dmc') {
      // skip
    } else {
      macros.PITCH = pitch;
    }
  }

  // ── DUTYSEQ ───────────────────────────────────────────────────────────────
  if (duty) {
    if (channelType === 'triangle') {
      warnings.push(`[${instName}] MACRO DUTYSEQ skipped for triangle channel (no duty register)`);
    } else if (channelType === 'noise') {
      warnings.push(
        `[${instName}] MACRO DUTYSEQ on noise channel repurposes type-4 as noise-mode flag (non-standard)`,
      );
      macros.DUTYSEQ = duty;
    } else if (channelType === 'dmc') {
      // skip
    } else {
      macros.DUTYSEQ = duty;
    }
  }

  return { macros, warnings };
}

// ─── Deduplication ───────────────────────────────────────────────────────────

function macroKey(m: FtmMacro): string {
  return `${m.type}:${m.loop}:${m.release}:${m.setting}:${m.values.join(',')}`;
}

/**
 * Assign unique indices to macros, deduplicating identical sequences.
 * Returns the macros list with `.index` fields populated.
 * Mutates the input macros array in-place.
 */
export function deduplicateMacros(macros: FtmMacro[]): FtmMacro[] {
  const indexByType: Record<MacroTypeName, number> = {
    VOLUME: 0,
    ARPEGGIO: 0,
    PITCH: 0,
    HIPITCH: 0,
    DUTYSEQ: 0,
  };
  const seen = new Map<string, number>();

  for (const m of macros) {
    const key = macroKey(m);
    if (seen.has(key)) {
      m.index = seen.get(key)!;
    } else {
      const idx = indexByType[m.type]++;
      m.index = idx;
      seen.set(key, idx);
    }
  }

  return macros;
}
