import { parse } from '../src/parser/index';
import { resolveSong } from '../src/song/resolver';

describe('playback defaultNote handling', () => {
  test('named events should have defaultNote field', () => {
    const script = `
      chip gameboy
      bpm 120
      inst kick type=pulse1 duty=12.5 env=15,down note=C2
      pat p = kick
      channel 1 => inst kick seq p
    `;
    const ast = parse(script);
    const song = resolveSong(ast);

    expect(song.channels).toHaveLength(1);
    const ch = song.channels[0];
    expect(ch.events).toHaveLength(1);

    const event = ch.events[0] as any;
    expect(event.type).toBe('named');
    expect(event.token).toBe('kick');
    expect(event.defaultNote).toBe('C2');
  });

  test('named events without note= should not have defaultNote', () => {
    const script = `
      chip gameboy
      bpm 120
      inst snare type=noise env=15,down
      pat p = snare
      channel 4 => inst snare seq p
    `;
    const ast = parse(script);
    const song = resolveSong(ast);

    const ch = song.channels[0];
    const event = ch.events[0] as any;
    expect(event.type).toBe('named');
    expect(event.defaultNote).toBeUndefined();
  });

  test('named events preserve defaultNote through sequence transforms', () => {
    const script = `
      chip gameboy
      bpm 120
      inst kick type=pulse1 duty=12.5 env=15,down note=C3
      pat p = kick . kick .
      seq s = p:rev
      channel 1 => inst kick seq s
    `;
    const ast = parse(script);
    const song = resolveSong(ast);

    const ch = song.channels[0];
    const namedEvents = ch.events.filter((e: any) => e.type === 'named');
    expect(namedEvents).toHaveLength(2);

    namedEvents.forEach((event: any) => {
      expect(event.defaultNote).toBe('C3');
    });
  });
});
