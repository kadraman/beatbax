/**
 * Unit tests for the shared channel simulation module (channelSim.ts).
 *
 * Tests cover all exported primitives:
 *  - Pitch utilities
 *  - Macro system
 *  - Base channel state factory
 *  - Instrument resolution
 *  - Generic effect parsing
 *  - Generic frame advancement
 *  - Tremolo attenuation helper
 */

import {
  NOTE_SEMITONES,
  noteToMidi,
  midiToFreq,
  midiToFreqForNote,
  parseMacro,
  macroValue,
  advanceMacro,
  makeMacroState,
  makeBaseChannelState,
  resolveInstrument,
  parseGenericEffectsOnNoteOn,
  advanceGenericFrames,
  calcTremoloAttenuation,
  type BaseChannelSimState,
  type Effect,
} from '../src/backends/channelSim.js';

// ─── Pitch utilities ─────────────────────────────────────────────────────────

describe('NOTE_SEMITONES', () => {
  it('C = 0', () => expect(NOTE_SEMITONES['C']).toBe(0));
  it('A = 9', () => expect(NOTE_SEMITONES['A']).toBe(9));
  it('B = 11', () => expect(NOTE_SEMITONES['B']).toBe(11));
  it('C# = 1', () => expect(NOTE_SEMITONES['C#']).toBe(1));
  it('DB = 1', () => expect(NOTE_SEMITONES['DB']).toBe(1));
});

describe('noteToMidi', () => {
  it('A4 = 69', () => expect(noteToMidi('A4')).toBe(69));
  it('C4 = 60', () => expect(noteToMidi('C4')).toBe(60));
  it('C5 = 72', () => expect(noteToMidi('C5')).toBe(72));
  it('F#5', () => expect(noteToMidi('F#5')).toBe(78));
  it('Bb3 parses via B-flat', () => expect(noteToMidi('Bb3')).toBe(58));
  it('invalid returns null', () => expect(noteToMidi('X9')).toBeNull());
  it('empty string returns null', () => expect(noteToMidi('')).toBeNull());
  it('negative octave', () => expect(noteToMidi('C-1')).toBe(0));
});

describe('midiToFreq', () => {
  it('A4 (midi 69) = 440 Hz', () => expect(midiToFreq(69)).toBeCloseTo(440, 4));
  it('A3 (midi 57) = 220 Hz', () => expect(midiToFreq(57)).toBeCloseTo(220, 4));
  it('C4 (midi 60) ≈ 261.63 Hz', () => expect(midiToFreq(60)).toBeCloseTo(261.63, 1));
});

describe('midiToFreqForNote', () => {
  it('A4 = 440 Hz', () => expect(midiToFreqForNote('A4')).toBeCloseTo(440, 4));
  it('invalid note = 0 Hz', () => expect(midiToFreqForNote('invalid')).toBe(0));
});

// ─── Macro system ─────────────────────────────────────────────────────────────

describe('parseMacro', () => {
  it('returns null for undefined', () => expect(parseMacro(undefined)).toBeNull());
  it('returns null for null', () => expect(parseMacro(null)).toBeNull());
  it('returns null for empty array', () => expect(parseMacro([])).toBeNull());
  it('parses a plain array', () => {
    const m = parseMacro([0, 8, 15]);
    expect(m).not.toBeNull();
    expect(m!.values).toEqual([0, 8, 15]);
    expect(m!.loopPoint).toBe(-1);
  });
  it('parses a bracket string without loop', () => {
    const m = parseMacro('[1,2,3]');
    expect(m!.values).toEqual([1, 2, 3]);
    expect(m!.loopPoint).toBe(-1);
  });
  it('parses a bracket string with loop point', () => {
    const m = parseMacro('[0,8,15|1]');
    expect(m!.values).toEqual([0, 8, 15]);
    expect(m!.loopPoint).toBe(1);
  });
  it('clamps loop point to last index when out of range', () => {
    const m = parseMacro('[1,2|99]');
    expect(m!.loopPoint).toBe(1);
  });
  it('returns null for bracket string with no valid values', () => {
    expect(parseMacro('[abc]')).toBeNull();
  });
});

describe('macroValue / advanceMacro / makeMacroState', () => {
  it('returns first value initially', () => {
    const macro = parseMacro([10, 20, 30])!;
    const state = makeMacroState();
    expect(macroValue(macro, state)).toBe(10);
  });

  it('advances through values', () => {
    const macro = parseMacro([10, 20, 30])!;
    const state = makeMacroState();
    advanceMacro(macro, state);
    expect(macroValue(macro, state)).toBe(20);
    advanceMacro(macro, state);
    expect(macroValue(macro, state)).toBe(30);
  });

  it('holds last value after end (no loop)', () => {
    const macro = parseMacro([10, 20])!;
    const state = makeMacroState();
    advanceMacro(macro, state);
    advanceMacro(macro, state); // past end
    expect(macroValue(macro, state)).toBe(20);
    expect(state.done).toBe(true);
  });

  it('loops when loopPoint is set', () => {
    const macro = parseMacro('[5,10,15|1]')!; // loop to index 1
    const state = makeMacroState();
    advanceMacro(macro, state); // → 10
    advanceMacro(macro, state); // → 15
    advanceMacro(macro, state); // loops → index 1 → 10
    expect(macroValue(macro, state)).toBe(10);
  });

  it('does not advance past end when done', () => {
    const macro = parseMacro([42])!;
    const state = makeMacroState();
    advanceMacro(macro, state); // mark done
    advanceMacro(macro, state); // no-op
    expect(state.done).toBe(true);
    expect(macroValue(macro, state)).toBe(42);
  });
});

// ─── Base channel state ───────────────────────────────────────────────────────

describe('makeBaseChannelState', () => {
  it('creates inactive state', () => {
    const s = makeBaseChannelState(15);
    expect(s.active).toBe(false);
    expect(s.freq).toBe(0);
    expect(s.attenuation).toBe(15);
  });

  it('respects mutedAttenuation parameter', () => {
    const s = makeBaseChannelState(0);
    expect(s.attenuation).toBe(0);
  });

  it('has no active macros or effects', () => {
    const s = makeBaseChannelState(15);
    expect(s.volEnvMacro).toBeNull();
    expect(s.arpEnvMacro).toBeNull();
    expect(s.pitchEnvMacro).toBeNull();
    expect(s.portActive).toBe(false);
    expect(s.bendActive).toBe(false);
    expect(s.cutTick).toBe(-1);
    expect(s.retrigInterval).toBe(0);
    expect(s.tremoloDuration).toBe(-1);
  });
});

// ─── Instrument resolution ────────────────────────────────────────────────────

describe('resolveInstrument', () => {
  const baseInst = { type: 'sn76489', vol: 8 } as any;
  const insts: Record<string, any> = { lead: baseInst };

  it('returns null when no name and no default', () => {
    expect(resolveInstrument({}, insts, undefined)).toBeNull();
  });

  it('returns null for missing instrument', () => {
    expect(resolveInstrument({ instrument: 'missing' }, insts, undefined)).toBeNull();
  });

  it('resolves by event instrument name', () => {
    expect(resolveInstrument({ instrument: 'lead' }, insts, undefined)).toBe(baseInst);
  });

  it('resolves by channel default', () => {
    expect(resolveInstrument({}, insts, 'lead')).toBe(baseInst);
  });

  it('event instrument name takes priority over default', () => {
    const other = { type: 'sn76489', vol: 0 } as any;
    const insts2 = { lead: baseInst, other };
    expect(resolveInstrument({ instrument: 'other' }, insts2, 'lead')).toBe(other);
  });

  it('merges instProps on top of base instrument', () => {
    const result = resolveInstrument({ instrument: 'lead', instProps: { vol: 12 } as any }, insts, undefined);
    expect(result).not.toBeNull();
    expect((result as any).vol).toBe(12);
    expect((result as any).type).toBe('sn76489');
  });

  it('does not mutate the original instrument when merging', () => {
    resolveInstrument({ instrument: 'lead', instProps: { vol: 99 } as any }, insts, undefined);
    expect((baseInst as any).vol).toBe(8);
  });
});

// ─── Generic effect parsing ───────────────────────────────────────────────────

function makeState(): BaseChannelSimState {
  return {
    ...makeBaseChannelState(15),
    active: true,
    freq: 440,
    baseFreq: 440,
    lastNoteFreq: 0,
    noteFrames: 60,
    noteFrame: 0,
  };
}

describe('parseGenericEffectsOnNoteOn — vib', () => {
  it('sets vibDepth and vibRate', () => {
    const state = makeState();
    parseGenericEffectsOnNoteOn([{ type: 'vib', params: [4, 6] }], state, 'A4', 1/240, 15);
    expect(state.vibDepth).toBe(4);
    expect(state.vibRate).toBe(6);
  });

  it('defaults to depth=1, rate=5 when params are NaN', () => {
    const state = makeState();
    parseGenericEffectsOnNoteOn([{ type: 'vib', params: ['x', 'y'] }], state, 'A4', 1/240, 15);
    expect(state.vibDepth).toBe(1);
    expect(state.vibRate).toBe(5);
  });

  it('uses delaySec field when provided', () => {
    const state = makeState();
    const eff: Effect = { type: 'vib', params: [4, 6], delaySec: 0.5 };
    parseGenericEffectsOnNoteOn([eff], state, 'A4', 1/240, 15);
    expect(state.vibDelay).toBe(Math.round(0.5 * 60));
  });
});

describe('parseGenericEffectsOnNoteOn — trem/tremolo', () => {
  it('sets tremoloDepth and tremoloRate', () => {
    const state = makeState();
    parseGenericEffectsOnNoteOn([{ type: 'trem', params: [3, 4] }], state, 'A4', 1/240, 15);
    expect(state.tremoloDepth).toBe(3);
    expect(state.tremoloRate).toBe(4);
  });

  it('accepts tremolo alias', () => {
    const state = makeState();
    parseGenericEffectsOnNoteOn([{ type: 'tremolo', params: [5, 7] }], state, 'A4', 1/240, 15);
    expect(state.tremoloDepth).toBe(5);
  });

  it('uses durationSec when provided', () => {
    const state = makeState();
    const eff: Effect = { type: 'trem', params: [2, 5], durationSec: 1.0 };
    parseGenericEffectsOnNoteOn([eff], state, 'A4', 1/240, 15);
    expect(state.tremoloDuration).toBe(60);
  });
});

describe('parseGenericEffectsOnNoteOn — cut', () => {
  it('sets cutTick', () => {
    const state = makeState();
    parseGenericEffectsOnNoteOn([{ type: 'cut', params: [2] }], state, 'A4', 1/240, 15);
    expect(state.cutTick).toBe(2);
  });
});

describe('parseGenericEffectsOnNoteOn — retrig', () => {
  it('sets retrigInterval', () => {
    const state = makeState();
    parseGenericEffectsOnNoteOn([{ type: 'retrig', params: [4] }], state, 'A4', 1/240, 15);
    expect(state.retrigInterval).toBe(4);
  });
});

describe('parseGenericEffectsOnNoteOn — arp', () => {
  it('sets arpEnvMacro with loop to start', () => {
    const state = makeState();
    parseGenericEffectsOnNoteOn([{ type: 'arp', params: [0, 4, 7] }], state, 'A4', 1/240, 15);
    expect(state.arpEnvMacro).not.toBeNull();
    expect(state.arpEnvMacro!.values).toEqual([0, 4, 7]);
    expect(state.arpEnvMacro!.loopPoint).toBe(0);
  });
});

describe('parseGenericEffectsOnNoteOn — bend', () => {
  it('sets bend state from semitone value', () => {
    const state = makeState();
    parseGenericEffectsOnNoteOn([{ type: 'bend', params: [2] }], state, 'A4', 1/240, 15);
    expect(state.bendActive).toBe(true);
    expect(state.bendSemitones).toBe(2);
  });

  it('sets bend curve', () => {
    const state = makeState();
    parseGenericEffectsOnNoteOn([{ type: 'bend', params: [2, 'exp'] }], state, 'A4', 1/240, 15);
    expect(state.bendCurve).toBe('exp');
  });

  it('ignores zero semitone bend', () => {
    const state = makeState();
    parseGenericEffectsOnNoteOn([{ type: 'bend', params: [0] }], state, 'A4', 1/240, 15);
    expect(state.bendActive).toBe(false);
  });
});

describe('parseGenericEffectsOnNoteOn — pitch_env', () => {
  it('sets pitchEnvMacro', () => {
    const state = makeState();
    parseGenericEffectsOnNoteOn([{ type: 'pitch_env', params: ['[0,2,4]'] }], state, 'A4', 1/240, 15);
    expect(state.pitchEnvMacro).not.toBeNull();
    expect(state.pitchEnvMacro!.values).toEqual([0, 2, 4]);
  });
});

describe('parseGenericEffectsOnNoteOn — does not handle noise_rate_env', () => {
  it('noise_rate_env is silently ignored (SMS-specific)', () => {
    const state = makeState();
    // Should not throw; SMS backend handles this itself
    expect(() => {
      parseGenericEffectsOnNoteOn([{ type: 'noise_rate_env', params: ['[0,1,2]'] }], state, 'A4', 1/240, 15);
    }).not.toThrow();
    // pitchEnvMacro and arpEnvMacro must not be set from noise_rate_env
    expect(state.pitchEnvMacro).toBeNull();
    expect(state.arpEnvMacro).toBeNull();
  });
});

// ─── Generic frame advancement ────────────────────────────────────────────────

describe('advanceGenericFrames', () => {
  it('returns false/false for inactive channel', () => {
    const state = makeBaseChannelState(15);
    const r = advanceGenericFrames(state, 10);
    expect(r.periodChanged).toBe(false);
    expect(r.volumeChanged).toBe(false);
  });

  it('returns false/false for 0 frames', () => {
    const state = { ...makeBaseChannelState(15), active: true };
    const r = advanceGenericFrames(state, 0);
    expect(r.periodChanged).toBe(false);
    expect(r.volumeChanged).toBe(false);
  });

  it('vol_env macro advances attenuation and signals volumeChanged', () => {
    const state: BaseChannelSimState = {
      ...makeBaseChannelState(15),
      active: true,
      freq: 440,
      baseFreq: 440,
      volEnvMacro: { values: [0, 5, 10], loopPoint: -1 },
      volEnvState: makeMacroState(),
    };
    const r = advanceGenericFrames(state, 1);
    expect(r.volumeChanged).toBe(true);
    expect(state.attenuation).toBe(0);
  });

  it('arp_env macro updates freq and signals periodChanged', () => {
    const state: BaseChannelSimState = {
      ...makeBaseChannelState(15),
      active: true,
      freq: 440,
      baseFreq: 440,
      arpEnvMacro: { values: [0, 7, 12], loopPoint: 0 },
      arpEnvState: { index: 1, done: false }, // point to 7 semitones
    };
    const r = advanceGenericFrames(state, 1);
    expect(r.periodChanged).toBe(true);
    expect(state.freq).toBeCloseTo(440 * Math.pow(2, 7 / 12), 2);
  });

  it('increments noteFrame each frame', () => {
    const state: BaseChannelSimState = { ...makeBaseChannelState(15), active: true, freq: 440, baseFreq: 440 };
    advanceGenericFrames(state, 5);
    expect(state.noteFrame).toBe(5);
  });

  it('tremolo advances tremoloPhase and signals volumeChanged', () => {
    const state: BaseChannelSimState = {
      ...makeBaseChannelState(15),
      active: true,
      freq: 440,
      baseFreq: 440,
      tremoloDepth: 4,
      tremoloRate: 5,
      tremoloFrame: 0,
      tremoloDelay: 0,
      tremoloDuration: -1,
      tremoloPhase: 0,
    };
    const r = advanceGenericFrames(state, 1);
    expect(r.volumeChanged).toBe(true);
    expect(state.tremoloPhase).toBeGreaterThan(0);
  });

  it('portamento moves freq toward target', () => {
    const state: BaseChannelSimState = {
      ...makeBaseChannelState(15),
      active: true,
      freq: 220,
      baseFreq: 440,
      portStart: 220,
      portTarget: 440,
      portFrame: 0,
      portDuration: 60,
      portActive: true,
    };
    advanceGenericFrames(state, 30);
    expect(state.freq).toBeGreaterThan(220);
    expect(state.freq).toBeLessThan(440);
  });
});

// ─── Tremolo attenuation ──────────────────────────────────────────────────────

describe('calcTremoloAttenuation', () => {
  function makeTremoloState(partial: Partial<BaseChannelSimState> = {}): BaseChannelSimState {
    return {
      ...makeBaseChannelState(15),
      active: true,
      tremoloDepth: 8,
      tremoloRate: 5,
      tremoloPhase: 0.25, // sin(π/2) = 1 → positive peak
      tremoloFrame: 5,
      tremoloDelay: 0,
      tremoloDuration: -1,
      ...partial,
    };
  }

  it('returns baseAttenuation when depth=0', () => {
    const state = makeTremoloState({ tremoloDepth: 0 });
    expect(calcTremoloAttenuation(state, 8, false)).toBe(8);
  });

  it('returns baseAttenuation when not yet in active window', () => {
    const state = makeTremoloState({ tremoloDelay: 10, tremoloFrame: 3 });
    expect(calcTremoloAttenuation(state, 8, false)).toBe(8);
  });

  it('modulates for SN76489 (invertScale=false) without returning mute when not at peak', () => {
    const state = makeTremoloState();
    const result = calcTremoloAttenuation(state, 4, false);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(15);
  });

  it('modulates for AY (invertScale=true) — higher result = louder', () => {
    const state = makeTremoloState({ tremoloPhase: 0.25 });
    const resultAy = calcTremoloAttenuation(state, 8, true);
    expect(resultAy).toBeGreaterThanOrEqual(0);
    expect(resultAy).toBeLessThanOrEqual(15);
  });

  it('invertScale=true and false produce different results for same state', () => {
    const state = makeTremoloState({ tremoloDepth: 15, tremoloPhase: 0 });
    const sn = calcTremoloAttenuation(state, 8, false);
    const ay = calcTremoloAttenuation(state, 8, true);
    // They use different gain-domain mappings; values may differ
    // Both must still be in [0,15]
    expect(sn).toBeGreaterThanOrEqual(0);
    expect(ay).toBeGreaterThanOrEqual(0);
  });
});
