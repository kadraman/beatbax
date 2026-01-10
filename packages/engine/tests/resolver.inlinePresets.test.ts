import { parse } from '../src/parser/index.js';
import { resolveSong } from '../src/song/resolver.js';

test('inline preset name expands to preset RHS', () => {
  const src = 'effect wobble = vib:4,8,sine,4\npat p = C5<wobble>\nchannel 1 => inst lead pat p\n';
  const ast = parse(src);
  const song = resolveSong(ast);
  expect(song.channels).toBeDefined();
  const ch = song.channels.find(c => c.id === 1);
  expect(ch).toBeDefined();
  // first event should be a note with an effects array containing vib
  const ev = (ch as any).events[0];
  expect(ev.type).toBe('note');
  expect(ev.effects).toBeDefined();
  const hasVib = ev.effects.some((e: any) => e.type === 'vib');
  expect(hasVib).toBe(true);
});
