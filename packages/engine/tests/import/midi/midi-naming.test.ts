import { convertWith, expectVerifies, parseResult, patterns, rawNote } from './arrangement-helpers';

const drum = { midiChannel: 9, isDrum: true, program: 0 };

function names(source: string, kind: 'inst' | 'pat' | 'seq'): string[] {
  const re = new RegExp(`^${kind} (\\S+)`);
  return source.split('\n').flatMap((l) => {
    const m = re.exec(l);
    return m ? [m[1]!] : [];
  });
}

function channelLine(source: string, ch: number): string {
  return source.split('\n').find((l) => l.startsWith(`channel ${ch} =>`)) ?? '';
}

/** Lead on bars 1–3 (bar 2 repeats bar 1), bass on bars 1–2, drums on bar 1 only. */
function smallSong() {
  return parseResult([
    rawNote(0, 72, 0, 4, { program: 81 }),
    rawNote(0, 72, 16, 4, { program: 81 }),
    rawNote(0, 74, 32, 4, { program: 81 }),
    rawNote(1, 40, 0, 8, { program: 33 }),
    rawNote(1, 43, 16, 8, { program: 33 }),
    rawNote(9, 36, 0, 1, drum),
    rawNote(9, 38, 4, 1, drum),
  ]);
}

describe('090 generated names', () => {
  test('patterns are numbered per channel in play order, after the shared rest pattern', () => {
    const result = convertWith(smallSong(), {});
    expect(names(result.source, 'pat')).toEqual([
      'rest_x16_pat',
      'lead_01_pat',
      'lead_02_pat',
      'bass_01_pat',
      'bass_02_pat',
      'drums_01_pat',
    ]);
    const pats = patterns(result.source);
    expect(pats.get('rest_x16_pat')).toBe('.:16');
    expect(pats.get('lead_01_pat')).toBe('C5:4 .:12');
    expect(pats.get('lead_02_pat')).toBe('D5:4 .:12');
    expect(result.source).toMatch(/^seq lead_seq = lead_01_pat\*2 lead_02_pat$/m);
    expect(result.source).toMatch(/^seq bass_seq = bass_01_pat bass_02_pat rest_x16_pat$/m);
    expect(result.source).toMatch(/^seq drums_seq = drums_01_pat rest_x16_pat\*2$/m);
    expectVerifies(result.source);
  });

  test('generated melodic instruments end in _inst; drum instruments keep their token names', () => {
    const result = convertWith(smallSong(), {});
    const insts = names(result.source, 'inst');
    expect(insts).toEqual(expect.arrayContaining(['lead_p1_inst', 'bass_inst', 'kick', 'snare', 'hihat']));
    expect(insts.filter((n) => !n.endsWith('_inst'))).toEqual(['kick', 'snare', 'hihat', 'shaker', 'ghost', 'crash']);
    expect(channelLine(result.source, 1)).toBe('channel 1 => inst lead_p1_inst seq lead_seq');
    expect(channelLine(result.source, 3)).toBe('channel 3 => inst bass_inst seq bass_seq');
    expect(patterns(result.source).get('drums_01_pat')).toBe('kick .:3 snare .:11');
  });

  test('instrument names from the config are written unchanged', () => {
    const result = convertWith(smallSong(), {
      trackMappings: [
        { midiTrack: 0, target: 'pulse1', instrument: 'hero' },
        { midiTrack: 1, target: 'wave', instrument: 'bass' },
      ],
    });
    expect(channelLine(result.source, 1)).toBe('channel 1 => inst hero seq lead_seq');
    expect(channelLine(result.source, 3)).toBe('channel 3 => inst bass seq bass_seq');
    expect(names(result.source, 'inst')).toEqual(expect.arrayContaining(['hero', 'bass']));
  });

  test('the rest pattern is named after the bar length', () => {
    const parsed = parseResult([rawNote(0, 72, 0, 4), rawNote(0, 74, 32, 4)]);
    const result = convertWith(parsed, { ticksPerBeat: 3, patternTicks: 12 });
    expect(names(result.source, 'pat')[0]).toBe('rest_x12_pat');
    expect(patterns(result.source).get('rest_x12_pat')).toBe('.:12');
    expectVerifies(result.source);
  });

  test('a bar shared by two channels keeps the name of the channel that plays it first', () => {
    const parsed = parseResult([rawNote(0, 72, 0, 4), rawNote(1, 72, 16, 4)]);
    const result = convertWith(parsed, {
      packing: 'lanes',
      trackMappings: [
        { midiTrack: 0, target: 'pulse1' },
        { midiTrack: 1, target: 'pulse2' },
      ],
    });
    expect(names(result.source, 'pat')).toEqual(['rest_x16_pat', 'lead_01_pat']);
    expect(result.source).toMatch(/^seq arp_seq = rest_x16_pat lead_01_pat$/m);
  });

  test('numbers widen past 99 and every pattern of that channel uses the same width', () => {
    const notes = [];
    for (let i = 0; i < 100; i++) notes.push(rawNote(0, 48 + (i % 25), i * 16 + Math.floor(i / 25), 1));
    const result = convertWith(parseResult(notes), {});
    const pats = names(result.source, 'pat');
    expect(pats).toHaveLength(100);
    expect(pats[0]).toBe('lead_001_pat');
    expect(pats[99]).toBe('lead_100_pat');
    expect(pats.every((n) => /^lead_\d{3}_pat$/.test(n))).toBe(true);
  });

  test('sections are named <prefix>_sNN_seq', () => {
    const notes = [];
    for (let bar = 0; bar < 10; bar++) notes.push(rawNote(0, 72, bar * 16, 4));
    const result = convertWith(parseResult(notes), { sectionBars: 8 });
    expect(names(result.source, 'seq')).toEqual(['lead_s01_seq', 'lead_s02_seq']);
    expect(channelLine(result.source, 1)).toBe('channel 1 => inst lead_p1_inst seq lead_s01_seq lead_s02_seq');
  });

  test('no content hashes in names, and output is deterministic', () => {
    const a = convertWith(smallSong(), {}).source;
    const b = convertWith(smallSong(), {}).source;
    expect(a).toBe(b);
    const declared = [...names(a, 'pat'), ...names(a, 'seq'), ...names(a, 'inst')];
    expect(declared.filter((n) => /[0-9a-f]{8}/.test(n))).toEqual([]);
  });
});
