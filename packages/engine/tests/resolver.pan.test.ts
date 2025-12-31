import { parse } from '../src/parser/index.js';
import { resolveSong } from '../src/song/resolver.js';

describe('resolver — inline pan parsing', () => {
  test('parses inline enum and numeric pan values and attaches to NoteEvent', () => {
    const src = `
      inst sn type=noise
      pat p = C4<pan:L> _ C4<pan:-1.0> _ C4<gb:pan:R> _
      channel 1 => inst sn pat p
    `;
    const ast = parse(src);
    const song = resolveSong(ast);
    const ch = song.channels.find(c => c.id === 1);
    expect(ch).toBeDefined();
    const events = ch!.events.filter(e => (e as any).type === 'note') as any[];
    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(events[0].pan).toBeDefined();
    expect(events[0].pan.enum).toBe('L');
    expect(events[1].pan).toBeDefined();
    expect(typeof events[1].pan.value).toBe('number');
    expect(Math.abs(events[1].pan.value + 1) < 1e-6).toBeTruthy();
    expect(events[2].pan).toBeDefined();
    expect(events[2].pan.enum).toBe('R');
  });
});
