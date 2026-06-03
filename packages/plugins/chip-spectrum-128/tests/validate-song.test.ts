import type { AST, InstrumentNode } from '@beatbax/engine';
import { chipRegistry } from '@beatbax/engine';
import { validateSong } from '../src/validate-song.js';
import { buildSoundingInstrumentsByTick } from '../src/validate-song-timeline.js';
import spectrumPlugin from '../src/index.js';

function makeInst(overrides: Partial<InstrumentNode>): InstrumentNode {
  return { type: 'tone1', ...overrides } as InstrumentNode;
}

/** Two channels with sustained overlapping notes (16 ticks). */
function overlapSong(
  insts: Record<string, InstrumentNode>,
  patA: string,
  patB: string,
): AST {
  const names = Object.keys(insts);
  const instA = names[0] ?? 'a';
  const instB = names[1] ?? 'b';
  return {
    chip: 'spectrum-128',
    bpm: 120,
    stepsPerBar: 4,
    pats: { line_a: patA.split(/\s+/), line_b: patB.split(/\s+/) },
    seqs: { seq_a: ['line_a'], seq_b: ['line_b'] },
    channels: [
      { id: 1, inst: instA, pat: 'seq_a' },
      { id: 2, inst: instB, pat: 'seq_b' },
    ],
    insts,
  };
}

describe('validateSong', () => {
  beforeAll(() => {
    if (!chipRegistry.has(spectrumPlugin.name)) {
      chipRegistry.register(spectrumPlugin);
    }
  });

  test('no errors without song timeline (instrument-only context)', () => {
    const errors = validateSong({
      instruments: {
        kick: makeInst({ type: 'tone3', noise_rate: 4 }),
        snare: makeInst({ type: 'tone2', noise_rate: 20 }),
      },
    });
    expect(errors).toHaveLength(0);
  });

  test('no errors when same noise_rate instruments overlap', () => {
    const errors = validateSong({
      instruments: {
        a: makeInst({ type: 'tone1', noise_rate: 10 }),
        b: makeInst({ type: 'tone2', noise_rate: 10 }),
      },
      song: overlapSong(
        {
          a: makeInst({ type: 'tone1', noise_rate: 10 }),
          b: makeInst({ type: 'tone2', noise_rate: 10 }),
        },
        'C4 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
        'C3 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
      ),
    });
    expect(errors).toHaveLength(0);
  });

  test('warns when overlapping instruments have different noise_rate values', () => {
    const errors = validateSong({
      instruments: {
        a: makeInst({ type: 'tone1', noise_rate: 4 }),
        b: makeInst({ type: 'tone2', noise_rate: 20 }),
      },
      song: overlapSong(
        {
          a: makeInst({ type: 'tone1', noise_rate: 4 }),
          b: makeInst({ type: 'tone2', noise_rate: 20 }),
        },
        'C4 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
        'C3 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _',
      ),
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('noise_rate');
    expect(errors[0].message).toMatch(/overlap on \d+ tick/);
    expect(errors[0].message).toContain('4');
    expect(errors[0].message).toContain('20');
  });

  test('no error when different noise_rate instruments play in separate sections', () => {
    const insts = {
      a: makeInst({ type: 'tone1', noise_rate: 4 }),
      b: makeInst({ type: 'tone2', noise_rate: 20 }),
    };
    const song: AST = {
      chip: 'spectrum-128',
      bpm: 120,
      stepsPerBar: 4,
      pats: {
        a_line: 'C4 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _'.split(/\s+/),
        b_line: 'C3 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _'.split(/\s+/),
        rest: '. . . . . . . . . . . . . . .'.split(/\s+/),
      },
      seqs: {
        a_only: ['a_line', 'rest', 'rest'],
        b_only: ['rest', 'rest', 'rest', 'b_line'],
      },
      channels: [
        { id: 1, inst: 'a', pat: 'a_only' },
        { id: 2, inst: 'b', pat: 'b_only' },
      ],
      insts,
    };
    const errors = validateSong({ instruments: insts, song });
    expect(errors).toHaveLength(0);
  });

  test('warns when overlapping instruments both use vol_env', () => {
    const insts = {
      lead: makeInst({ type: 'tone1', vol_env: [15, 10, 5, 0] as any }),
      bass: makeInst({ type: 'tone2', vol_env: [14, 10, 6, 0] as any }),
    };
    const errors = validateSong({
      instruments: insts,
      song: overlapSong(insts, 'C4 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _', 'C3 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _'),
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('vol_env');
    expect(errors[0].message).toMatch(/overlap on \d+ tick/);
  });

  test('no error when only one vol_env instrument sounds at a time', () => {
    const insts = {
      lead: makeInst({ type: 'tone1', vol_env: [15, 10, 5, 0] as any }),
      bass: makeInst({ type: 'tone2', vol: 14 }),
    };
    const errors = validateSong({
      instruments: insts,
      song: overlapSong(insts, 'C4 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _', 'C3 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _'),
    });
    expect(errors).toHaveLength(0);
  });

  test('warns when env_bass and vol_env overlap on the same ticks', () => {
    const insts = {
      buzz: makeInst({ type: 'tone3', env_bass: true }),
      lead: makeInst({ type: 'tone1', vol_env: [15, 10, 5, 0] as any }),
    };
    const errors = validateSong({
      instruments: insts,
      song: overlapSong(insts, 'C2 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _', 'C4 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _'),
    });
    const envBassError = errors.find(e => e.field === 'env_bass');
    expect(envBassError).toBeDefined();
    expect(envBassError!.message).toMatch(/env_bass and vol_env overlap/);
  });

  test('no env_bass vs vol_env warning when sections do not overlap', () => {
    const insts = {
      buzz: makeInst({ type: 'tone3', env_bass: true }),
      kick: makeInst({ type: 'tone3', vol_env: [15, 0] as any, noise_rate: 4 }),
    };
    const song: AST = {
      chip: 'spectrum-128',
      bpm: 120,
      stepsPerBar: 4,
      pats: {
        buzz: 'C2 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _'.split(/\s+/),
        kick: 'kick . . . kick . . . kick . . . . .'.split(/\s+/),
        rest: '. . . . . . . . . . . . . . .'.split(/\s+/),
      },
      seqs: {
        buzz_only: ['buzz', 'rest', 'rest'],
        kick_only: ['rest', 'rest', 'rest', 'kick'],
      },
      channels: [
        { id: 1, inst: 'buzz', pat: 'buzz_only' },
        { id: 2, inst: 'kick', pat: 'kick_only' },
      ],
      insts,
    };
    const errors = validateSong({ instruments: insts, song });
    expect(errors.find(e => e.field === 'env_bass')).toBeUndefined();
    expect(errors.find(e => e.field === 'vol_env')).toBeUndefined();
  });

  test('warns when overlapping env_bass instruments use different env_shape', () => {
    const insts = {
      buzz8: makeInst({ type: 'tone3', env_bass: true }),
      buzz10: makeInst({ type: 'tone2', env_bass: true, env_shape: 10 }),
    };
    const errors = validateSong({
      instruments: insts,
      song: overlapSong(insts, 'C2 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _', 'G1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _'),
    });
    const shapeError = errors.find(e => e.field === 'env_shape');
    expect(shapeError).toBeDefined();
    expect(shapeError!.message).toMatch(/Different env_shape values \(8, 10\)/);
    expect(shapeError!.message).toMatch(/overlap on \d+ tick/);
  });

  test('no env_shape warning when overlapping env_bass instruments share the same shape', () => {
    const insts = {
      bassA: makeInst({ type: 'tone3', env_bass: true, env_shape: 10 }),
      bassB: makeInst({ type: 'tone2', env_bass: true, env_shape: 10 }),
    };
    const errors = validateSong({
      instruments: insts,
      song: overlapSong(insts, 'C2 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _', 'G1 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _'),
    });
    expect(errors.find(e => e.field === 'env_shape')).toBeUndefined();
  });

  test('empty instruments map has no errors', () => {
    const errors = validateSong({ instruments: {} });
    expect(errors).toHaveLength(0);
  });

  test('macro tour layout — no env_bass false positive; drum tick overlaps warn', () => {
    const insts = {
      lead: makeInst({ type: 'tone1', arp_env: [0, 4, 7] as any }),
      bass: makeInst({ type: 'tone2', pitch_env: [0, -2, 0] as any }),
      pad: makeInst({ type: 'tone3' }),
      buzz: makeInst({ type: 'tone3', env_bass: true }),
      kick: makeInst({ type: 'tone3', noise_rate: 4, vol_env: [15, 0] as any, note: 'C3' }),
      snare: makeInst({ type: 'tone2', noise_rate: 6, vol_env: [15, 0] as any, note: 'E5' }),
      hatc: makeInst({ type: 'tone1', noise_rate: 2, vol_env: [15, 0] as any, note: 'E7' }),
    };
    const rest = '. . . . . . . . . . . . . . .'.split(/\s+/);
    const song: AST = {
      chip: 'spectrum-128',
      bpm: 128,
      stepsPerBar: 4,
      pats: {
        macro_lead: 'C4 E4 G4 C5 B4 G4 E4 C4 E4 G4 C5 B4 G4 E4 G4'.split(/\s+/),
        macro_bass: 'C2 . . . G1 . . . C2 . . . G1 . . .'.split(/\s+/),
        macro_pad: 'E3 . . . E3 . . . E3 . . . E3 . . .'.split(/\s+/),
        buzz_line: 'C2 _ _ _ _ _ _ _ G1 _ _ _ _ _ _ _'.split(/\s+/),
        rest_bar: rest,
        lane_hat: 'hatc . hatc . hatc . hatc . hatc . hatc . hatc . hatc .'.split(/\s+/),
        lane_snare: '. . snare . . . snare . . . snare . . . . .'.split(/\s+/),
        lane_kick: 'kick . . . kick . . kick . . . kick . . . .'.split(/\s+/),
      },
      seqs: {
        lead_tour: ['macro_lead', 'macro_lead', 'rest_bar', 'rest_bar', 'lane_hat'],
        bass_tour: ['macro_bass', 'macro_bass', 'rest_bar', 'rest_bar', 'lane_snare'],
        c_tour: ['macro_pad', 'macro_pad', 'buzz_line:inst(buzz)', 'rest_bar', 'lane_kick'],
      },
      channels: [
        { id: 1, inst: 'lead', pat: 'lead_tour' },
        { id: 2, inst: 'bass', pat: 'bass_tour' },
        { id: 3, inst: 'pad', pat: 'c_tour' },
      ],
      insts,
    };
    const errors = validateSong({ instruments: insts, song });
    expect(errors.find(e => e.field === 'env_bass')).toBeUndefined();
    expect(errors.some(e => e.field === 'noise_rate')).toBe(true);
  });

  test('sustained vol_env overlap reports tick locations', () => {
    const insts = {
      lead: makeInst({ type: 'tone1', vol_env: [15, 10, 5, 0] as any }),
      bass: makeInst({ type: 'tone2', vol_env: [14, 10, 6, 0] as any }),
    };
    const errors = validateSong({
      instruments: insts,
      song: overlapSong(insts, 'C4 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _', 'C3 _ _ _ _ _ _ _ _ _ _ _ _ _ _ _'),
    });
    expect(errors.some(e => e.field === 'vol_env')).toBe(true);
    expect(errors[0].message).toMatch(/overlap on \d+ tick/);
    expect(errors[0].message).toMatch(/bar \d+ step \d+/);
  });
});

describe('buildSoundingInstrumentsByTick', () => {
  test('carries instrument through sustain tokens', () => {
    const timeline = buildSoundingInstrumentsByTick([
      {
        id: 1,
        events: [
          { type: 'note', token: 'C4', instrument: 'lead' },
          { type: 'sustain' },
          { type: 'rest' },
        ],
      },
    ]);
    expect(timeline[0]).toEqual(['lead']);
    expect(timeline[1]).toEqual(['lead']);
    expect(timeline[2]).toEqual([]);
  });
});
