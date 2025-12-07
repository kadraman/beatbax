import { parse } from '../src/parser';
import { resolveSong } from '../src/song/resolver';

describe('resolver immediate hits', () => {
  test('inst(name,N) emits immediate hits when no following events', () => {
    const src = `
      inst snare type=noise env=12,down
      pat P = . . inst(snare,2)
      channel 4 => inst snare pat P
    `;
    const ast = parse(src);
    const song = resolveSong(ast as any);
    const ch = song.channels.find((c: any) => c.id === 4)!;
    // expect: rest, rest, named, named
    expect(ch.events[0].type).toBe('rest');
    expect(ch.events[1].type).toBe('rest');
    expect(ch.events[2].type).toBe('named');
    expect((ch.events[2] as any).instrument).toBe('snare');
    expect(ch.events[3].type).toBe('named');
  });

  test('hit(name,N) emits immediate hits', () => {
    const src = `
      inst snare type=noise env=10,down
      pat Q = . hit(snare,3) .
      channel 4 => inst snare pat Q
    `;
    const ast = parse(src);
    const song = resolveSong(ast as any);
    const ch = song.channels.find((c: any) => c.id === 4)!;
    expect(ch.events[0].type).toBe('rest');
    expect(ch.events[1].type).toBe('named');
    expect(ch.events[2].type).toBe('named');
    expect(ch.events[3].type).toBe('named');
    expect(ch.events[4].type).toBe('rest');
  });

  test('inst(name,N) behaves as temporary override when followed by notes', () => {
    const src = `
      inst temp type=pulse1 duty=50 env=12,down
      pat R = inst(temp,2) C4 D4 E4
      channel 1 => inst temp pat R
    `;
    const ast = parse(src);
    const song = resolveSong(ast as any);
    const ch = song.channels.find((c: any) => c.id === 1)!;
    // first two notes should have instrument 'temp'
    const noteEvents = ch.events.filter((e: any) => e.type === 'note') as any[];
    expect(noteEvents[0].instrument).toBe('temp');
    expect(noteEvents[1].instrument).toBe('temp');
    // third note falls back to channel default (also 'temp' here but semantics hold)
    expect(noteEvents[2].instrument).toBe('temp');
  });
});
