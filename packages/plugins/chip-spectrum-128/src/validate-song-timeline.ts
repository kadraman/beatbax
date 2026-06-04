/**
 * Tick-aware shared-resource validation for AY-3-8912 songs.
 *
 * Resolves channel sequences and tracks which instruments are sounding on each
 * tick (including `_` sustains). Conflicts are reported only when overlapping
 * voices actually need different R6 noise periods or R11–R13 envelope programs.
 */
import type { AST, InstrumentNode, ValidationError, ChannelModel, ChannelEvent } from '@beatbax/engine';
import { resolveSong } from '@beatbax/engine';
import { resolveEnvShape } from './periodTables.js';

interface ChannelSoundState {
  sounding: string | null;
  lastNoteInst: string | null;
}

function eventInstrument(
  ev: ChannelEvent,
  defaultInstrument: string | undefined,
): string | null {
  if (ev.type === 'rest') return null;
  const name = (ev as { instrument?: string }).instrument ?? defaultInstrument;
  return name ?? null;
}

/** Build per-tick lists of instrument names sounding across all channels. */
export function buildSoundingInstrumentsByTick(channels: ChannelModel[]): string[][] {
  const maxLen = Math.max(0, ...channels.map(ch => ch.events.length));
  const states: ChannelSoundState[] = channels.map(() => ({
    sounding: null,
    lastNoteInst: null,
  }));
  const timeline: string[][] = [];

  for (let t = 0; t < maxLen; t++) {
    const active: string[] = [];

    for (let ci = 0; ci < channels.length; ci++) {
      const ch = channels[ci];
      const state = states[ci];
      const ev = ch.events[t];

      if (ev) {
        switch (ev.type) {
          case 'note':
          case 'named': {
            const inst = eventInstrument(ev, ch.defaultInstrument);
            state.lastNoteInst = inst;
            state.sounding = inst;
            break;
          }
          case 'sustain':
            state.sounding = state.lastNoteInst;
            break;
          case 'rest':
            state.sounding = null;
            state.lastNoteInst = null;
            break;
        }
      }

      if (state.sounding) active.push(state.sounding);
    }

    timeline.push(active);
  }

  return timeline;
}

function formatTickLocation(tick: number, stepsPerBar: number): string {
  const bar = Math.floor(tick / stepsPerBar) + 1;
  const step = (tick % stepsPerBar) + 1;
  return `bar ${bar} step ${step}`;
}

function formatTickLocations(ticks: number[], stepsPerBar: number): string {
  const head = ticks.slice(0, 3).map(t => formatTickLocation(t, stepsPerBar));
  const tail = ticks.length > 3 ? ` (+${ticks.length - 3} more)` : '';
  return head.join(', ') + tail;
}

function instUsesVolEnv(inst: InstrumentNode | undefined): boolean {
  return !!inst && inst.vol_env !== undefined && !inst.env_bass;
}

function instUsesEnvBass(inst: InstrumentNode | undefined): boolean {
  return !!inst && !!inst.env_bass;
}

function instNoiseRate(inst: InstrumentNode | undefined): number | undefined {
  if (!inst || inst.noise_rate === undefined) return undefined;
  return Number(inst.noise_rate);
}

function instEnvShape(inst: InstrumentNode | undefined): number | undefined {
  if (!instUsesEnvBass(inst)) return undefined;
  return resolveEnvShape(inst!);
}

function describeInst(name: string, inst: InstrumentNode | undefined): string {
  if (instUsesEnvBass(inst)) {
    return `${name} (${inst?.type ?? '?'}, env_shape=${instEnvShape(inst)})`;
  }
  return `${name} (${inst?.type ?? '?'})`;
}

/**
 * Run tick-aware validation on a parsed song AST.
 */
export function validateSongTimeline(
  song: AST,
  instruments: Record<string, InstrumentNode>,
): ValidationError[] {
  if (!song.channels?.length) return [];

  let resolved;
  try {
    resolved = resolveSong({ ...song, insts: instruments });
  } catch {
    return [];
  }

  const timeline = buildSoundingInstrumentsByTick(resolved.channels);
  if (timeline.length === 0) return [];

  const stepsPerBar = song.stepsPerBar ?? song.time ?? 4;
  const insts = instruments;

  const noiseRateTicks: number[] = [];
  const volEnvTicks: number[] = [];
  const envBassVolEnvTicks: number[] = [];
  const envShapeTicks: number[] = [];

  for (let t = 0; t < timeline.length; t++) {
    const names = [...new Set(timeline[t])];
    if (names.length < 2) continue;

    const defs = names.map(n => ({ name: n, inst: insts[n] }));

    const noiseRates = new Map<number, string[]>();
    for (const { name, inst } of defs) {
      const rate = instNoiseRate(inst);
      if (rate === undefined) continue;
      if (!noiseRates.has(rate)) noiseRates.set(rate, []);
      noiseRates.get(rate)!.push(name);
    }
    if (noiseRates.size > 1) noiseRateTicks.push(t);

    const volEnvNames = defs.filter(d => instUsesVolEnv(d.inst)).map(d => d.name);
    if (volEnvNames.length > 1) volEnvTicks.push(t);

    const envBassNames = defs.filter(d => instUsesEnvBass(d.inst)).map(d => d.name);
    const volEnvActive = defs.filter(d => instUsesVolEnv(d.inst)).map(d => d.name);
    if (envBassNames.length > 0 && volEnvActive.length > 0) envBassVolEnvTicks.push(t);

    const envShapes = new Map<number, string[]>();
    for (const { name, inst } of defs) {
      const shape = instEnvShape(inst);
      if (shape === undefined) continue;
      if (!envShapes.has(shape)) envShapes.set(shape, []);
      envShapes.get(shape)!.push(name);
    }
    if (envShapes.size > 1) envShapeTicks.push(t);
  }

  const errors: ValidationError[] = [];

  if (noiseRateTicks.length > 0) {
    const rates = [...new Set(
      Object.values(insts)
        .map(i => instNoiseRate(i))
        .filter((r): r is number => r !== undefined),
    )].sort((a, b) => a - b);
    errors.push({
      field: 'noise_rate',
      message:
        `Different noise_rate values (${rates.join(', ')}) overlap on ${noiseRateTicks.length} tick(s) ` +
        `(${formatTickLocations(noiseRateTicks, stepsPerBar)}). ` +
        `When active together, R6 is set to the last writer's value. ` +
        `Use the same noise_rate for simultaneously sounding noise voices, or stagger hits.`,
    });
  }

  if (volEnvTicks.length > 0) {
    const volEnvInsts = Object.entries(insts).filter(([, i]) => instUsesVolEnv(i));
    errors.push({
      field: 'vol_env',
      message:
        `Multiple vol_env instruments overlap on ${volEnvTicks.length} tick(s) ` +
        `(${formatTickLocations(volEnvTicks, stepsPerBar)}): ` +
        `${volEnvInsts.map(([n, i]) => describeInst(n, i)).join(', ')}. ` +
        `The AY-3-8912 has a single hardware envelope generator (R11–R13). ` +
        `Only one vol_env program may be active at a time — use software volume slides elsewhere.`,
    });
  }

  if (envBassVolEnvTicks.length > 0) {
    const envBassInsts = Object.entries(insts).filter(([, i]) => instUsesEnvBass(i));
    const volEnvInsts = Object.entries(insts).filter(([, i]) => instUsesVolEnv(i));
    errors.push({
      field: 'env_bass',
      message:
        `env_bass and vol_env overlap on ${envBassVolEnvTicks.length} tick(s) ` +
        `(${formatTickLocations(envBassVolEnvTicks, stepsPerBar)}) — both program R11–R13. ` +
        `env_bass: ${envBassInsts.map(([n, i]) => describeInst(n, i)).join(', ')}. ` +
        `vol_env: ${volEnvInsts.map(([n, i]) => describeInst(n, i)).join(', ')}.`,
    });
  }

  if (envShapeTicks.length > 0) {
    const envBassInsts = Object.entries(insts).filter(([, i]) => instUsesEnvBass(i));
    const shapes = [...new Set(envBassInsts.map(([, i]) => instEnvShape(i)!))].sort((a, b) => a - b);
    errors.push({
      field: 'env_shape',
      message:
        `Different env_shape values (${shapes.join(', ')}) overlap on ${envShapeTicks.length} tick(s) ` +
        `(${formatTickLocations(envShapeTicks, stepsPerBar)}). ` +
        `The AY-3-8912 has one R13 shape register — all simultaneously active env_bass voices must agree. ` +
        `${envBassInsts.map(([n, i]) => describeInst(n, i)).join(', ')}.`,
    });
  }

  return errors;
}
