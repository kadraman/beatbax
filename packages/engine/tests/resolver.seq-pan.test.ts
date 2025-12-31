import { parse } from '../src/parser/index.js';
import { resolveSong } from '../src/song/resolver.js';

describe('resolver — sequence-level pan transform', () => {
  test('applies :pan(...) transform to pattern occurrences', () => {
    const src = `
      inst bass type=pulse2 gb:pan=L
      pat bassline = C3 G2 C3 G2
      seq bass_seq = bassline bassline:pan(gb:R)
      channel 2 => inst bass seq bass_seq
    `;
    const ast = parse(src);
    const expandAll = require('../src/sequences/expand').expandAllSequences;
    const patsMap = { bassline: ['C3','G2','C3','G2'] };
    const seqsMap = { bass_seq: ['bassline', 'bassline:pan(gb:R)'] };
    const expanded = expandAll(seqsMap, patsMap, { bass: { type: 'pulse2' } });
    // expect pan token to be injected for second occurrence
    expect(expanded['bass_seq']).toBeDefined();
    expect(expanded['bass_seq'].slice(4,5)[0]).toMatch(/^pan\(.*\)$/i);

    const song = resolveSong(ast);
    const ch = song.channels.find(c => c.id === 2);
    expect(ch).toBeDefined();
    const events = ch!.events.filter(e => (e as any).type === 'note') as any[];
    expect(events.length).toBeGreaterThanOrEqual(8);

    // first occurrence should inherit instrument default L
    expect(events[0].pan).toBeDefined();
    expect(events[0].pan.enum).toBe('L');
    // second occurrence (index 4) should have pan override R
    expect(events[4].pan).toBeDefined();
    expect(events[4].pan.enum).toBe('R');
  });
});