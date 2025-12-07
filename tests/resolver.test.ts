import { parse } from '../src/parser';
import { resolveSong } from '../src/song/resolver';

describe('song.resolver', () => {
  test('expands sequences and applies transposition modifiers', () => {
    const src = `
      pat A = C4 D4
      pat B = E4
      seq main = A B:oct(-1)
      channel 3 => inst wave1 seq main bpm=140
    `;
    const ast = parse(src);
    const song = resolveSong(ast as any);
    const ch = song.channels.find(c => c.id === 3)!;
    // tokens should be: A tokens, B transposed down one octave
    const tokens = ch.events.map(e => (e.type === 'note' ? e.token : '.'));
    expect(tokens).toEqual(['C4', 'D4', 'E3']);
    expect(ch.bpm).toBe(140);
  });

  test('instrument precedence: sequence-level override then pattern temporary override', () => {
    const src = `
      inst lead type=pulse1
      inst seqi type=pulse2
      inst temp type=pulse2

      pat P = C4 inst(temp,1) D4 E4
      seq s = P:inst(seqi)
      channel 1 => inst lead seq s bpm=110
    `;
    const ast = parse(src);
    const song = resolveSong(ast as any);
    const ch = song.channels.find(c => c.id === 1)!;

    // events should be: C4 (seqi), D4 (temp), E4 (seqi)
    const insts = ch.events.map(e => (e.type === 'note' ? e.instrument : undefined));
    expect(insts[0]).toBe('seqi');
    expect(insts[1]).toBe('temp');
    expect(insts[2]).toBe('seqi');
  });

  test('temporary override count does not decrement on rests', () => {
    const src = `
      inst lead type=pulse1
      inst temp type=pulse2
      pat Q = inst(temp,2) C4 . D4 E4
      channel 2 => inst lead pat Q bpm=120
    `;
    const ast = parse(src);
    const song = resolveSong(ast as any);
    const ch = song.channels.find(c => c.id === 2)!;

    // expect: C4 uses temp (count->1), '.' does not decrement, D4 uses temp (count->0), E4 uses default
    const entries = ch.events.map(e => ({ type: e.type, token: (e as any).token, inst: (e as any).instrument }));
    expect(entries[0].inst).toBe('temp');
    expect(entries[1].type).toBe('rest');
    expect(entries[2].inst).toBe('temp');
    expect(entries[3].inst).toBe('lead');
  });
});
