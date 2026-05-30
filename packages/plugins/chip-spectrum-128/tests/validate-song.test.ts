import { validateSong } from '../src/validate-song.js';
import type { InstrumentNode } from '@beatbax/engine';

function makeInst(overrides: Partial<InstrumentNode>): InstrumentNode {
  return { type: 'tone1', ...overrides } as InstrumentNode;
}

describe('validateSong', () => {
  test('no errors for a clean song with unique noise_rate', () => {
    const errors = validateSong({
      instruments: {
        kick: makeInst({ type: 'tone3', noise_rate: 10 }),
        snare: makeInst({ type: 'tone2', noise_rate: 10 }),
      },
    });
    expect(errors).toHaveLength(0);
  });

  test('warns when two instruments have different noise_rate values', () => {
    const errors = validateSong({
      instruments: {
        kick: makeInst({ type: 'tone3', noise_rate: 4 }),
        snare: makeInst({ type: 'tone2', noise_rate: 20 }),
      },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('noise_rate');
    expect(errors[0].message).toMatch(/different noise_rate/);
    expect(errors[0].message).toContain('4');
    expect(errors[0].message).toContain('20');
  });

  test('no error when only one instrument uses noise_rate', () => {
    const errors = validateSong({
      instruments: {
        kick: makeInst({ type: 'tone3', noise_rate: 10 }),
        lead: makeInst({ type: 'tone1', vol: 12 }),
      },
    });
    expect(errors).toHaveLength(0);
  });

  test('warns when multiple instruments define vol_env', () => {
    const errors = validateSong({
      instruments: {
        lead: makeInst({ type: 'tone1', vol_env: [15, 10, 5, 0] as any }),
        harm: makeInst({ type: 'tone2', vol_env: [12, 8, 0] as any }),
      },
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('vol_env');
    expect(errors[0].message).toMatch(/single hardware envelope/);
  });

  test('no error when only one instrument has vol_env', () => {
    const errors = validateSong({
      instruments: {
        lead: makeInst({ type: 'tone1', vol_env: [15, 10, 5, 0] as any }),
        bass: makeInst({ type: 'tone2', vol: 14 }),
      },
    });
    expect(errors).toHaveLength(0);
  });

  test('warns when env_bass and vol_env are both defined', () => {
    const errors = validateSong({
      instruments: {
        bass: makeInst({ type: 'tone3', env_bass: true }),
        lead: makeInst({ type: 'tone1', vol_env: [15, 10, 5, 0] as any }),
      },
    });
    const envBassError = errors.find(e => e.field === 'env_bass');
    expect(envBassError).toBeDefined();
    expect(envBassError!.message).toMatch(/env_bass.*vol_env/);
  });

  test('env_bass alone does not trigger vol_env conflict', () => {
    const errors = validateSong({
      instruments: {
        bass: makeInst({ type: 'tone3', env_bass: true }),
        lead: makeInst({ type: 'tone1', vol: 12 }),
      },
    });
    const volEnvError = errors.find(e => e.field === 'vol_env');
    expect(volEnvError).toBeUndefined();
    const envBassError = errors.find(e => e.field === 'env_bass');
    expect(envBassError).toBeUndefined();
  });

  test('multiple conflicts are all reported', () => {
    const errors = validateSong({
      instruments: {
        kick: makeInst({ type: 'tone3', noise_rate: 4 }),
        snare: makeInst({ type: 'tone2', noise_rate: 20 }),
        lead: makeInst({ type: 'tone1', vol_env: [15, 0] as any }),
        harm: makeInst({ type: 'tone1', vol_env: [10, 0] as any }),
      },
    });
    expect(errors.length).toBeGreaterThanOrEqual(2);
    const fields = errors.map(e => e.field);
    expect(fields).toContain('noise_rate');
    expect(fields).toContain('vol_env');
  });

  test('empty instruments map has no errors', () => {
    const errors = validateSong({ instruments: {} });
    expect(errors).toHaveLength(0);
  });
});
