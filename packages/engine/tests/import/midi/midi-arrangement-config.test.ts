import { defaultConvertOptions, parseImportConfig, resolveConvertOptions } from '../../../src/import/midi';

describe('089 arrangement config parsing', () => {
  test('accepts every new field', () => {
    const cfg = parseImportConfig({
      packing: 'lanes',
      unmappedTracks: 'drop',
      bpm: 96,
      tempo: 'longest',
      startBar: 2,
      endBar: 40,
      nudge: -1,
      annotate: true,
      trackMappings: [
        { midiTrack: 5, target: 'pulse1', fromBar: 14, toBar: 29, mono: 'highest', transpose: -12, fold: [60, 84] },
        { midiTrack: 9, target: 'noise', include: [36, 38], exclude: [87, 88] },
      ],
    });
    expect(cfg.packing).toBe('lanes');
    expect(cfg.unmappedTracks).toBe('drop');
    expect(cfg.bpm).toBe(96);
    expect(cfg.tempo).toBe('longest');
    expect(cfg.startBar).toBe(2);
    expect(cfg.endBar).toBe(40);
    expect(cfg.nudge).toBe(-1);
    expect(cfg.annotate).toBe(true);
    expect(cfg.trackMappings![0]).toMatchObject({
      fromBar: 14,
      toBar: 29,
      mono: 'highest',
      transpose: -12,
      fold: [60, 84],
    });
    expect(cfg.trackMappings![1]).toMatchObject({ include: [36, 38], exclude: [87, 88] });
  });

  test('config without new fields resolves to 006 defaults', () => {
    const opts = resolveConvertOptions({ chip: 'gameboy', config: parseImportConfig({ ticksPerBeat: 4 }) });
    const base = defaultConvertOptions('gameboy');
    expect(opts.packing).toBe('streams');
    expect(opts.unmappedTracks).toBe('auto');
    expect(opts.tempo).toBe('first');
    expect(opts.nudge).toBe(0);
    expect(opts.annotate).toBe(false);
    expect(opts.bpm).toBeUndefined();
    expect(opts.startBar).toBeUndefined();
    expect(opts.endBar).toBeUndefined();
    expect(base.packing).toBe('streams');
  });

  test('CLI annotate flag wins over config', () => {
    const cfg = parseImportConfig({ annotate: false });
    expect(resolveConvertOptions({ chip: 'nes', config: cfg, annotate: true }).annotate).toBe(true);
    expect(resolveConvertOptions({ chip: 'nes', config: parseImportConfig({ annotate: true }) }).annotate).toBe(true);
  });

  test.each([
    [{ packing: 'columns' }, /packing must be one of streams\|lanes/],
    [{ unmappedTracks: 'hide' }, /unmappedTracks must be one of auto\|drop/],
    [{ tempo: 'average' }, /tempo must be one of first\|longest/],
    [{ bpm: 0 }, /bpm must be a number > 0/],
    [{ bpm: '96' }, /bpm must be a number > 0/],
    [{ startBar: 0 }, /startBar must be an integer >= 1/],
    [{ endBar: 1.5 }, /endBar must be an integer >= 1/],
    [{ startBar: 10, endBar: 4 }, /endBar \(4\) must be >= startBar \(10\)/],
    [{ nudge: 0.5 }, /nudge must be an integer/],
    [{ annotate: 'yes' }, /annotate must be true or false/],
  ])('rejects invalid top-level field %j', (raw, msg) => {
    expect(() => parseImportConfig(raw)).toThrow(msg);
  });

  test.each([
    [{ target: 'pulse1', fromBar: 0 }, /trackMappings\[0\]\.fromBar must be an integer >= 1/],
    [{ target: 'pulse1', toBar: -2 }, /trackMappings\[0\]\.toBar must be an integer >= 1/],
    [{ target: 'pulse1', fromBar: 30, toBar: 14 }, /trackMappings\[0\]\.fromBar \(30\) must be <= toBar \(14\)/],
    [{ target: 'pulse1', mono: 'top' }, /trackMappings\[0\]\.mono must be one of earliest\|highest\|lowest\|newest/],
    [{ target: 'pulse1', transpose: 1.5 }, /trackMappings\[0\]\.transpose must be an integer/],
    [{ target: 'noise', transpose: 12 }, /trackMappings\[0\]\.transpose is only allowed on melodic targets/],
    [{ target: 'pulse1', fold: [60, 70] }, /fold range must span at least 12 semitones/],
    [{ target: 'pulse1', fold: [60] }, /trackMappings\[0\]\.fold must be \[lo, hi\]/],
    [{ target: 'pulse1', fold: [-1, 20] }, /trackMappings\[0\]\.fold\[0\] must be an integer in 0–127/],
    [{ target: 'pulse1', fold: [100, 128] }, /trackMappings\[0\]\.fold\[1\] must be an integer in 0–127/],
    [{ target: 'dmc', fold: [36, 60] }, /trackMappings\[0\]\.fold is only allowed on melodic targets/],
    [{ target: 'pulse2', include: [36] }, /trackMappings\[0\]\.include is only allowed on noise or dmc targets/],
    [{ target: 'wave', exclude: [36] }, /trackMappings\[0\]\.exclude is only allowed on noise or dmc targets/],
    [{ target: 'noise', exclude: [200] }, /trackMappings\[0\]\.exclude\[0\] must be an integer in 0–127/],
    [{ target: 'noise', include: 36 }, /trackMappings\[0\]\.include must be an array/],
  ])('rejects invalid mapping %j', (mapping, msg) => {
    expect(() => parseImportConfig({ trackMappings: [{ midiTrack: 0, ...mapping }] })).toThrow(msg);
  });

  test('unknown keys remain ignored', () => {
    expect(() => parseImportConfig({ somethingElse: 1, trackMappings: [{ target: 'pulse1', extra: true }] })).not.toThrow();
  });
});
