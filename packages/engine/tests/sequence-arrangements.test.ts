import { parse } from '../src/parser';
import { resolveSong } from '../src/song/resolver';

describe('channel sequence arrangements (multi-sequence syntax)', () => {
  test('accepts comma-separated sequences on channel', () => {
    const src = `
      pat A = C4
      pat B = D4
      seq a = A
      seq b = B
      inst lead type=pulse1
      channel 1 => inst lead seq a,b
    `;
    const ast = parse(src);
    const song = resolveSong(ast);
    const ev = song.channels.find(c => c.id === 1)!.events.map(e => (e as any).token);
    expect(ev).toEqual(['C4', 'D4']);
  });

  test('accepts repetition using *N', () => {
    const src = `
      pat A = C4
      seq a = A
      channel 1 => seq a * 2
    `;
    const ast = parse(src);
    const song = resolveSong(ast);
    const ev = song.channels.find(c => c.id === 1)!.events.map(e => (e as any).token);
    expect(ev).toEqual(['C4', 'C4']);
  });

  test('accepts space-separated sequence list (e.g. "seq a b")', () => {
    const src = `
      pat A = C4
      pat B = D4
      seq a = A
      seq b = B
      channel 1 => seq a b
    `;
    const ast = parse(src);
    const song = resolveSong(ast);
    const ev = song.channels.find(c => c.id === 1)!.events.map(e => (e as any).token);
    expect(ev).toEqual(['C4', 'D4']);
  });
});
