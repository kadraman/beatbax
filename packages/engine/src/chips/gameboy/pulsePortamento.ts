import {
  lowerGameBoyInstrumentProgram,
  tickProgramHasDutyMotion,
  tickRowVolume,
} from './instrumentProgram.js';

/** Notes this close on the channel grid count as one continuous voice. */
export const PORTAMENTO_CONTIGUOUS_EPSILON_SEC = 1e-4;

export interface PulsePortamentoLink {
  /** Reuse the channel's held oscillator instead of starting a new one. */
  join: boolean;
  /** Do not fade the voice at this note's end; a later port note continues it. */
  hold: boolean;
  /** Absolute time the oscillator created by this note must stay started until. */
  voiceStopAt: number;
  channelId: number;
}

/** True when this pulse instrument is rendered with an oscillator, not a baked buffer. */
export function pulseUsesSharedPortamentoVoice(inst: any): boolean {
  const program = lowerGameBoyInstrumentProgram(inst ?? {});
  if (!program.enabled) return true;
  const useProgramVolume = program.rows.some((r) => tickRowVolume(r) !== null);
  const bakeDuty = tickProgramHasDutyMotion(program);
  return !(bakeDuty || useProgramVolume);
}

export function noteHasPort(token: any): boolean {
  if (!token) return false;
  if (typeof token === 'string') return /<[^>]*\bport\s*:/i.test(token);
  const effects = token.effects;
  if (!Array.isArray(effects)) return false;
  return effects.some((fx: any) => {
    const name = fx && typeof fx === 'object' && fx.type ? fx.type : fx;
    return String(name ?? '').toLowerCase() === 'port';
  });
}

function isSustainToken(token: any): boolean {
  if (token === '_' || token === '-') return true;
  return !!(token && typeof token === 'object' && token.type === 'sustain');
}

/** A resolved note event that can extend a shared pulse voice. */
export function isJoinablePulsePortNote(token: any): boolean {
  if (!token || typeof token !== 'object' || token.type !== 'note') return false;
  if (!noteHasPort(token)) return false;
  const inst = token.instProps;
  if (!inst || !inst.type || !String(inst.type).toLowerCase().includes('pulse')) return false;
  return pulseUsesSharedPortamentoVoice(inst);
}

/**
 * End time of the contiguous pulse `port` notes that follow `index`.
 * Returns this note's own end when nothing joins it.
 */
export function contiguousPulsePortChainEnd(args: {
  tokens: readonly any[];
  index: number;
  originTime: number;
  tickSeconds: number;
  noteTime: number;
  noteDur: number;
}): number {
  const { tokens, originTime, tickSeconds } = args;
  let end = args.noteTime + args.noteDur;
  let i = args.index;
  let time = args.noteTime;
  let dur = args.noteDur;
  while (i >= 0 && i < tokens.length) {
    let j = i + 1;
    while (j < tokens.length && isSustainToken(tokens[j])) j++;
    if (j >= tokens.length) break;
    const next = tokens[j];
    if (!isJoinablePulsePortNote(next)) break;
    const nextTime = originTime + j * tickSeconds;
    if (Math.abs(nextTime - (time + dur)) > PORTAMENTO_CONTIGUOUS_EPSILON_SEC) break;
    let sustain = 0;
    for (let k = j + 1; k < tokens.length; k++) {
      if (isSustainToken(tokens[k])) sustain++;
      else break;
    }
    const nextDur = tickSeconds * (1 + sustain);
    end = nextTime + nextDur;
    i = j;
    time = nextTime;
    dur = nextDur;
  }
  return end;
}

export function planPulsePortamentoLink(args: {
  eligible: boolean;
  hasPort: boolean;
  holdUntil: number | null;
  time: number;
  dur: number;
  chainEnd: number;
  channelId: number;
}): { link: PulsePortamentoLink | undefined; nextHoldUntil: number | null } {
  if (!args.eligible) return { link: undefined, nextHoldUntil: null };
  const noteEnd = args.time + args.dur;
  const continues = args.chainEnd > noteEnd + PORTAMENTO_CONTIGUOUS_EPSILON_SEC;
  // Only a port note may lend its voice to the next port note. A plain note
  // before the run keeps its own envelope and fade, so a decayed attack
  // (bridge Ab5, build G4) cannot mute the slide that follows.
  const hold = args.hasPort && continues;
  const join = args.hasPort
    && args.holdUntil !== null
    && Math.abs(args.holdUntil - args.time) < PORTAMENTO_CONTIGUOUS_EPSILON_SEC;
  return {
    link: {
      join,
      hold,
      voiceStopAt: (hold || join) ? args.chainEnd : noteEnd,
      channelId: args.channelId,
    },
    nextHoldUntil: hold ? noteEnd : null,
  };
}
